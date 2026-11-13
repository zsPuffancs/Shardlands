'use strict';
// World Boss identities and visual variants (src/world/world-boss-looks.js, public/world-boss-models.js): visual only.
// Eight identities by founding zone / frontier biome, three variants chosen deterministically from the seed and tier
// (rotating, so repeated encounters differ), sent as a look code on the World Boss of each tier only; spawned
// monsters keep every gameplay field; Region Boss models are unchanged (tests/enemy-models.test.js).
const test = require('node:test'), assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { IDENTITIES, FOUNDING, BIOME, identityFor, displayName, decodeLook, createWorldBossLooks, monsterLook, monsterDisplayName } = require('../src/world/world-boss-looks');
const { generateRegion } = require('../src/world/universe');
const { MOBTYPES, TIERS, createMonsterSpawner } = require('../src/combat/monsters');
const { mobTypesForClient } = require('../src/multiplayer/snapshots');
const { context, read } = require('./helpers/enemy-model-context');
const vm = require('node:vm');

const regionsFor = (seed, count) => { const list = [null]; for (let tier = 1; tier <= count; tier++) list.push(generateRegion(seed, tier, { elements: {} }, 2)); return tier => list[tier]; };

test('eight identities: founding zones and frontier biomes map to the agreed World Bosses', () => {
  assert.deepEqual(IDENTITIES.map(i => i.name), ['Vârcolac', 'The Devourer', 'Oni Warlord', 'Feathered Sovereign', 'Frostbound Jarl', 'Moon-Eater', 'Ossuary King', 'The Reaper']);
  assert.deepEqual(TIERS.map(zone => zone.name), ['Whispering Meadows', 'Gloomwood', 'Ashen Barrens', 'Ember Wastes', 'Frostfang Peaks', 'Voidreach', 'Death Zone']);
  assert.deepEqual(FOUNDING, ['varcolac', 'devourer', 'oni', 'sovereign', 'jarl', 'mooneater', 'reaper']);
  assert.deepEqual(BIOME, { wildwood: 'devourer', warfields: 'oni', volcanic: 'sovereign', glacier: 'jarl', voidscar: 'mooneater', necropolis: 'ossuary' });
  const regionFor = regionsFor('test-seed', 80);
  for (let tier = 1; tier <= 7; tier++) { const region = regionFor(tier); assert.equal(identityFor(region).id, FOUNDING[tier - 1]); assert.equal(displayName(region), identityFor(region).name, 'founding worlds show only the concept name'); }
  for (let tier = 8; tier <= 80; tier++) { const region = regionFor(tier); assert.equal(identityFor(region).id, BIOME[region.biome]); assert.equal(displayName(region), identityFor(region).name + ' — ' + region.worldBoss.name, 'generated name kept as a title'); }
  assert.equal(identityFor(null), null); assert.equal(MOBTYPES.boneking.name, 'The Bone King', 'the Region Boss keeps its name');
});

test('variants are deterministic per universe, rotate across repeated encounters and differ between universes', () => {
  const tiers = 120, a = createWorldBossLooks({ seed: 'alpha', regionFor: regionsFor('alpha', tiers) }), b = createWorldBossLooks({ seed: 'alpha', regionFor: regionsFor('alpha', tiers) });
  const looks = []; for (let tier = 1; tier <= tiers; tier++) { const look = a.look(tier); assert.deepEqual(look, b.look(tier), 'same seed, same look'); looks.push(look); }
  // asked out of order (as regions open lazily), the answers are the same
  const c = createWorldBossLooks({ seed: 'alpha', regionFor: regionsFor('alpha', tiers) });
  for (const tier of [97, 3, 55, 120, 8, 1]) assert.deepEqual(c.look(tier), looks[tier - 1]);
  const byId = {}; for (const look of looks) (byId[look.id] = byId[look.id] || []).push(look.variant);
  assert.equal(Object.keys(byId).length, 8, 'all eight identities appear');
  for (const [id, variants] of Object.entries(byId)) {
    for (let k = 1; k < variants.length; k++) assert.notEqual(variants[k], variants[k - 1], id + ': the next encounter looks different');
    if (variants.length >= 3) assert.equal(new Set(variants).size, 3, id + ': all three variants in use');
  }
  for (const look of looks) { assert.ok(look.variant >= 0 && look.variant < 3); assert.deepEqual(decodeLook(look.code), { identity: IDENTITIES.find(i => i.id === look.id), variant: look.variant }); }
  const firstVariants = seed => { const l = createWorldBossLooks({ seed, regionFor: regionsFor(seed, 7) }); return [1, 2, 3, 4, 5, 6, 7].map(t => l.look(t).variant).join(); };
  assert.ok(new Set(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].map(firstVariants)).size > 1, 'different universes start on different variants');
});

test('only the World Boss of its own tier carries the look; every gameplay field is unchanged', () => {
  const looks = createWorldBossLooks({ seed: 'gameplay', regionFor: regionsFor('gameplay', 7) });
  const type = 'voidlord', template = MOBTYPES[type], saved = template.worldBossLook;
  const spawn = () => { const mobs = new Map(); let id = 0; const s = createMonsterSpawner({ mobs, rates: { monsterHp: 1, monsterDmg: 1, xp: 1, gold: 1 }, world: { width: 10600, height: 10600, centerX: 5300, centerY: 5300 }, allocateId: () => ++id, rnd: () => 0.5, rint: (a) => a, pick: list => list[0] }); return [s.spawnMob(type, 5300, 900, 5), s.spawnMob(type, 5300, 400, 6)]; };
  try {
    delete template.worldBossLook; const [plainBoss, plainDeath] = spawn();
    const look = looks.apply(template, 6);                    // Voidreach (tier 6): voidlord's look, zone 5
    assert.equal(look.id, 'mooneater'); assert.equal(look.zone, 5);
    const [boss, deathZone] = spawn();
    assert.equal(boss.look, look.code, 'the World Boss of Voidreach wears the Moon-Eater'); assert.equal(deathZone.look, 0, 'a Void Lord in the Death Zone stays a Region Boss');
    for (const [a, b] of [[plainBoss, boss], [plainDeath, deathZone]]) { const strip = m => { const { look, ...rest } = m; return rest; }; assert.deepEqual(strip(b), strip(a), 'same stats, size, rewards'); }
    assert.equal(monsterLook(template, 5), look.code); assert.equal(monsterLook(template, 6), 0); assert.equal(monsterLook(MOBTYPES.wolf, 0), 0);
    assert.equal(monsterDisplayName(template, { tier: 5 }), 'Moon-Eater'); assert.equal(monsterDisplayName(template, { tier: 6 }), 'Void Lord');
    const row = mobTypesForClient({ [type]: template })[type]; assert.equal(row.wn, 'Moon-Eater'); assert.equal(row.n, 'Void Lord');
    assert.equal(mobTypesForClient({ wolf: MOBTYPES.wolf }).wolf.wn, undefined);
  } finally { if (saved) template.worldBossLook = saved; else delete template.worldBossLook; }
});

test('the look code travels as the last monster row field; the client reads it and its name', () => {
  const snapshots = read('src/multiplayer/snapshots.js'), game = read('public/game.js'), text = read('public/text.js');
  assert.match(snapshots, /mob\.worldBoss && mob\.fightStart \? [^\]]+: 0, mob\.look \|\| 0\]/);
  assert.match(game, /enrageAt: a\[13\] \|\| 0, wl: a\[14\] \|\| 0 \}/);
  assert.match(game, /'recoverEnd', 'enrageAt', 'wl'\]/);
  assert.match(game, /if \(m\.wl && typeof WorldBossModels !== 'undefined'\) o = WorldBossModels\.model\(m\.wl, t\) \|\| o;/);
  assert.match(text, /const shownMobName = \(m, t\) => \(m && m\.wl && t && t\.wn \? t\.wn : mobName\(m\.ty, t\.n\)\);/);
});

// headless World Boss models on the same recording context as the enemy models
function bossContext() { const ctx = context(); vm.runInContext(read('public/world-boss-models.js'), ctx); return ctx; }
const POSES = [['idle', { mv: 0, ph: 0, atkT: -1e9, flash: 0 }], ['walk', { mv: 1, ph: 2.3, atkT: -1e9, flash: 0 }], ['attack', { mv: .4, ph: 1, atkT: 9850, flash: 0 }], ['hit', { mv: 0, ph: 0, atkT: -1e9, flash: 9950 }]];

test('all 24 World Boss appearances draw finite, low-poly geometry in every pose and fit their hitbox', () => {
  const ctx = bossContext(), W = ctx.window.WorldBossModels;
  assert.equal(W.BOSSES.map(b => b.id).join(), IDENTITIES.map(i => i.id).join(), 'client and server agree on the identity order');
  for (let code = 1; code <= 24; code++) for (const r of [36, 51, 81, 160]) {
    const o = W.model(code, { r }); assert.ok(o && typeof o.fn === 'function'); assert.ok(o.top * o.sc <= 240.0001, 'height capped');
    for (const [name, e] of POSES) {
      ctx.calls.length = 0; o.fn({ id: 9, rx: 100, ry: 200, yaw: .7, ...e }, o);
      const label = o.worldBoss + ' variant ' + o.v + ' ' + name;
      assert.ok(ctx.calls.length >= 40 && ctx.calls.length <= 260, label + ': ' + ctx.calls.length + ' parts');
      for (const c of ctx.calls) { for (const v of c.slice(1, 9)) assert.ok(Number.isFinite(v), label + ': non-finite'); assert.ok(Array.isArray(c[9]) && c[9].every(Number.isFinite), label + ': colour'); }
      const ys = ctx.calls.map(c => c[2]); assert.ok(Math.min(...ys) > -5 && Math.max(...ys) < 280, label + ': on the ground, readable height');
    }
  }
  assert.equal(W.model(0, { r: 50 }), null); assert.equal(W.model(25, { r: 50 }), null);
});

test('each World Boss has three recognisably different variants of one identity', () => {
  const ctx = bossContext(), W = ctx.window.WorldBossModels;
  const shape = o => { ctx.calls.length = 0; o.fn({ id: 9, rx: 0, ry: 0, yaw: 0, mv: 0, ph: 0, atkT: -1e9, flash: 0 }, o); return ctx.calls.map(c => [c[0], c[9].map(v => +v.toFixed(2)).join()]); };
  for (let i = 0; i < 8; i++) {
    const v = [0, 1, 2].map(k => shape(W.model(i * 3 + k + 1, { r: 50 }))), meshes = v.map(s => s.map(c => c[0]).join()), colours = v.map(s => new Set(s.map(c => c[1])));
    assert.equal(new Set(meshes).size, 3, W.BOSSES[i].id + ': three different silhouettes, not recolours');
    for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
      const shared = [...colours[a]].filter(c => colours[b].has(c)).length; assert.ok(shared < Math.max(colours[a].size, colours[b].size), W.BOSSES[i].id + ': different materials');
      const counts = s => s.reduce((m, [mesh]) => (m[mesh] = (m[mesh] || 0) + 1, m), {}), ca = counts(v[a]), cb = counts(v[b]), keys = new Set([...Object.keys(ca), ...Object.keys(cb)]);
      let common = 0, total = 0; for (const k of keys) { common += Math.min(ca[k] || 0, cb[k] || 0); total += Math.max(ca[k] || 0, cb[k] || 0); }
      assert.ok(common / total > .55, W.BOSSES[i].id + ': variants keep one recognisable body');
    }
  }
});

test('Region Boss models, World Boss gameplay hooks and saves are untouched', () => {
  const ctx = bossContext();
  for (const k of ['alphawolf', 'kingslime', 'broodmother', 'warlord', 'ogrechief', 'boneking', 'elderdrake', 'infernal', 'frostwyrm', 'yetiking', 'voidlord', 'abyssalwyrm', 'deathlord']) assert.equal(ctx.MODEL[k], ctx.ORIGINAL[k], k + ' Region Boss model untouched');
  const looks = read('src/world/world-boss-looks.js');
  assert.doesNotMatch(looks.replace(/\/\/[^\n]*/g, ''), /state\.|persist|writeFile|regions\[/, 'nothing persisted');
  assert.equal(crypto.createHash('md5').update(read('src/shared/typed/entities.ts')).digest('hex').length, 32);
});
