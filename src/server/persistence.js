'use strict';
const fs = require('node:fs');
const { basename, join, resolve } = require('node:path');
const { Worker } = require('node:worker_threads');
const { replaceFile, syncDirectory } = require('./durable-files');
const { readTransactions, applyChanges } = require('./save-log');

// A durable redo record makes the existing JSON files one recoverable checkpoint.
// Recovery runs before any store is opened. A corrupt journal is preserved and stops startup.
function recoverSaveGroup(directory, names) {
  const journal = join(directory, 'save-journal.json');
  if (fs.existsSync(journal)) {
    const record = JSON.parse(fs.readFileSync(journal, 'utf8'));
    if (record.version !== 1 || !record.stores || names.some(name => !Object.hasOwn(record.stores, name) || !record.stores[name] || typeof record.stores[name] !== 'object' || Array.isArray(record.stores[name]))) throw new Error('Invalid save journal; files preserved.');
    for (const name of names) replaceFile(join(directory, name), JSON.stringify(record.stores[name]));
    fs.unlinkSync(journal); syncDirectory(directory);
  }
  const log = join(directory, 'save-log.jsonl');
  if (!fs.existsSync(log)) return;
  const transactions = readTransactions(log, names);
  if (transactions.length) {
    const stores = Object.create(null);
    for (const name of names) {
      let data = {}; try { data = JSON.parse(fs.readFileSync(join(directory, name), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Invalid base store; recovery files preserved.');
      stores[name] = data;
    }
    for (const record of transactions) applyChanges(stores, record.stores);
    // Upgrade recovery remains readable by the original v1 journal implementation.
    replaceFile(journal, JSON.stringify({ version: 1, stores }));
    for (const name of names) replaceFile(join(directory, name), JSON.stringify(stores[name]));
  }
  replaceFile(log, '');
  if (fs.existsSync(journal)) fs.unlinkSync(journal);
  syncDirectory(directory);
}

function coordinateSaves({ directory, stores, beforeSave = () => {}, background = false, debounceMs = 25, compactTransactions, compactBytes }) {
  if (background) return coordinateBackgroundSaves({ directory, stores, beforeSave, debounceMs, compactTransactions, compactBytes });
  const writers = Object.fromEntries(Object.entries(stores).map(([name, store]) => [name, store.save]));
  const journal = join(directory, 'save-journal.json');
  let pending, dirty = false;
  function save() {
    dirty = true;
    if (pending) return pending;
    // Run on the next microtask so synchronous world events and their wallet mutations settle together.
    pending = Promise.resolve().then(async () => {
      do {
        dirty = false;
        beforeSave();
        const strings = Object.fromEntries(Object.entries(stores).map(([name, store]) => [name, JSON.stringify(store.data)]));
        const temporary = journal + '.tmp';
        await fs.promises.writeFile(temporary, '{"version":1,"stores":{' + Object.entries(strings).map(([name, text]) => JSON.stringify(name) + ':' + text).join(',') + '}}', { mode: 0o600 });
        await fs.promises.rename(temporary, journal);
        for (const [name, writer] of Object.entries(writers)) {
          if (stores[name].writeString) await stores[name].writeString(strings[name]);
          else await writer(JSON.parse(strings[name]));
        }
        await fs.promises.unlink(journal);
      } while (dirty);
    }).finally(() => { pending = null; });
    return pending;
  }
  for (const store of Object.values(stores)) store.save = save;
  return save;
}
const { mapOf } = require('../world/game-world');

function openJsonStore(file, { tracked = false } = {}) {
  const initial = Object.create(null), dirtyKeys = new Set();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Expected a JSON object');
    }
    Object.assign(initial, parsed);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error('Could not load ' + basename(file) + '. The existing file was preserved.', { cause: error });
    }
  }

  const data = tracked ? new Proxy(initial, {
    set(target, key, value) { target[key] = value; dirtyKeys.add(key); return true; },
    deleteProperty(target, key) { delete target[key]; dirtyKeys.add(key); return true; },
  }) : initial;
  async function writeNow(text) {
    const temporaryFile = file + '.' + process.pid + '.tmp';
    try {
      await fs.promises.writeFile(temporaryFile, text, { mode: 0o600 });
      await fs.promises.rename(temporaryFile, file);
    } catch (error) {
      await fs.promises.unlink(temporaryFile).catch(() => {});
      throw new Error('Could not save ' + basename(file), { cause: error });
    }
  }
  // Saves of one store run one after another: two at once would fight over the same temporary file.
  let lastSave = Promise.resolve();
  function writeString(text) {
    const next = lastSave.catch(() => {}).then(() => writeNow(text));
    lastSave = next;
    return next;
  }
  function save(snapshot = data) { return writeString(JSON.stringify(snapshot)); }
  return { data, save, writeString, drain: () => lastSave, file, dirtyKeys: tracked ? dirtyKeys : null };
}

function coordinateBackgroundSaves({ directory, stores, beforeSave, debounceMs, compactTransactions, compactBytes }) {
  const names = Object.keys(stores);
  if (!names.length || names.some(name => basename(name) !== name || !stores[name].file || resolve(stores[name].file) !== resolve(directory, name))) throw Error('Background persistence requires matching named JSON file stores in one directory');
  let worker, workerFailure, pending, draining, dirty = false, nextId = 0;
  const requests = new Map();
  function fail(error) { workerFailure = error; for (const job of requests.values()) job.reject(error); requests.clear(); worker?.unref(); }
  function request(message) {
    // Founding/settlement initialization can queue standalone writes before the
    // coordinator is installed. Drain them before the worker owns these files.
    draining ||= Promise.all(Object.values(stores).map(store => store.drain?.()));
    return draining.then(() => requestReady(message));
  }
  function requestReady(message) {
    if (workerFailure) return Promise.reject(workerFailure);
    if (!worker) {
      worker = new Worker(join(__dirname, 'persistence-worker.js'), { workerData: { directory, names, compactTransactions, compactBytes } });
      worker.on('message', result => {
        const job = requests.get(result.id); if (!job) return;
        requests.delete(result.id);
        if (result.error) { const error = new Error('Persistence worker: ' + result.error); job.reject(error); fail(error); }
        else job.resolve();
        if (!requests.size) worker.unref();
      });
      worker.on('error', fail);
      worker.on('exit', code => fail(new Error('Persistence worker stopped (' + code + ')')));
    }
    worker.ref(); const id = ++nextId;
    return new Promise((resolve, reject) => { requests.set(id, { resolve, reject }); worker.postMessage({ id, ...message }); });
  }
  function save() {
    dirty = true;
    if (pending) return pending;
    pending = (async () => {
      do {
        await new Promise(resolve => setTimeout(resolve, debounceMs));
        dirty = false; beforeSave();
        const changes = Object.create(null), captured = [];
        try {
          for (const name of names) {
            const store = stores[name];
            if (!store.dirtyKeys) changes[name] = { replace: JSON.stringify(store.data) };
            else {
              const set = Object.create(null), remove = [], keys = [...store.dirtyKeys];
              for (const key of keys) {
                const text = Object.hasOwn(store.data, key) ? JSON.stringify(store.data[key]) : undefined;
                if (text === undefined) remove.push(key); else set[key] = text;
              }
              changes[name] = { set, remove }; captured.push([store, keys]);
            }
          }
          for (const [store, keys] of captured) for (const key of keys) store.dirtyKeys.delete(key);
          await request({ changes });
        } catch (error) {
          for (const [store, keys] of captured) for (const key of keys) store.dirtyKeys.add(key);
          throw error;
        }
      } while (dirty);
    })().finally(() => { pending = null; });
    return pending;
  }
  save.checkpoint = async () => { await save(); await request({ compact: true }); };
  save.close = async () => { if (pending) await pending; if (worker) { const current = worker; worker = null; await current.terminate(); } };
  for (const store of Object.values(stores)) store.save = save;
  return save;
}

function createGameSaves({ players, saveStore, pluginStore, extraStores = [] }) {
  const saves = saveStore.data;

  function savePlayer(player) {
    const key = player.saveKey || player.name.toLowerCase(); // GM characters: "gm:<account>" (src/player/gm-service.js)
    saves[key] = {
      ...saves[key],
      ph: player.ph, data: player.data, name: player.name, cls: player.cls, lvl: player.lvl, xp: player.xp,
      gold: player.gold, souls: player.souls || 0, inv: player.inv, bag: player.bag, eq: player.eq, sk: player.sk, sp: player.sp,
      map: mapOf(player).index, x: player.x - mapOf(player).x0, y: player.y - mapOf(player).y0, hp: player.hp, mp: player.mp, dead: player.dead, buf: player.buf,
      cd: player.cd, cd1: player.cd1, cd2: player.cd2, cd3: player.cd3, potCd: player.potCd,
    };
  }
  function saveAll() {
    for (const player of players.values()) savePlayer(player);
    return Promise.allSettled([saveStore.save(), pluginStore.save(), ...extraStores.map(store => store.save())]).then(results => {
      for (const result of results) if (result.status === 'rejected') console.error(result.reason);
      return results.every(result => result.status === 'fulfilled');
    });
  }

  return { savePlayer, saveAll };
}

module.exports = { openJsonStore, createGameSaves, coordinateSaves, recoverSaveGroup };
