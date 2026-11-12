'use strict';
// Enemy scaling (enemy-scaling.js): category multipliers, world progression, party scaling, boss phases,
// and time-to-kill / time-to-death against heroes built with the live player formulas.
const test = require('node:test'), assert = require('node:assert/strict');
const scaling = require('../src/combat/enemy-scaling');
const balance = require('../scripts/combat-balance');
const { MOBTYPES, TIERS } = require('../src/combat/monsters');
const xp = require('../src/progression/xp-economy');
const { monsterGoldRewards } = require('../src/economy/gold-rewards');

const { ENEMY_SCALING } = scaling;
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), a + ' != ' + b);
const LOW = { heroLevel: 10, rarity: 1, plus: 1 }, MID = { heroLevel: 150, rarity: 2, plus: 3, worldTier: 10 }, HIGH = { heroLevel: 1000, rarity: 3, plus: 5, worldTier: 40 };

test('category multipliers sit on one level budget and are applied exactly once', () => {
  for (const level of [1, 30, 100, 1000, 10000]) for (const worldTier of [1, 7, 8, 40]) {
    const normal = scaling.monsterStats({ level, worldTier }), at = category => scaling.monsterStats({ level, worldTier, category });
    close(at('alpha').hp / normal.hp, 3); close(at('alpha').dmg / normal.dmg, 1.5);
    const boss = scaling.categoryMultiplier('boss', worldTier), world = scaling.categoryMultiplier('worldBoss', worldTier);
    assert.ok(boss.hp >= 8 && boss.hp <= 12 && world.hp >= 15 && world.hp <= 20);
    close(at('boss').hp / normal.hp, boss.hp); close(at('boss').dmg / normal.dmg, 1.8);
    close(at('worldBoss').hp / normal.hp, world.hp); close(at('worldBoss').dmg / normal.dmg, 2);
  }
  // Spawned monsters carry the same ratio: the spawner adds nothing on top (old x5 alpha / x3 world boss are gone).
  const normal = balance.spawn({ category: 'normal', level: 150, worldTier: 10 }).monster, alpha = balance.spawn({ category: 'alpha', level: 150, worldTier: 10 }).monster;
  close(alpha.hb / normal.hb, 3); close(alpha.dmg / normal.dmg, 1.5);
  assert.equal(normal.cat, 'normal'); assert.equal(alpha.cat, 'alpha');
  const wb = balance.spawn({ category: 'worldBoss', level: 150, worldTier: 10 }).monster; assert.equal(wb.cat, 'worldBoss'); assert.equal(wb.worldBoss, true);
});

test('normal enemies survive long enough to fight back and are a real threat in groups', () => {
  for (const player of [LOW, MID, HIGH]) {
    const one = balance.encounter({ ...player, category: 'normal' }), pack = balance.encounter({ ...player, category: 'normal', pack: 3 });
    assert.ok(one.ttk >= 2 && one.ttk <= 12, 'normal TTK ' + one.ttk + ' at ' + player.heroLevel);
    assert.ok(one.ttdNoHeal >= 8 && one.ttdNoHeal <= 40, 'normal TTD ' + one.ttdNoHeal);
    // Three at once: the hero dies before they are all down unless they heal or use their skills.
    if (player.heroLevel >= 45) assert.ok(pack.ttdNoHeal < pack.ttk, 'pack is dangerous at ' + player.heroLevel);
  }
  // Archetypes keep their identity: the Magma Golem is tougher than the Hellhound next to it.
  const hound = balance.spawn({ type: 'hellhound', category: 'normal', level: 25 }).monster, golem = balance.spawn({ type: 'golem', category: 'normal', level: 25 }).monster;
  assert.ok(golem.hb > hound.hb * 1.5);
});

test('alphas are a meaningful optional challenge with better rewards', () => {
  for (const player of [LOW, MID, HIGH]) {
    const normal = balance.encounter({ ...player, category: 'normal' }), alpha = balance.encounter({ ...player, category: 'alpha' });
    close(alpha.ttk / normal.ttk, 3, 1e-6); assert.ok(alpha.ttdNoHeal < normal.ttdNoHeal / 1.4);
  }
  assert.equal(ENEMY_SCALING.alpha.aggroRange > 1, true);
  // XP per unit of health: alphas pay 3x a normal for 3x the health (before: 3x for 5x).
  close(xp.encounterBaseXp(200, 'alpha') / xp.encounterBaseXp(200, 'normal'), 3);
});

test('regional bosses and World Bosses take real effort and punish mistakes', () => {
  for (const player of [LOW, MID, HIGH]) {
    const boss = balance.encounter({ ...player, category: 'boss' }), world = balance.encounter({ ...player, category: 'worldBoss' }), normal = balance.encounter({ ...player, category: 'normal' });
    assert.ok(boss.ttk > normal.ttk * 7, 'boss TTK');
    assert.ok(world.ttk > boss.ttk * 1.3, 'world boss is tougher than a boss');
    assert.ok(world.ttk < 300, 'solo World Boss stays beatable: ' + world.ttk);
    // A telegraphed attack hurts, more so once the early levels are over (two undodged attacks in the last phase are deadly mid-game).
    const share = player.heroLevel >= 25 ? 0.2 : 0.1;
    assert.ok(boss.castHit > boss.heroHp * share * 0.8 && world.castHit > world.heroHp * share, 'cast hit ' + world.castHit + ' / ' + world.heroHp);
  }
  const mid = balance.encounter({ ...MID, category: 'worldBoss' }); assert.ok(mid.castHit * 1.3 * 2 > mid.heroHp);
});

test('boss phases speed up attacks below 60% and 30% health; World Bosses enrage in long fights', () => {
  const boss = { boss: true, worldBoss: true, hp: 100, mh: 100, fightStart: 1000 };
  assert.equal(scaling.bossPressure(boss, 2000).phase, 0); assert.equal(scaling.bossPressure(boss, 2000).castInterval, 1);
  boss.hp = 59; const two = scaling.bossPressure(boss, 2000); assert.equal(two.phase, 1); assert.ok(two.castInterval < 1 && two.castDamage > 1);
  boss.hp = 29; const three = scaling.bossPressure(boss, 2000); assert.equal(three.phase, 2); assert.ok(three.castInterval < two.castInterval && three.attackSpeed > two.attackSpeed);
  const enraged = scaling.bossPressure(boss, 1000 + ENEMY_SCALING.boss.worldBossEnrage.afterMs); assert.equal(enraged.enraged, true); assert.ok(enraged.castDamage > three.castDamage);
  assert.equal(scaling.bossPressure({ ...boss, worldBoss: false }, 1e12).enraged, false);
  assert.equal(scaling.bossPressure({ alpha: 1, hp: 1, mh: 100 }).attackSpeed, 1);
  assert.ok(scaling.recoverMs(2) < scaling.recoverMs(0) && ENEMY_SCALING.boss.punishBonus > 1);
});

test('a group kills faster than one hero but cannot trivialise bosses; damage grows gently', () => {
  for (const player of [MID, HIGH]) for (const category of ['normal', 'boss', 'worldBoss']) {
    const solo = balance.encounter({ ...player, category }), four = balance.encounter({ ...player, category, party: 4 });
    assert.ok(four.ttk < solo.ttk, category + ' is faster in a group');
    assert.ok(four.ttk > solo.ttk * (category === 'normal' ? 0.5 : 0.65), category + ' group TTK ' + four.ttk + ' vs ' + solo.ttk);
    close(four.monsterHit / solo.monsterHit, xp.partyDamageScale(4), 1e-3);
  }
  assert.ok(scaling.partyHealthScale('worldBoss', 4) > scaling.partyHealthScale('boss', 4) && scaling.partyHealthScale('boss', 4) > scaling.partyHealthScale('normal', 4));
  assert.equal(scaling.partyHealthScale('normal', 4), xp.partyHpScale(4));
  // XP pays at most the normal party scale, so the larger boss health never inflates XP.
  close(xp.partyAllocation(4, scaling.partyHealthScale('worldBoss', 4)), xp.partyAllocation(4, xp.partyHpScale(4)));
});

test('each world is harder than the last, with controlled sublinear growth and no plateau', () => {
  let previous = scaling.worldFactor(7);
  assert.deepEqual([previous.hp, previous.dmg], [1, 1]);
  for (let tier = 8; tier <= 2000; tier++) {
    const now = scaling.worldFactor(tier);
    assert.ok(now.hp > previous.hp && now.dmg > previous.dmg, 'grows at ' + tier);
    assert.ok(now.hp - previous.hp <= scaling.worldFactor(8).hp - 1 + 1e-12, 'never accelerates');
    previous = now;
  }
  assert.ok(scaling.worldFactor(300).hp < 5 && scaling.worldFactor(300).dmg < 8);
  // On-level, the same gear tier faces more danger in later worlds (rows from the balance model).
  const rows = balance.worlds([8, 10, 25, 50]).map(([normal]) => normal);
  for (let i = 1; i < rows.length; i++) { assert.ok(rows[i].ttk > rows[i - 1].ttk); assert.ok(rows[i].ttdNoHeal < rows[i - 1].ttdNoHeal); }
  // Monster levels still follow the region levels: the level argument is used as given.
  const spawned = balance.spawn({ category: 'normal', level: 777, worldTier: 30 }).monster; assert.equal(spawned.lvl, 777);
});

test('health and damage grow steadily with level, without blowing up at the level cap', () => {
  let last = scaling.monsterStats({ level: 1 });
  for (const level of [2, 5, 10, 30, 60, 100, 300, 500, 1000, 3000, 5000, 10000]) {
    const now = scaling.monsterStats({ level });
    assert.ok(now.hp > last.hp && now.dmg > last.dmg, 'grows at ' + level);
    assert.ok(Number.isSafeInteger(Math.round(now.hp)) && Number.isSafeInteger(Math.round(now.dmg)));
    last = now;
  }
  // Very high levels: on-level heroes with the matching gear can still fight (no runaway like level^1.9).
  for (const [heroLevel, worldTier, rarity, plus] of [[5000, 160, 4, 7], [10000, 320, 5, 9]]) {
    const normal = balance.encounter({ heroLevel, worldTier, rarity, plus, category: 'normal' });
    assert.ok(normal.ttk < 20 && normal.ttdNoHeal > 2, 'level ' + heroLevel + ' TTK ' + normal.ttk + ' TTD ' + normal.ttdNoHeal);
  }
  // Separate knobs: changing the HP target leaves damage alone.
  assert.notEqual(ENEMY_SCALING.normalTimeToKill, ENEMY_SCALING.normalHitsToKill);
});

test('loot and XP keep working with the new categories', () => {
  const generated = balance.spawn({ category: 'worldBoss', level: 300, worldTier: 15 }), normal = balance.spawn({ category: 'normal', level: 300, worldTier: 15 });
  assert.equal(xp.encounterCategory(generated.monster, generated.template), 'worldBoss');
  assert.ok(generated.monster.xp > normal.monster.xp * 5);
  const gold = monsterGoldRewards({ monster: generated.monster, template: generated.template, generated: true, rate: 1, roll: .5, bonuses: [0] })[0];
  const normalGold = monsterGoldRewards({ monster: normal.monster, template: normal.template, generated: true, rate: 1, roll: .5, bonuses: [0] })[0];
  assert.ok(Number.isSafeInteger(gold) && gold > normalGold * 5);
  // Founding monsters: stones keep pulsing, and the Death Zone's bosses keep their zone level rules.
  const stone = balance.spawn({ type: 'voidstone', category: 'normal', level: 46 }).monster; assert.ok(stone.pulseMultiplier > 0 && stone.dmg === 0);
  assert.equal(TIERS.length >= 7 && MOBTYPES.deathlord.boss, true);
});
