'use strict';
// Shared server/browser patch format for low-frequency UI state. Numeric operations:
// 0 = replace field, 1 = remove field, 2 = update a keyed list (plus optional order).
const StateDelta = (() => {
  const channels = new Set(['inv', 'team', 'trade', 'universe']);
  const listKeys = { bag: 'uid', members: 'id', items: 'uid', history: 'id', regions: 'tier', legends: 'name' };
  const clone = value => JSON.parse(JSON.stringify(value));
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function diff(old, value, path = [], ops = []) {
    if (equal(old, value)) return ops;
    const key = listKeys[path[path.length - 1]];
    if (key && Array.isArray(old) && Array.isArray(value) && [old, value].every(list => list.every(row => object(row) && Object.hasOwn(row, key)) && new Set(list.map(row => row[key])).size === list.length)) {
      const previous = new Map(old.map(row => [row[key], row])), next = new Map(value.map(row => [row[key], row]));
      const set = value.filter(row => !previous.has(row[key]) || !equal(previous.get(row[key]), row));
      const removed = old.filter(row => !next.has(row[key])).map(row => row[key]);
      const natural = old.filter(row => next.has(row[key])).map(row => row[key]).concat(value.filter(row => !previous.has(row[key])).map(row => row[key]));
      const order = value.map(row => row[key]);
      ops.push([2, path, key, set, removed, ...(equal(natural, order) ? [] : [order])]);
    } else if (object(old) && object(value)) {
      for (const key of Object.keys(old)) if (!Object.hasOwn(value, key)) ops.push([1, path.concat(key)]);
      for (const key of Object.keys(value)) diff(old[key], value[key], path.concat(key), ops);
    } else ops.push([0, path, value]);
    return ops;
  }
  function apply(state, ops) {
    let result = clone(state);
    for (const [op, path, value, set, removed, order] of ops) {
      if (!Array.isArray(path) || path.some(key => ['__proto__', 'prototype', 'constructor'].includes(key))) throw Error('Invalid patch path');
      if (!path.length) { if (op !== 0) throw Error('Invalid root patch'); result = clone(value); continue; }
      let parent = result;
      for (const key of path.slice(0, -1)) { if (!object(parent) || !Object.hasOwn(parent, key)) throw Error('Missing patch parent'); parent = parent[key]; }
      const field = path[path.length - 1];
      if (op === 0) parent[field] = clone(value);
      else if (op === 1) delete parent[field];
      else if (op === 2) {
        if (!Array.isArray(parent[field])) throw Error('Missing list baseline');
        const rows = new Map(parent[field].map(row => [row[value], row]));
        for (const id of removed) rows.delete(id);
        for (const row of set) rows.set(row[value], clone(row));
        if (order && (order.length !== rows.size || new Set(order).size !== rows.size || order.some(id => !rows.has(id)))) throw Error('Invalid list order');
        parent[field] = order ? order.map(id => rows.get(id)) : [...rows.values()];
      } else throw Error('Invalid patch operation');
    }
    return result;
  }
  function createSender(rawSend, clock = Date.now) {
    const connections = new WeakMap();
    function send(connection, message, force = false) {
      if (!connection.uiDeltas || !channels.has(message.t)) return rawSend(connection, message);
      let states = connections.get(connection); if (!states) connections.set(connection, states = new Map());
      const now = clock(), previous = states.get(message.t), state = clone(message), version = (previous?.version || 0) + 1;
      const full = force || !previous || now - previous.fullAt >= 30000;
      const ops = full ? [] : diff(previous.state, state);
      if (!full && !ops.length) return true;
      const packet = full ? { ...state, uiVersion: version } : { t: 'uiPatch', channel: state.t, base: previous.version, version, ops };
      const ok = rawSend(connection, packet);
      if (ok !== false) states.set(state.t, { state, version, fullAt: full ? now : previous.fullAt });
      return ok;
    }
    send.resync = (connection, channel) => {
      const previous = connections.get(connection)?.get(channel);
      if (previous) return send(connection, previous.state, true);
      return false;
    };
    return send;
  }
  function createReceiver(requestFull) {
    const states = new Map(), waiting = new Set();
    return {
      reset() { states.clear(); waiting.clear(); },
      receive(message) {
        if (channels.has(message.t)) {
          if (Number.isInteger(message.uiVersion)) {
            const state = { ...message }; delete state.uiVersion;
            states.set(message.t, { version: message.uiVersion, state: clone(state) }); waiting.delete(message.t);
            return state;
          }
          return message;
        }
        if (message.t !== 'uiPatch') return message;
        if (!channels.has(message.channel)) return null;
        const previous = states.get(message.channel);
        try {
          if (waiting.has(message.channel) || !previous || previous.version !== message.base || message.version !== message.base + 1) throw Error('Missing baseline');
          const state = apply(previous.state, message.ops);
          states.set(message.channel, { version: message.version, state });
          return clone(state);
        } catch (error) {
          if (!waiting.has(message.channel)) { waiting.add(message.channel); requestFull(message.channel); }
          return null;
        }
      },
    };
  }
  return { diff, apply, createSender, createReceiver };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = StateDelta;
