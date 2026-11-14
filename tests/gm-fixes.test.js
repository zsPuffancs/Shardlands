'use strict';
// GM fixes, end to end on an isolated server copy with temporary saves: skipping several worlds through the real
// World Tier progression, adding Souls that persist, spawning genuine Mythic equipment, and spawning more than 10
// items with bag overflow reported instead of silently dropped.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { fork } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const { createGmAccountStore, generatePassword } = require('../src/player/gm-accounts');

const wait = ms => new Promise(r => setTimeout(r, ms));
function client(port) {
  const ws = new WebSocket('ws://127.0.0.1:' + port), inbox = [];
  const c = { ws, inbox, send: m => ws.send(JSON.stringify(m)),
    next: (pred, ms = 20000) => new Promise((resolve, reject) => { const t0 = Date.now(); (function poll() { const i = inbox.findIndex(pred); if (i >= 0) return resolve(inbox.splice(i, 1)[0]); if (Date.now() - t0 > ms) return reject(Error('timed out waiting for a message')); setTimeout(poll, 20); })(); }) };
  ws.onmessage = e => inbox.push(JSON.parse(e.data));
  c.open = new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  return c;
}

test('GM: skip worlds, add souls, spawn Mythic gear and large batches', { timeout: 600000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shardlands-gmfix-'));
  let child, output = '';
  const start = async () => {
    output = '';
    const free = await new Promise(resolve => { const s = require('node:net').createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
    child = fork(path.join(directory, 'server.js'), ['--local-console'], { cwd: directory, env: { ...process.env, PORT: String(free) }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    child.stdout.on('data', d => { output += d; }); child.stderr.on('data', d => { output += d; });
    const t0 = Date.now(); while (!/localhost:(\d+)/.test(output) && Date.now() - t0 < 30000) await wait(50);
    return +output.match(/localhost:(\d+)/)[1];
  };
  const stop = async () => { child.send('shutdown'); await new Promise(r => child.once('exit', r)); };
  try {
    for (const entry of fs.readdirSync(root)) if (entry.endsWith('.js')) fs.copyFileSync(path.join(root, entry), path.join(directory, entry));
    for (const entry of ['src', 'plugins']) fs.cpSync(path.join(root, entry), path.join(directory, entry), { recursive: true });
    fs.mkdirSync(path.join(directory, 'public'));
    for (const entry of fs.readdirSync(path.join(root, 'public'))) if (entry.endsWith('.js')) fs.copyFileSync(path.join(root, 'public', entry), path.join(directory, 'public', entry));
    fs.writeFileSync(path.join(directory, 'config.json'), JSON.stringify({ serverName: 'GM fixes fixture', disabledPlugins: [], tunnel: false }));
    const store = createGmAccountStore({ directory }), pw = generatePassword();
    await store.setPassword('zsPuffancs', pw, { mustChange: false, provisioned: true });

    let port = await start();
    const enterGm = async () => { const c = client(port); await c.open; c.send({ t: 'gmLogin', user: 'zsPuffancs', pw }); assert.equal((await c.next(m => m.t === 'gmAuth')).ok, true);
      c.send({ t: 'gmEnter', cls: 'blade', listDeltas: false }); const init = await c.next(m => m.t === 'init'); const state = await c.next(m => m.t === 'gmState'); return { c, init, state }; };
    let { c: gm, state } = await enterGm();
    const run = async (op, args = {}) => { gm.inbox.length = 0; gm.send({ t: 'gm', op, args, confirm: true }); const result = await gm.next(m => m.t === 'gmResult', 240000); const st = await gm.next(m => m.t === 'gmState'); return { result, state: st }; };
    const lastInv = () => { const list = gm.inbox.filter(m => m.t === 'inv'); return list[list.length - 1]; };

    // a normal player on the same server sees the universe advance
    const alice = client(port); await alice.open; alice.send({ t: 'join', name: 'Alice', pw: 'alice-secret-1', cls: 'blade', listDeltas: false }); await alice.next(m => m.t === 'init');

    // ---- 1. map skipping: the old "next map" had nowhere to go in a fresh universe; skipping advances real World Tiers
    assert.equal(state.tier, 1); assert.deepEqual(state.maps.map(m => m.index), [0]);
    assert.match((await run('nextMap')).result.msg, /No other unlocked map/);
    let tier = 1;
    for (const n of [1, 2, 5, 10]) {
      alice.inbox.length = 0;
      const { result, state: st } = await run('skipWorlds', { count: n });
      assert.equal(result.ok, true, result.msg); tier += n;
      assert.equal(st.tier, tier, 'World Tier advanced by exactly ' + n);
      assert.match(result.msg, new RegExp('World Tier ' + (tier - n) + ' -> ' + tier));
      const newest = st.maps.reduce((a, b) => (b.tier > a.tier ? b : a));
      if (tier > 7) { assert.equal(newest.tier, tier, 'the destination region is generated and travelable'); assert.equal(st.map, newest.index, 'the GM travelled to the newest map'); }
      assert.ok(st.maps.every((m, i, all) => all.findIndex(o => o.index === m.index) === i), 'no duplicated maps');
    }
    // the destination has its World Boss and players elsewhere were told about the new tiers
    const here = await run('state'); assert.ok(here.state.worldBoss && here.state.worldBoss.name, 'the destination map has its World Boss');
    const lair = await run('toWorldBoss'); assert.equal(lair.result.ok, true, lair.result.msg);
    let up = null; for (let k = 0; k < 30 && !up; k++) { await wait(300); const s2 = await run('state'); if (s2.state.worldBoss && s2.state.worldBoss.up) up = s2.state.worldBoss; }
    assert.ok(up, 'the World Boss spawns at its lair once the GM is there');
    assert.ok(alice.inbox.length > 0);
    for (const n of [0, -3, 1.5, 51, 1e9, 'x']) assert.equal((await run('skipWorlds', { count: n })).result.ok, false, 'invalid count ' + n + ' is refused');

    // ---- 2. souls: small and large amounts through the existing currency, shown in the inventory update
    let r = await run('giveSouls', { amount: 25 }); assert.equal(r.result.ok, true); assert.match(r.result.msg, /Added 25 souls\. Balance: 25/);
    r = await run('giveSouls', { amount: 5000000 }); assert.equal(r.result.ok, true); assert.match(r.result.msg, /Balance: 5000025/);
    assert.equal((await run('giveSouls', { amount: 0 })).result.ok, false); assert.equal((await run('giveSouls', { amount: -5 })).result.ok, false);

    // ---- 3. Mythic equipment from the real generator, several slots
    for (const slot of state.slots.slice(0, 4)) { r = await run('spawnGear', { slot, ilvl: 40, rarity: 5, count: 1 }); assert.equal(r.result.ok, true, r.result.msg); assert.match(r.result.msg, /Delivered 1 of 1 Mythic/); }
    await wait(300); let inv = lastInv(); const mythics = inv.bag.filter(i => i.rar === 5);
    assert.equal(mythics.length, 4); for (const item of mythics) { assert.equal(item.ilvl, 40); assert.ok(Object.keys(item.st || item.stats || {}).length > 0 || item.n, 'has stats'); }
    assert.equal((await run('spawnGear', { slot: 'any', ilvl: 40, rarity: 6, count: 1 })).result.ok, false, 'no rarity beyond Mythic');
    // equip the first Mythic
    assert.equal((await run('setLevel', { level: 60 })).result.ok, true);
    const worn = mythics[0]; gm.inbox.length = 0; gm.send({ t: 'equip', uid: worn.uid }); await wait(800);
    assert.ok(Object.values(lastInv().eq || {}).some(i => i && i.uid === worn.uid && i.rar === 5), 'the Mythic can be equipped');

    // ---- 4. quantities beyond 10, and overflow reported rather than dropped
    for (const n of [10, 25, 50]) { r = await run('spawnGear', { slot: 'any', ilvl: 10, rarity: 1, count: n }); assert.equal(r.result.ok, true); }
    await wait(300); inv = lastInv(); const filled = inv.bag.length;
    r = await run('spawnGear', { slot: 'any', ilvl: 10, rarity: 1, count: 40 });
    const delivered = +r.result.msg.match(/Delivered (\d+) of 40/)[1];
    assert.ok(delivered < 40, 'the bag fills up'); assert.match(r.result.msg, new RegExp((40 - delivered) + ' could not be added'));
    await wait(300); assert.equal(lastInv().bag.length, filled + delivered, 'every reported item is in the bag');
    assert.match((await run('spawnGear', { slot: 'any', ilvl: 10, rarity: 1, count: 5 })).result.msg, /Bag is full: none of the 5/);
    assert.equal((await run('spawnGear', { slot: 'any', ilvl: 10, rarity: 1, count: 501 })).result.ok, false, 'server-side batch limit');

    // ---- persistence: reconnect and find the souls, the equipped Mythic and the Mythics in the bag
    gm.send({ t: 'gmLogout' }); await gm.next(m => m.t === 'gmLoggedOut'); gm.ws.close(); alice.ws.close();
    await stop(); port = await start();
    ({ c: gm } = await enterGm()); await wait(500);
    inv = lastInv();
    assert.equal(inv.souls, 5000025, 'souls persisted');
    const wornNow = Object.values(inv.eq || {}).find(i => i && i.uid === worn.uid); assert.ok(wornNow, 'equipped Mythic persisted'); assert.equal(wornNow.rar, 5);
    assert.equal(inv.bag.filter(i => i.rar === 5).length, 3, 'Mythics in the bag persisted');
    // progression persisted, with exactly one victory record per skipped tier
    const again = await run('state'); assert.equal(again.state.tier, 19);
    gm.ws.close(); await stop();
    const universe = JSON.parse(fs.readFileSync(path.join(directory, 'universe.json'), 'utf8'));
    const tiers = (universe.history || []).filter(e => e.type === 'worldBoss').map(e => e.beatenTier ?? e.data?.beatenTier);
    assert.equal(tiers.length, 18, 'one World Boss victory record per skipped tier'); assert.equal(new Set(tiers).size, 18);
  } finally {
    if (child && child.exitCode === null) child.kill();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
