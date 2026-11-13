'use strict';
const fs = require('node:fs'), path = require('node:path');
const { parentPort, workerData } = require('node:worker_threads');
const { replaceFile, syncDirectory } = require('./durable-files');
const { encodeTransaction } = require('./save-log');
const { directory, names, compactTransactions = 128, compactBytes = 8 * 1024 * 1024 } = workerData;
const log = path.join(directory, 'save-log.jsonl'), journal = path.join(directory, 'save-journal.json');
const records = Object.create(null);
let transactions = 0, bytes = 0, failure;
if (fs.existsSync(log) && fs.statSync(log).size) throw Error('Save log recovery must run before opening the persistence worker');
for (const name of names) {
  let data = {}; try { data = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  records[name] = new Map(Object.entries(data).map(([key, value]) => [key, JSON.stringify(value)]));
}
function apply(changes) {
  for (const name of names) {
    const change = changes[name];
    if (typeof change.replace === 'string') records[name] = new Map(Object.entries(JSON.parse(change.replace)).map(([key, value]) => [key, JSON.stringify(value)]));
    else { for (const key of change.remove) records[name].delete(key); for (const [key, text] of Object.entries(change.set)) records[name].set(key, text); }
  }
}
function changedRecords(changes) {
  let changed = false;
  const filtered = Object.create(null);
  for (const name of names) {
    const change = changes[name], previous = records[name];
    if (typeof change.replace === 'string') {
      const values = Object.entries(JSON.parse(change.replace));
      const same = values.length === previous.size && values.every(([key, value]) => previous.get(key) === JSON.stringify(value));
      if (!same) { filtered[name] = change; changed = true; }
      else filtered[name] = { set: {}, remove: [] };
    } else {
      const set = Object.fromEntries(Object.entries(change.set).filter(([key, text]) => previous.get(key) !== text)), remove = change.remove.filter(key => previous.has(key));
      filtered[name] = { set, remove }; if (Object.keys(set).length || remove.length) changed = true;
    }
  }
  return changed ? filtered : null;
}
function checkpoint() {
  // Full legacy JSON serialization/compaction happens here, never on the game thread.
  const strings = Object.fromEntries(names.map(name => [name, '{' + [...records[name]].map(([key, text]) => JSON.stringify(key) + ':' + text).join(',') + '}']));
  const redo = '{"version":1,"stores":{' + names.map(name => JSON.stringify(name) + ':' + strings[name]).join(',') + '}}';
  replaceFile(journal, redo);
  for (const name of names) replaceFile(path.join(directory, name), strings[name]);
  // Keep the log until all stores are safely replaced; redo and log replay are idempotent.
  replaceFile(log, ''); fs.unlinkSync(journal); syncDirectory(directory);
  transactions = bytes = 0;
}
parentPort.on('message', ({ id, changes, compact }) => {
  try {
    if (failure) throw failure;
    const updates = changes && changedRecords(changes);
    if (updates) {
      const line = encodeTransaction(updates), fd = fs.openSync(log, 'a', 0o600);
      try { fs.writeFileSync(fd, line); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      syncDirectory(directory); apply(updates); bytes += Buffer.byteLength(line); transactions++;
    }
    if (compact || transactions >= compactTransactions || bytes >= compactBytes) checkpoint();
    parentPort.postMessage({ id });
  } catch (error) {
    // No further appends after an uncertain write; restart/recovery must establish a clean boundary.
    failure = error; parentPort.postMessage({ id, error: error.message });
  }
});
