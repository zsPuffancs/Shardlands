'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { Worker } = require('node:worker_threads');
const { spawn } = require('node:child_process');
const { openJsonStore, coordinateSaves, recoverSaveGroup } = require('../src/server/persistence');
const { encodeTransaction } = require('../src/server/save-log');
const { createRestartPolicy } = require('../src/server/restart-policy');
function directory(t) { const value = fs.mkdtempSync(path.join(os.tmpdir(), 'shardlands-durability-')); t.after(() => fs.rmSync(value, { recursive: true, force: true })); return value; }
const names = ['saves.json', 'plugin-data.json', 'universe.json'];
function fixture(t, opts = {}) {
  const dir = directory(t);
  for (const name of names) fs.writeFileSync(path.join(dir, name), name === 'saves.json' ? '{"hero":{"gold":100,"bag":[{"uid":"one"}],"unknown":{"preserved":true}}}' : '{}');
  const stores = Object.fromEntries(names.map(name => [name, openJsonStore(path.join(dir, name), { tracked: name === 'saves.json' })]));
  const save = coordinateSaves({ directory: dir, stores, background: true, debounceMs: 0, ...opts });
  t.after(() => save.close()); return { dir, stores, save };
}
const read = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));

test('background transactions preserve old JSON, unknown fields and coordinated wallet/world/plugin state', async t => {
  const f = fixture(t), player = f.stores['saves.json'];
  player.data.hero = { ...player.data.hero, gold: 90 }; f.stores['universe.json'].data.donation = 10; f.stores['plugin-data.json'].data.event = 'funded';
  await f.save(); assert.equal(read(f.dir, 'saves.json').hero.gold, 100); // no full rewrite per action
  await f.save.close(); recoverSaveGroup(f.dir, names);
  assert.equal(read(f.dir, 'saves.json').hero.gold, 90); assert.equal(read(f.dir, 'universe.json').donation, 10); assert.equal(read(f.dir, 'plugin-data.json').event, 'funded');
  assert.deepEqual(read(f.dir, 'saves.json').hero.bag, [{ uid: 'one' }]); assert.deepEqual(read(f.dir, 'saves.json').hero.unknown, { preserved: true });
  recoverSaveGroup(f.dir, names); assert.equal(read(f.dir, 'saves.json').hero.gold, 90);
});
test('rapid actions share a checkpoint; a request during IO is captured before acknowledgement', async t => {
  const f = fixture(t), p = f.stores['saves.json'];
  p.data.hero = { ...p.data.hero, gold: 80 }; const first = f.save();
  assert.equal(first, f.save());
  // Wait for the first immutable payload to be handed to the worker (dirty keys consumed).
  while (p.dirtyKeys.size) await new Promise(resolve => setImmediate(resolve));
  p.data.hero = { ...p.data.hero, gold: 70 }; assert.equal(f.save(), first);
  await first; await f.save.close(); recoverSaveGroup(f.dir, names); assert.equal(read(f.dir, 'saves.json').hero.gold, 70);
});
test('tracked deletions and prototype-like keys replay without changing prototypes', async t => {
  const f = fixture(t), p = f.stores['saves.json']; delete p.data.hero; p.data.__proto__ = { gold: 7 };
  await f.save.checkpoint(); assert.equal(read(f.dir, 'saves.json').hero, undefined);
  const restored = openJsonStore(path.join(f.dir, 'saves.json')); assert.equal(Object.getPrototypeOf(restored.data), null); assert.equal(restored.data.__proto__.gold, 7);
});
test('complete corrupt log records stop recovery; an interrupted final append does not erase committed transactions', async t => {
  const dir = directory(t); for (const name of names) fs.writeFileSync(path.join(dir, name), '{}');
  const changes = Object.fromEntries(names.map(name => [name, { replace: '{"value":1}' }]));
  const log = path.join(dir, 'save-log.jsonl'); fs.writeFileSync(log, encodeTransaction(changes) + '{"unfinished":');
  recoverSaveGroup(dir, names); for (const name of names) assert.equal(read(dir, name).value, 1);
  fs.writeFileSync(log, '{"data":"bad","sha256":"wrong"}\n');
  assert.throws(() => recoverSaveGroup(dir, names), /checksum/); assert.equal(read(dir, 'saves.json').value, 1); assert.ok(fs.statSync(log).size > 0);
});
test('v1 journal remains readable and recovery after interrupted compaction cannot duplicate rewards', async t => {
  const dir = directory(t); for (const name of names) fs.writeFileSync(path.join(dir, name), '{}');
  const workerFile = require.resolve('../src/server/persistence-worker');
  // Terminate the writer at a real multi-store rename boundary, after its durable redo exists.
  const worker = new Worker(`const fs=require('node:fs'),path=require('node:path'),{workerData}=require('node:worker_threads');const rename=fs.renameSync;fs.renameSync=(a,b)=>{if(b===path.join(workerData.directory,'plugin-data.json'))process.exit(70);return rename(a,b);};require(workerData.file);`, { eval: true, workerData: { directory: dir, names, file: workerFile } });
  const exited = new Promise((resolve, reject) => { worker.once('exit', resolve); worker.once('error', reject); });
  worker.postMessage({ id: 1, compact: true, changes: { 'saves.json': { set: { hero: '{"gold":90,"souls":2,"claimed":["one"],"bag":[{"uid":"one"}]}' }, remove: [] }, 'plugin-data.json': { replace: '{"rewarded":true}' }, 'universe.json': { replace: '{"donated":10}' } } });
  assert.equal(await exited, 70); assert.ok(fs.existsSync(path.join(dir, 'save-journal.json')));
  recoverSaveGroup(dir, names); recoverSaveGroup(dir, names);
  assert.deepEqual(read(dir, 'saves.json').hero, { gold: 90, souls: 2, claimed: ['one'], bag: [{ uid: 'one' }] }); assert.equal(read(dir, 'universe.json').donated, 10); assert.equal(read(dir, 'plugin-data.json').rewarded, true);
});
test('a process ending immediately after durable acknowledgement restores the acknowledged transaction', async t => {
  const dir = directory(t), api = require.resolve('../src/server/persistence');
  const source = `const p=require(${JSON.stringify(api)}),path=require('node:path');const dir=process.argv[1],names=${JSON.stringify(names)},stores=Object.fromEntries(names.map(n=>[n,p.openJsonStore(path.join(dir,n),{tracked:n==='saves.json'})]));stores['saves.json'].data.hero={gold:90,claimed:['reward']};stores['universe.json'].data.reward='reward';p.coordinateSaves({directory:dir,stores,background:true,debounceMs:0})().then(()=>process.exit(70));`;
  const child = spawn(process.execPath, ['-e', source, dir], { stdio: 'pipe' });
  assert.equal(await new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); }), 70);
  recoverSaveGroup(dir, names); assert.equal(read(dir, 'saves.json').hero.gold, 90); assert.deepEqual(read(dir, 'saves.json').hero.claimed, ['reward']); assert.equal(read(dir, 'universe.json').reward, 'reward');
});
test('serialization errors retain dirty records and do not acknowledge a partial transaction', async t => {
  const f = fixture(t), p = f.stores['saves.json']; p.data.hero = { gold: 1n };
  await assert.rejects(f.save(), /BigInt/); assert.equal(p.dirtyKeys.has('hero'), true); assert.equal(fs.existsSync(path.join(f.dir, 'save-log.jsonl')), false);
  p.data.hero = { gold: 10 }; await f.save.checkpoint(); assert.equal(read(f.dir, 'saves.json').hero.gold, 10);
});
test('failed worker IO rejects all waiters, retains dirty records and fails closed on later requests', async t => {
  const f = fixture(t), p = f.stores['saves.json']; p.data.hero = { gold: 80 };
  fs.mkdirSync(path.join(f.dir, 'save-log.jsonl')); // a deterministic invalid write target on Windows and Unix
  const first = f.save(); assert.equal(f.save(), first); await assert.rejects(first);
  assert.equal(p.dirtyKeys.has('hero'), true); await assert.rejects(f.save()); assert.equal(read(f.dir, 'saves.json').hero.gold, 100);
});
test('actual adventure claim flow remains once-only across concurrent claims and log recovery', async t => {
  const { createAdventure, CONTRACTS } = require('../src/progression/adventure');
  const { NPCS } = require('../src/world/game-world');
  const f = fixture(t), player = { name: 'Hero', lvl: 10, gold: 100, souls: 0, data: {}, ...NPCS.merchant, c: {} }; player.name = 'Hero'; player.c.p = player;
  const persistPlayer = hero => { f.stores['saves.json'].data.hero = { gold: hero.gold, souls: hero.souls, data: hero.data }; };
  const service = createAdventure({ send: () => true, say: () => {}, persistPlayer, durableSave: f.save });
  await service.handle(player, { op: 'accept', kind: 'clear' }); player.data.adventure.active.progress = CONTRACTS.clear.target;
  await Promise.all([service.handle(player, { op: 'claim' }), service.handle(player, { op: 'claim' })]);
  await f.save.close(); recoverSaveGroup(f.dir, names); const saved = read(f.dir, 'saves.json').hero;
  assert.equal(saved.souls, 2); assert.equal(saved.gold, 100); assert.deepEqual(saved.data.adventure.claimed, ['0:clear']); assert.equal(saved.data.adventure.pendingClaim, undefined);
});
test('crash restarts back off, stop at the limit, and recover their budget after the window', () => {
  const policy = createRestartPolicy(); assert.deepEqual([0, 1, 2, 3, 4].map(i => policy.nextDelay(i)), [500, 1000, 2000, 4000, 8000]); assert.equal(policy.nextDelay(5), null); assert.equal(policy.nextDelay(600005), 500);
});
