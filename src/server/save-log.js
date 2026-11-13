'use strict';
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const digest = text => createHash('sha256').update(text).digest('hex');
function encodeTransaction(stores) {
  const data = JSON.stringify({ version: 2, stores });
  return JSON.stringify({ data, sha256: digest(data) }) + '\n';
}
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function validateTransaction(record, names) {
  if (record.version !== 2 || !object(record.stores) || Object.keys(record.stores).length !== names.length) throw Error('Invalid save log transaction; files preserved.');
  for (const name of names) {
    const change = record.stores[name];
    if (!object(change) || (typeof change.replace !== 'string' && (!object(change.set) || !Array.isArray(change.remove) || change.remove.some(key => typeof key !== 'string')))) throw Error('Invalid save log change; files preserved.');
    if (typeof change.replace === 'string') { if (!object(JSON.parse(change.replace))) throw Error('Invalid replacement store'); }
    else for (const value of Object.values(change.set)) JSON.parse(value);
  }
}
// A missing final newline is an unacknowledged interrupted append. Complete bad
// records (including checksum mismatches) fail closed instead of discarding data.
function readTransactions(file, names) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8'), lines = text.split('\n'); lines.pop();
  return lines.map(line => {
    const envelope = JSON.parse(line);
    if (typeof envelope.data !== 'string' || envelope.sha256 !== digest(envelope.data)) throw Error('Invalid save log checksum; files preserved.');
    const record = JSON.parse(envelope.data); validateTransaction(record, names); return record;
  });
}
function applyChanges(stores, changes) {
  for (const [name, change] of Object.entries(changes)) {
    if (typeof change.replace === 'string') stores[name] = JSON.parse(change.replace);
    else { for (const key of change.remove) delete stores[name][key]; for (const [key, value] of Object.entries(change.set)) Object.defineProperty(stores[name], key, { value: JSON.parse(value), configurable: true, enumerable: true, writable: true }); }
  }
}
module.exports = { encodeTransaction, readTransactions, validateTransaction, applyChanges };
