'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const xp = require('../src/progression/xp-economy');
const { createProgression, newSk, stats } = require('../src/player/characters');
const { createCombat } = require('../src/combat/combat');
const { createTeams } = require('../src/multiplayer/teams');
const { createEncounterParticipation } = require('../src/combat/encounter-participation');
const { MOBTYPES, createMonsterSpawner, TIERS } = require('../src/combat/monsters');
const noop = () => {};
function hero(id = 1, level = 100) { const player = { id, name: 'Hero' + id, c: {}, cls: 'archer', lvl: level, xp: 0, sp: 0, gold: 0, eq: {}, bag: [], inv: {}, sk: newSk(), buf: {}, x: 6000, y: 6000, team: 0 }; stats(player); player.hp = player.maxhp; player.mp = player.maxmp; return player; }
function setup(count = 1, { share = true, levels = [], xpHook = noop, rate = 1 } = {}) {
  const roster = Array.from({ length: count }, (_, i) => hero(i + 1, levels[i] || 100)), players = new Map(roster.map(player => [player.id, player]));
  const teams = createTeams({ players, send: noop, say: noop, toast: noop, fire: noop, afterGearChange: noop });
  for (const member of roster.slice(1)) { teams.chatCommands.invite.fn(roster[0], [member.name]); teams.chatCommands.accept.fn(member); }
  if (!share && count > 1) teams.chatCommands.share.fn(roster[0]);
  const drops = [], awards = [], progression = createProgression({ fire: (event, player, award) => { if (event === 'xp') xpHook(player, award); }, ev: noop, say: noop, toast: noop, broadcast: noop, sendInv: noop });
  const monster = { id: 1, ty: 'wolf', lvl: 100, hp: 10000, mh: 10000, ps: 1, r: 14, x: 6020, y: 6000, tier: 0 };
  const mobs = new Map([[1, monster]]);
  const combat = createCombat({ mobs, players, teams, rates: { xpRate: rate, respawnSeconds: 10 }, spawnMob: noop, ev: noop, fire: noop, gainXp: (player, amount, context) => { const added = progression.gainXp(player, amount, context); if (added) awards.push([player.id, added]); }, dropLoot: (...args) => drops.push(args), broadcast: noop, say: noop });
  return { roster, players, teams, monster, mobs, combat, progression, awards, drops };
}
function participate(game) { for (const player of game.roster) game.combat.hitMob(player, game.monster, 500); }

test('Spirit Stone party rewards use individual penalties and pay each participant exactly once', () => {
  const game = setup(2, { levels: [100, 110] }); game.monster.ty = 'stone';
  // Fresh lifecycle: zero is an already-spent encounter, not a way to skip waves.
  game.monster.stoneStep = 5;
  participate(game); game.combat.hitMob(game.roster[0], game.monster, 1e9);
  const expected = game.roster.map(player => [player.id, xp.calculateEncounterXp({ playerLevel: player.lvl, monsterLevel: 100, category: 'stone', members: 2, healthScale: game.monster.ps })]);
  assert.deepEqual(game.awards, expected); assert.ok(expected[1][1] < expected[0][1]);
  game.combat.hitMob(game.roster[1], game.monster, 1e9);
  assert.equal(game.awards.length, 2); assert.equal(game.drops.length, 1);
});

test('category budgets track actual level requirements and early-game rewards taper without spikes', () => {
  for (const level of [1, 10, 25, 50, 60, 100, 250, 500, 1000, 5000, 9999]) for (const category of Object.keys(xp.XP_BALANCE.fractions)) {
    const actual = xp.calculateEncounterXp({ playerLevel: level, monsterLevel: level, category });
    const fraction = xp.categoryFraction(category, level);
    assert.ok(Math.abs(actual - xp.xpNeed(level) * fraction) <= 1, level + ' ' + category);
  }
  assert.equal(xp.calculateEncounterXp({ playerLevel: 1, monsterLevel: 1 }), 11);
  for (let level = 2; level <= 10; level++) assert.ok(xp.categoryFraction('normal', level) <= xp.categoryFraction('normal', level - 1));
  assert.equal(xp.encounterCategory({ summoned: true }, MOBTYPES.deathlord), 'summoned');
  assert.equal(xp.encounterCategory({}, { boss: true, worldBoss: true }), 'worldBoss');
});

test('exact overlevel 24/25 boundary, full-reward windows and underlevel tails are stable', () => {
  for (const category of ['normal', 'alpha', 'stone', 'boss', 'worldBoss']) {
    assert.ok(xp.calculateEncounterXp({ playerLevel: 124, monsterLevel: 100, category }) > 0);
    assert.equal(xp.calculateEncounterXp({ playerLevel: 125, monsterLevel: 100, category }), 0);
    assert.equal(xp.calculateEncounterXp({ playerLevel: 1, monsterLevel: 10000, category }), 0);
    assert.ok(xp.calculateEncounterXp({ playerLevel: 90, monsterLevel: 100, category }) > 0);
  }
  assert.equal(xp.levelGapScale(100, 95), 1); assert.ok(xp.levelGapScale(100, 94) < 1);
  assert.equal(xp.levelGapScale(100, 110), 1); assert.ok(xp.levelGapScale(100, 111) < 1);
  assert.equal(xp.levelGapScale(1, 11), 1); assert.ok(xp.levelGapScale(1, 12) < 1);
  assert.ok(Math.abs(xp.levelGapScale(100, 110.0) - 1) < 1e-12);
  assert.ok(xp.levelGapScale(100, 200) > xp.levelGapScale(100, 1000));
});

test('bonus pipeline bounds gear, preserves Wisdom and respects zero/cancelled/invalid awards', () => {
  assert.equal(xp.gearXpMultiplier(100), 1.5); assert.ok(xp.gearXpMultiplier(Number.MAX_VALUE) < 2.000001);
  const base = { playerLevel: 100, monsterLevel: 100, category: 'normal' };
  const plain = xp.calculateEncounterXp(base), gear = xp.calculateEncounterXp({ ...base, gearBonus: 100 }), wisdom = xp.calculateEncounterXp({ ...base, wisdom: true });
  assert.ok(Math.abs(gear - plain * 1.5) <= 1); assert.equal(gear, wisdom);
  assert.ok(xp.calculateEncounterXp({ ...base, gearBonus: 100, wisdom: true }) > gear);
  for (const category of Object.keys(xp.XP_BALANCE.fractions)) for (const rate of [0, 1, 10, 1000000, Number.MAX_VALUE, Infinity, NaN, -1]) {
    const result = xp.calculateEncounterXp({ ...base, category, serverRate: rate, gearBonus: Number.MAX_VALUE, wisdom: true });
    assert.ok(Number.isSafeInteger(result) && result >= 0 && result <= xp.encounterLimit(100));
  }
  const game = setup(1, { xpHook: (player, award) => { award.v = 0; } }); game.combat.hitMob(game.roster[0], game.monster, 1e9); assert.equal(game.roster[0].xp, 0); assert.equal(game.drops.length, 1);
  for (const value of [0, -1, NaN, Infinity]) { const player = hero(), progression = createProgression({ fire: noop, ev: noop }); assert.equal(progression.gainXp(player, value), 0); assert.equal(player.xp, 0); }
});

test('plugin XP adjustments are applied last and combat hooks cannot bypass category or safety caps', () => {
  const normal = setup(), boosted = setup(1, { xpHook: (player, award) => { award.v *= 1000; } });
  normal.combat.hitMob(normal.roster[0], normal.monster, 1e9); boosted.combat.hitMob(boosted.roster[0], boosted.monster, 1e9);
  assert.equal(boosted.roster[0].xp, normal.roster[0].xp * 2);
  let progression; const player = hero(); progression = createProgression({ fire: (event, p, award) => { if (event === 'xp') { assert.equal(progression.gainXp(p, 100), 0); award.v = Infinity; } }, ev: noop });
  assert.equal(progression.gainXp(player, 10), 0); assert.equal(player.xp, 0);
});

test('equal-DPS parties gain 5..20% per-player XP/hour with linear HP and separate damage scaling', () => {
  for (let size = 1; size <= 5; size++) {
    const ratio = xp.partyPoolScale(size) / xp.partyHpScale(size); assert.ok(Math.abs(ratio - (1 + .05 * (size - 1))) < 1e-12);
    const game = setup(size); participate(game); assert.equal(game.monster.ps, xp.partyHpScale(size)); assert.equal(game.monster.partyDamageScale, xp.partyDamageScale(size));
    game.combat.hitMob(game.roster[0], game.monster, 1e9);
    const expected = xp.calculateEncounterXp({ playerLevel: 100, monsterLevel: 100, members: size });
    assert.equal(game.awards.length, size); for (const player of game.roster) assert.equal(player.xp, expected);
    assert.equal(game.drops.length, 1);
  }
});

test('idle, dead, disconnected, distant and expired contributors do not consume XP shares', () => {
  for (const reason of ['idle', 'dead', 'disconnected', 'distant', 'expired']) {
    const game = setup(2), [killer, member] = game.roster;
    if (reason !== 'idle') participate(game);
    if (reason === 'dead') member.dead = Date.now() + 1000;
    if (reason === 'disconnected') game.players.delete(member.id);
    if (reason === 'distant') member.x = game.monster.x + 1001;
    if (reason === 'expired') {
      const now = Date.now, start = Date.now(); Date.now = () => start - 50000; try { game.combat.hitMob(member, game.monster, 500); } finally { Date.now = now; }
    }
    game.combat.hitMob(killer, game.monster, 1e9); assert.equal(member.xp, 0, reason); assert.ok(killer.xp > 0, reason);
  }
});

test('sharing toggles, joins, leaves and repeated hits never heal or resize an active encounter', () => {
  const game = setup(2), [a, b] = game.roster; participate(game); const maximum = game.monster.mh;
  game.teams.chatCommands.share.fn(a); const hp = game.monster.hp; game.combat.hitMob(a, game.monster, 100); assert.equal(game.monster.mh, maximum); assert.ok(game.monster.hp < hp);
  game.teams.chatCommands.share.fn(a); game.combat.hitMob(b, game.monster, 100); assert.equal(game.monster.mh, maximum);
  game.teams.chatCommands.leave.fn(b); game.combat.hitMob(a, game.monster, 1e9); assert.ok(b.xp > 0); assert.ok(a.xp > 0, 'original contributors retain their claim after leaving, without transferring it to new members');
  const solo = setup(2, { share: false }); solo.combat.hitMob(solo.roster[0], solo.monster, 500); assert.equal(solo.monster.ps, 1);
  solo.teams.chatCommands.share.fn(solo.roster[0]); solo.combat.hitMob(solo.roster[1], solo.monster, 500); solo.combat.hitMob(solo.roster[0], solo.monster, 1e9);
  assert.equal(solo.roster[1].xp, 0); assert.ok(solo.roster[0].xp > 0); assert.equal(solo.monster.ps, 1);
});

test('new members cannot claim a tagged encounter and noneligible last hitters do not steal eligible XP', () => {
  const game = setup(2, { levels: [100, 125] }); participate(game); game.combat.hitMob(game.roster[1], game.monster, 1e9); assert.ok(game.roster[0].xp > 0); assert.equal(game.roster[1].xp, 0);
  const late = setup(1), joined = hero(2); late.players.set(joined.id, joined); late.combat.hitMob(late.roster[0], late.monster, 500);
  late.teams.chatCommands.invite.fn(late.roster[0], [joined.name]); late.teams.chatCommands.accept.fn(joined); late.combat.hitMob(joined, late.monster, 1e9);
  assert.ok(late.roster[0].xp > 0); assert.equal(joined.xp, 0);
});

test('defeated monsters and recursive damage callbacks cannot duplicate XP or drops', () => {
  const game = setup(); game.combat.hitMob(game.roster[0], game.monster, 1e9); const awarded = game.roster[0].xp;
  for (let i = 0; i < 20; i++) game.combat.hitMob(game.roster[0], game.monster, 1e9);
  assert.equal(game.roster[0].xp, awarded); assert.equal(game.drops.length, 1);
  const player = hero(), monster = { ...game.monster, dead: 0, hp: 100, mh: 100 }, players = new Map([[1, player]]); let combat, kills = 0;
  combat = createCombat({ players, mobs: new Map(), teams: {}, rates: { xpRate: 1 }, fire: event => { if (event === 'damage') combat.hitMob(player, monster, 1e9); if (event === 'kill') kills++; }, gainXp: noop, dropLoot: noop, ev: noop, broadcast: noop, say: noop });
  combat.hitMob(player, monster, 1e9); assert.equal(kills, 1);
});

test('saved gear/progress are retained, max level stops new awards and old pending XP is preserved', () => {
  const player = hero(1, 9999), item = { slot: 'ring', plus: 0, stats: { xpb: 5000 } }; player.eq.ring = item; stats(player); player.xp = xp.xpNeed(9999) * 10; const beforeItem = JSON.stringify(item), beforeXp = player.xp;
  const progression = createProgression({ fire: noop, ev: noop, say: noop, toast: noop, broadcast: noop, sendInv: noop });
  progression.processLevels([player]); assert.equal(player.lvl, 10000); assert.equal(player.sp, 1); assert.equal(player.xp, beforeXp - xp.xpNeed(9999)); assert.equal(JSON.stringify(item), beforeItem);
  const remaining = player.xp; assert.equal(progression.gainXp(player, 1e12), 0); progression.processLevels([player]); assert.equal(player.xp, remaining); assert.equal(player.sp, 1);
});

test('fresh and wounded encounter snapshots scale once; resetting allows a clean next encounter', () => {
  const game = setup(2), tracker = createEncounterParticipation({ players: game.players, teams: game.teams });
  tracker.begin(game.roster[0], game.monster); const maximum = game.monster.mh; game.monster.hp -= 500; const wounded = game.monster.hp;
  tracker.reset(game.monster); tracker.begin(game.roster[1], game.monster); assert.equal(game.monster.mh, maximum); assert.equal(game.monster.hp, wounded);
  game.monster.mh /= game.monster.ps; game.monster.ps = 1; game.monster.hp = game.monster.mh; tracker.reset(game.monster); tracker.begin(game.roster[0], game.monster); assert.equal(game.monster.mh, maximum);
});

test('wounded/unloaded encounters cannot grant an unpaid five-player HP pool', () => {
  const options = { playerLevel: 100, monsterLevel: 100, members: 5 };
  const full = xp.calculateEncounterXp(options), wounded = xp.calculateEncounterXp({ ...options, healthScale: 1 });
  assert.ok(wounded < full / 2); assert.ok(wounded <= xp.calculateEncounterXp({ ...options, members: 1 }) * 1.2 / 5 + 1);
  const game = setup(5); game.monster.hp = 9000;
  participate(game); assert.equal(game.monster.ps, 1); game.combat.hitMob(game.roster[0], game.monster, 1e9);
  for (const player of game.roster) assert.equal(player.xp, wounded);
});

test('all reward inputs stay safe across supported levels, gap boundaries and extreme bonuses', () => {
  for (const level of [1, 10, 25, 50, 60, 100, 250, 500, 1000, 5000, 9999, 10000]) for (const offset of [-13, -12, -6, -5, 0, 5, 6, 100]) for (const category of Object.keys(xp.XP_BALANCE.fractions)) for (const members of [1, 2, 3, 4, 5]) {
    const result = xp.calculateEncounterXp({ playerLevel: level, monsterLevel: Math.max(1, Math.min(10000, level + offset)), category, members, gearBonus: 1e15, wisdom: true, serverRate: 1e6, pluginMultiplier: 2 });
    assert.ok(Number.isSafeInteger(result) && result >= 0 && result <= xp.encounterLimit(level), JSON.stringify({ level, offset, category, members }));
  }
});

test('lazy runtime restores independent party HP/damage scalars without healing a wounded encounter', () => {
  const { createEncounterRuntime } = require('../src/world/encounter-runtime'), { maps } = require('../src/world/game-world');
  const player = hero(), players = new Map([[1, player]]), mobs = new Map(), saved = { a: { health: .5, ps: 2.8, partyDamageScale: 1.32 } };
  const runtime = createEncounterRuntime({ players, mobs, spawnMob: (type, x, y) => { const monster = { id: 9, ty: type, x, y, mh: 100, hp: 100, ps: 1 }; mobs.set(9, monster); return monster; } });
  runtime.register({ id: 1, map: maps[0], zoneIndex: 0, min: 0, max: 99999, outer: true, storage: () => saved, loadPlan: () => ({ spawns: [{ id: 'a', encounterId: 'camp:0', type: 'wolf', x: 6020, y: 6000 }], encounters: [{ id: 'camp:0', x: 6020, y: 6000, spawnIds: ['a'] }] }) });
  runtime.tick(1000); const monster = mobs.get(9); assert.equal(monster.mh, 280); assert.equal(monster.hp, 140); assert.equal(monster.partyDamageScale, 1.32);
  const tracker = createEncounterParticipation({ players, teams: {} }); tracker.begin(player, monster); assert.equal(monster.hp, 140); assert.equal(monster.mh, 280);
  runtime.checkpoint(); assert.equal(saved.a.partyDamageScale, 1.32); assert.equal(saved.a.health, .5);
});

test('abandoned claims expire without healing, and replacement connections cannot inherit old participation', () => {
  const game = setup(2, { share: false }), [a, b] = game.roster; game.combat.hitMob(a, game.monster, 500); game.teams.chatCommands.share.fn(a);
  const maximum = game.monster.mh, wounded = game.monster.hp, clock = Date.now, later = Date.now() + 46000;
  Date.now = () => later;
  try { game.combat.hitMob(b, game.monster, 500); assert.equal(game.monster.mh, maximum); assert.ok(game.monster.hp < wounded); game.combat.hitMob(a, game.monster, 500); game.combat.hitMob(a, game.monster, 1e9); }
  finally { Date.now = clock; }
  const expected = xp.calculateEncounterXp({ playerLevel: 100, monsterLevel: 100, members: 2, healthScale: 1 });
  assert.equal(a.xp, expected); assert.equal(b.xp, expected);
  const replaced = setup(2); participate(replaced); const old = replaced.roster[1], replacement = hero(old.id); replacement.team = old.team; replaced.players.set(old.id, replacement);
  replaced.combat.hitMob(replaced.roster[0], replaced.monster, 1e9); assert.equal(replacement.xp, 0); assert.equal(old.xp, 0);
});

test('live combat ignores leftover gear XP bonus and matches the simulator for Wisdom, server-rate and party caps', () => {
  for (const size of [1, 2, 5]) for (const bonus of [0, 100, 1e6]) for (const wisdom of [false, true]) for (const rate of [0, 1, 10, 1e6]) {
    const game = setup(size, { rate }); for (const player of game.roster) { player.g.xpb = bonus; player.buf.xp = wisdom ? Date.now() + 10000 : 0; }
    participate(game); game.combat.hitMob(game.roster[0], game.monster, 1e9);
    for (const player of game.roster) assert.equal(player.xp, xp.calculateEncounterXp({ playerLevel: 100, monsterLevel: 100, members: size, gearBonus: 0, wisdom, serverRate: rate }));
  }
});

test('all live encounter categories match the centralized reward policy', () => {
  const previous = MOBTYPES.economyworldboss; MOBTYPES.economyworldboss = { ...MOBTYPES.deathlord, worldBoss: true };
  try {
    for (const category of Object.keys(xp.XP_BALANCE.fractions)) {
      const game = setup(), monster = game.monster;
      monster.ty = category === 'stone' ? 'stone' : category === 'boss' ? 'alphawolf' : category === 'worldBoss' ? 'economyworldboss' : 'wolf';
      monster.alpha = category === 'alpha'; monster.summoned = category === 'summoned'; monster.anomaly = category === 'anomaly';
      if (category === 'stone') monster.stoneStep = 5;
      game.combat.hitMob(game.roster[0], monster, 1e9);
      assert.equal(game.roster[0].xp, xp.calculateEncounterXp({ playerLevel: 100, monsterLevel: 100, category }), category); assert.equal(game.drops.length, 1);
    }
  } finally { if (previous) MOBTYPES.economyworldboss = previous; else delete MOBTYPES.economyworldboss; }
  for (const level of [NaN, Infinity, -1, 0, 10001]) for (const category of ['normal', 'constructor', 'unknown']) assert.equal(xp.encounterBaseXp(level, category), 0);
  assert.equal(xp.encounterBaseXp(100, 'constructor'), 0); assert.equal(xp.finalizeXpAward(NaN, 100), 0);
});
