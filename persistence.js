'use strict';
const fs = require('node:fs');
const { basename, join } = require('node:path');

// A durable redo record makes the existing JSON files one recoverable checkpoint.
// Recovery runs before any store is opened. A corrupt journal is preserved and stops startup.
function recoverSaveGroup(directory, names) {
  const journal = join(directory, 'save-journal.json');
  if (!fs.existsSync(journal)) return;
  const record = JSON.parse(fs.readFileSync(journal, 'utf8'));
  if (record.version !== 1 || !record.stores || names.some(name => !Object.hasOwn(record.stores, name) || !record.stores[name] || typeof record.stores[name] !== 'object' || Array.isArray(record.stores[name]))) throw new Error('Invalid save journal; files preserved.');
  for (const name of names) {
    const file = join(directory, name), temporary = file + '.recovery.tmp';
    fs.writeFileSync(temporary, JSON.stringify(record.stores[name]), { mode: 0o600 });
    fs.renameSync(temporary, file);
  }
  fs.unlinkSync(journal);
}

function coordinateSaves({ directory, stores, beforeSave = () => {} }) {
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
        const record = JSON.parse(JSON.stringify({ version: 1, stores: Object.fromEntries(Object.entries(stores).map(([name, store]) => [name, store.data])) }));
        const temporary = journal + '.tmp';
        await fs.promises.writeFile(temporary, JSON.stringify(record), { mode: 0o600 });
        await fs.promises.rename(temporary, journal);
        for (const [name, writer] of Object.entries(writers)) await writer(record.stores[name]);
        await fs.promises.unlink(journal);
      } while (dirty);
    }).finally(() => { pending = null; });
    return pending;
  }
  for (const store of Object.values(stores)) store.save = save;
  return save;
}
const { mapOf } = require('./game-world');

function openJsonStore(file) {
  const data = Object.create(null);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Expected a JSON object');
    }
    Object.assign(data, parsed);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error('Could not load ' + basename(file) + '. The existing file was preserved.', { cause: error });
    }
  }

  async function writeNow(snapshot) {
    const temporaryFile = file + '.' + process.pid + '.tmp';
    try {
      await fs.promises.writeFile(temporaryFile, JSON.stringify(snapshot), { mode: 0o600 });
      await fs.promises.rename(temporaryFile, file);
    } catch (error) {
      await fs.promises.unlink(temporaryFile).catch(() => {});
      throw new Error('Could not save ' + basename(file), { cause: error });
    }
  }
  // Saves of one store run one after another: two at once would fight over the same temporary file.
  let lastSave = Promise.resolve();
  function save(snapshot = data) {
    const next = lastSave.catch(() => {}).then(() => writeNow(snapshot));
    lastSave = next;
    return next;
  }
  return { data, save };
}

function createGameSaves({ players, saveStore, pluginStore, extraStores = [] }) {
  const saves = saveStore.data;

  function savePlayer(player) {
    saves[player.name.toLowerCase()] = {
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
