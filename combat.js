'use strict';

const { nearby } = require('./spatial-index');
const { localizedText: messageText } = require('./localized-text');

const { clampWorld, mapOf, inVillage, dist, rnd, rint, pick } = require('./game-world');
const { MOBTYPES, TIERS, SPECIAL } = require('./monsters');
const { CLASSES, critCh, critMul, defRed, playerDmg, rank, passive, gearLifesteal } = require('./characters');

const { XP_BALANCE, levelGapScale, encounterCategory, encounterShare } = require('./xp-economy');
const { createEncounterParticipation } = require('./encounter-participation');
const XP_LEVEL_GAP_LIMIT = XP_BALANCE.overlevelCutoff;
const canEarnMonsterXp = (hero, monster) => levelGapScale(hero.lvl, monster.lvl) > 0;
const { SUMMON_LIFETIME_MS, createSummons } = require('./summons');
const { ENEMY_SCALING, bossPhase, bossPressure, recoverMs } = require('./enemy-scaling');

function createCombat({ mobs, players, rates, spawnMob, ev, fire, gainXp, dropLoot, broadcast, say, teams }) {
  const summons = createSummons({ mobs, spawnMob });
  const participation = createEncounterParticipation({ players, teams }), processingHits = new WeakSet();
  function hitMob(player, monster, damage) {
    if (player.dead || inVillage(player) || monster.dead || monster.hp <= 0 || !Number.isFinite(damage) || damage <= 0 || processingHits.has(monster)) return;
    processingHits.add(monster);
    try {
      const criticalHit = Math.random() < critCh(player);
      if (criticalHit) damage *= critMul(player);
      // A boss recovering from a telegraphed attack is open: hits land harder (the punish window).
      const punished = monster.boss && monster.recoverUntil > Date.now();
      if (punished) damage *= ENEMY_SCALING.boss.punishBonus;
      damage = Math.max(1, Math.round(damage * rnd(0.9, 1.1)));
      const hit = { v: damage, crit: criticalHit };
      fire('damage', player, monster, hit);
      if (!Number.isFinite(hit.v) || hit.v <= 0) return;
      damage = Math.min(Number.MAX_SAFE_INTEGER, Math.max(1, Math.round(hit.v)));
      participation.begin(player, monster);
      participation.record(player, monster, Math.min(monster.hp, damage), Date.now());
      monster.hp -= damage;
      // Bosses grow more dangerous below 60% and 30% health. Everyone nearby sees the change.
      if (monster.boss && monster.hp > 0) { const phase = bossPhase(monster); if (phase > (monster.phase || 0)) { monster.phase = phase; ev('phase', monster.x, monster.y, phase, { a: monster.id, s: 'enrage', monsterType: monster.ty }); ev('fx', monster.x, monster.y, 90, { s: 'rage', a: monster.id }); } }
      ev('dmg', monster.x, monster.y, damage, {
        c: criticalHit ? 1 : 0, combatPlayerId: player.id, monsterType: monster.ty,
      });
      // Lifesteal heals a share of the character's Damage stat on every hit, not of the damage dealt
      // (crits, skill multipliers and the hit's random spread do not change the heal).
      const lifesteal = passive(player, 'lifesteal') + gearLifesteal(player);
      if (lifesteal > 0 && !player.dead) player.hp = Math.min(player.maxhp, player.hp + playerDmg(player) * lifesteal);
      const template = MOBTYPES[monster.ty];
      monster.awake = true;
      if (!template.stone && !monster.target) monster.target = player.id;
      if (template.stone) {
        const step = Math.ceil((monster.hp / monster.mh) * 5);
        while (monster.stoneStep > step && monster.hp > 0) {
          monster.stoneStep--;
          const requests = [];
          for (let i = 0; i < Math.min(12, 5 + monster.tier); i++) { const angle = rnd(0, Math.PI * 2), radius = rnd(60, 140); requests.push({ type: pick(TIERS[monster.tier].types), x: monster.x + Math.cos(angle) * radius, y: monster.y + Math.sin(angle) * radius }); }
          if (monster.stoneStep <= 3) requests.push({ type: pick(TIERS[monster.tier].types), x: monster.x + rnd(-60, 60), y: monster.y + rnd(-60, 60), options: { alpha: true } });
          for (const guardian of summons.spawnBatch(monster, requests)) guardian.target = player.id;
          ev('fx', monster.x, monster.y, 160, { s: 'summon' });
        }
      }
      if (monster.hp <= 0) killMob(player, monster);
    } finally { processingHits.delete(monster); }
  }
  function killMob(player, monster) {
    const template = MOBTYPES[monster.ty];
    monster.dead = Date.now() + (template.stone ? 90000 : template.boss ? 180000 : monster.alpha ? 90000 : rint(rates.respawnSeconds * 750, rates.respawnSeconds * 1350));
    if (player.target === monster.id) {
      player.target = 0;
      player.chasingTarget = false;
    }
    // Gold/loot retain their current sharing policy. XP uses the encounter's fixed roster and participation.
    const sharers = teams?.sharesLoot?.(player) ? teams.nearbyMembers(player, monster) : [player];
    const xpSharers = participation.recipients(monster, Date.now()).filter(hero => canEarnMonsterXp(hero, monster));
    const category = encounterCategory(monster, template);
    if (rates.xpRate > 0) for (const hero of xpSharers) {
      const amount = encounterShare({ playerLevel: hero.lvl, monsterLevel: monster.lvl, category, members: xpSharers.length, healthScale: monster.ps || 1 });
      if (amount > 0) gainXp(hero, amount, { source: 'combat', serverRate: rates.xpRate, members: xpSharers.length, healthScale: monster.ps || 1 });
    }
    dropLoot(player, monster, sharers); ev('die', monster.x, monster.y, monster.ty, { b: monster.alpha ? 1 : 0 });
    if (template.boss) { broadcast({ t: 'chat', n: '*', m: messageText("server.bossSlain", "{player} has slain {monster}!", { player: player.name, monster: messageText('monster.' + monster.ty, template.name) }) }); broadcast({ t: 'toast', m: messageText("server.bossSlain", "{player} has slain {monster}!", { player: player.name, monster: messageText('monster.' + monster.ty, template.name) }), c: '#ffd24a' }); }
    fire('kill', player, monster);
    if (monster.summoned) mobs.delete(monster.id);
  }
  function hurtPlayer(player, monster, damage, now) {
    damage = Math.max(1, Math.round(damage * (1 - defRed(player)) * (now < player.buf.def ? 0.65 : 1)));
    const hit = { v: damage };
    fire('hurt', player, monster, hit);
    damage = Math.max(0, Math.round(hit.v));
    if (!damage) return;
    player.hp -= damage; ev('hurt', player.x, player.y, damage, { a: monster.id, combatPlayerId: player.id, monsterType: monster.ty });
    if (player.hp <= 0) {
      player.hp = 0; player.dead = now + 5000; player.target = 0; player.chasingTarget = false;
      const availableGold = Math.max(0, player.gold);
      const lossRate = Math.max(0, Math.min(1, rates.deathGoldLoss));
      const loss = Math.floor(availableGold * lossRate);
      player.gold = availableGold - loss;
      say(player, messageText("server.died", "You died. Lost {gold} gold. Respawning in the village...", { gold: loss })); fire('death', player, monster);
      for (const attacker of mobs.values()) if (attacker.target === player.id) attacker.target = 0;
    }
  }
  function startCast(monster, targetPlayer, distance, now) {
    const signature = MOBTYPES[monster.ty]?.special || SPECIAL[monster.ty] || 'slam';
    monster.alt = !monster.alt;
    let attack = monster.alt ? signature : 'slam';
    const radius = monster.r + 120;
    const inRange = { slam: distance < monster.r + 170, breath: distance < monster.r + 260, charge: distance < 520, meteor: distance < 650, summon: distance < 520 };
    if (!inRange[attack]) { if (attack === signature) monster.alt = !monster.alt; attack = 'slam'; if (!inRange.slam) return; }
    const cast = { s: attack, at: now + (attack === 'meteor' ? 1450 : 1150), r: radius, ang: Math.atan2(targetPlayer.x - monster.x, targetPlayer.y - monster.y) };
    if (attack === 'breath') { cast.r = monster.r + 300; cast.half = 0.55; }
    if (attack === 'charge') {
      const length = Math.min(480, Math.max(260, distance + 120));
      const end = { x: monster.x + Math.sin(cast.ang) * length, y: monster.y + Math.cos(cast.ang) * length };
      clampWorld(end, mapOf(monster));
      const destination = inVillage(end) ? monster : end;
      cast.tx = destination.x;
      cast.ty = destination.y;
      cast.r = monster.r + 45;
    }
    if (attack === 'meteor') { cast.pts = []; for (const player of players.values()) if (!player.dead && dist(player, monster) < 700) for (let i = 0; i < 3; i++) cast.pts.push([Math.round(player.x + rnd(-120, 120)), Math.round(player.y + rnd(-120, 120))]); cast.pts.push([Math.round(targetPlayer.x), Math.round(targetPlayer.y)]); cast.r = 95; }
    monster.cast = cast; monster.slamT = now + rnd(5500, 8500) * bossPressure(monster, now).castInterval;
    ev('warn', monster.x, monster.y, cast.r, { a: monster.id, s: attack, ang: Math.round(cast.ang * 100) / 100, tx: cast.tx && Math.round(cast.tx), ty: cast.ty && Math.round(cast.ty), pts: cast.pts, half: cast.half });
  }
  function resolveCast(monster, activePlayers, now) {
    const cast = monster.cast; monster.cast = null; const pressure = bossPressure(monster, now);
    const baseDamage = monster.dmg * (monster.partyDamageScale || 1) * rates.monsterDamage * pressure.castDamage;
    // After the attack the boss recovers for a moment: it cannot move or hit and takes extra damage.
    if (cast.s !== 'summon') { monster.recoverUntil = now + recoverMs(pressure.phase); ev('phase', monster.x, monster.y, 0, { a: monster.id, s: 'stagger', monsterType: monster.ty }); }
    if (cast.s === 'slam') { ev('slam', monster.x, monster.y, cast.r, { s: 'slam' }); for (const player of activePlayers) if (!player.dead && !inVillage(player) && dist(player, monster) <= cast.r) hurtPlayer(player, monster, baseDamage * 1.8, now); }
    else if (cast.s === 'breath') { ev('slam', monster.x, monster.y, cast.r, { s: 'breath', ang: cast.ang, half: cast.half, ty: monster.ty }); for (const player of activePlayers) { if (player.dead || inVillage(player)) continue; const dd = dist(player, monster); if (dd > cast.r) continue; let da = Math.atan2(player.x - monster.x, player.y - monster.y) - cast.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); if (Math.abs(da) <= cast.half) hurtPlayer(player, monster, baseDamage * 1.7, now); } }
    else if (cast.s === 'charge') { const x0 = monster.x, y0 = monster.y; monster.x = cast.tx; monster.y = cast.ty; ev('slam', monster.x, monster.y, 70, { s: 'charge', x0: Math.round(x0), y0: Math.round(y0) });
      for (const player of activePlayers) { if (player.dead || inVillage(player)) continue; const vx = monster.x - x0, vy = monster.y - y0, L2 = vx * vx + vy * vy || 1, k = Math.max(0, Math.min(1, ((player.x - x0) * vx + (player.y - y0) * vy) / L2)), ex = x0 + vx * k - player.x, ey = y0 + vy * k - player.y; if (Math.hypot(ex, ey) < cast.r) hurtPlayer(player, monster, baseDamage * 1.5, now); } }
    else if (cast.s === 'meteor') { ev('slam', monster.x, monster.y, cast.r, { s: 'meteor', pts: cast.pts, ty: monster.ty }); for (const player of activePlayers) { if (player.dead || inVillage(player)) continue; for (const q of cast.pts) if (Math.hypot(player.x - q[0], player.y - q[1]) <= cast.r) { hurtPlayer(player, monster, baseDamage * 1.4, now); break; } } }
    else if (cast.s === 'summon') {
      ev('slam', monster.x, monster.y, 140, { s: 'summon' });
      const types = (TIERS[monster.tier] || TIERS[0]).types, requests = [];
      for (let i = 0; i < 4; i++) { const angle = rnd(0, Math.PI * 2); requests.push({ type: pick(types), x: monster.x + Math.cos(angle) * 110, y: monster.y + Math.sin(angle) * 110 }); }
      summons.spawnBatch(monster, requests);
    }
  }

  function skill(player, skillNumber) {
    const characterClass = CLASSES[player.cls], now = Date.now(); if (player.dead) return;
    if (skillNumber === 1) {
      if (inVillage(player)) return;
      const rank = player.sk.s1; if (rank < 1 || now < player.cd1) return;
      const cost = Math.round(characterClass.s1c * (1 + 0.05 * (rank - 1))); if (player.mp < cost) return;
      const maxTargets = characterClass.s1n + (player.cls === 'archer' ? (rank >= 3 ? 2 : 0) + (rank >= 5 ? 2 : 0) : 0), range = characterClass.s1r;
      const targets = []; for (const monster of nearby(mobs, player, range + 60)) if (!monster.dead && Math.abs(monster.x - player.x) < range + 60 && Math.abs(monster.y - player.y) < range + 60 && dist(player, monster) <= range + monster.r) targets.push(monster);
      if (!targets.length) return; targets.sort((a, b) => dist(player, a) - dist(player, b)); targets.length = Math.min(targets.length, maxTargets);
      player.mp -= cost; player.cd1 = now + 2000 - 100 * (rank - 1); ev('fx', player.x, player.y, characterClass.s1r, { s: player.cls, a: player.id, tx: Math.round(targets[0].x), ty: Math.round(targets[0].y) });
      targets.forEach(monster => hitMob(player, monster, playerDmg(player) * characterClass.s1m * (1 + 0.18 * (rank - 1))));
    } else if (skillNumber === 2) {
      const rank = player.sk.mend; if (rank < 1 || now < player.cd2 || player.mp < 20) return;
      player.mp -= 20; player.cd2 = now + 8000 - 500 * rank; const healAmount = Math.floor(player.maxhp * (0.2 + 0.08 * rank));
      const previousHealth = player.hp;
      player.hp = Math.min(player.maxhp, player.hp + healAmount);
      const restoredHealth = Math.round(player.hp - previousHealth);
      if (restoredHealth > 0) ev('heal', player.x, player.y, '+' + restoredHealth, { combatPlayerId: player.id, restoredHealth });
      ev('fx', player.x, player.y, 50, { s: 'heal', a: player.id });
    } else if (skillNumber === 3) {
      const rank = player.sk.frenzy; if (rank < 1 || now < player.cd3 || player.mp < 30) return;
      player.mp -= 30; player.cd3 = now + 25000; player.buf.rage = now + (6 + 2 * rank) * 1000; ev('fx', player.x, player.y, 70, { s: 'rage', a: player.id });
    }
  }

  return { hitMob, hurtPlayer, startCast, resolveCast, skill, resetEncounter: participation.reset };
}

module.exports = { XP_LEVEL_GAP_LIMIT, canEarnMonsterXp, SUMMON_LIFETIME_MS, createCombat };
