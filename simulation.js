'use strict';

const { nearby } = require('./spatial-index');
const { CX, CY, rnd, dist, clampWorld, moveToward, inVillage, placeInVillage, mapOf } = require('./game-world');
const { CLASSES, playerDmg, rank, passive, gearAttackSpeed, playerMoveSpeed } = require('./characters');
const { MOBTYPES, STONE_DMG } = require('./monsters');

function createSimulation({ players, mobs, loot, rates, respawnMonster, hitMob, hurtPlayer, startCast, resolveCast, pickupTick, ev, fire, publishSnapshots, getTransportStats, updateEncounters = () => {}, processJobs = () => {}, resetEncounter = () => {} }) {
  const tickSeconds = 0.05;
  const activeMonsters = new Set();
  let maintenanceAt = 0, overruns = 0, snapshotsSkipped = 0;
  let tickMs = 0, tickSample = 0;
  let skipPreviousSnapshot = false;
  const tickTimes = new Float64Array(1200);
  function tick() {
    const now = Date.now(), startedAt = process.hrtime.bigint(); fire('tick', tickSeconds);
    updateEncounters(now);
    const activePlayers = [...players.values()];
    updatePlayers(activePlayers, now);
    processJobs(activePlayers);
    for (const player of activePlayers) players.update?.(player);
    updateMonsters(activePlayers, now);
    pickupTick(now);
    // Shed network work when simulation has already exhausted its budget, but never
    // skip two snapshots in a row (events remain queued until the next publication).
    const simulationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    if (simulationMs >= 50 && !skipPreviousSnapshot) { snapshotsSkipped++; skipPreviousSnapshot = true; }
    else { publishSnapshots(activePlayers, now); skipPreviousSnapshot = false; }
    const elapsed = Number(process.hrtime.bigint() - startedAt) / 1e6;
    if (elapsed > 50) overruns++;
    tickTimes[tickSample++ % tickTimes.length] = elapsed;
    tickMs = tickMs * 0.95 + elapsed * 0.05;
  }

  function updatePlayers(activePlayers, now) {
    for (const player of activePlayers) {
      if (player.dead) {
        if (now > player.dead) {
          player.dead = 0;
          player.hp = player.maxhp;
          player.mp = player.maxmp;
          placeInVillage(player);
          player.target = 0;
          player.chasingTarget = false;
          player.dest = null;
          player.dir = { x: 0, y: 0 };
        }
        continue;
      }

      const characterClass = CLASSES[player.cls];
      const movementMap = mapOf(player);
      const speed = playerMoveSpeed(player, now);
      player.spdNow = speed;
      const directionLength = Math.hypot(player.dir.x, player.dir.y);
      const target = player.target ? mobs.get(player.target) : null;
      if (player.target && (!target || target.dead)) {
        player.target = 0;
        player.chasingTarget = false;
      }

      if (directionLength > 0.01) {
        player.x += player.dir.x / directionLength * speed * tickSeconds;
        player.y += player.dir.y / directionLength * speed * tickSeconds;
        player.dest = null;
        player.chasingTarget = false;
      } else if (player.dest) {
        if (moveToward(player, player.dest.x, player.dest.y, speed, tickSeconds) < 6) player.dest = null;
      } else if (player.chasingTarget && target && !target.dead) {
        if (dist(player, target) > characterClass.range + target.r - 6) {
          moveToward(player, target.x, target.y, speed, tickSeconds);
        }
      }
      clampWorld(player, movementMap);
      if (!inVillage(player) && target && !target.dead && now >= player.cd && dist(player, target) <= characterClass.range + target.r) {
        player.cd = now + (now < player.buf.rage ? 600 : 800) * (1 - passive(player, 'haste')) * (1 - gearAttackSpeed(player)); ev('atk', player.x, player.y, 0, { tx: Math.round(target.x), ty: Math.round(target.y), s: player.cls, a: player.id });
        hitMob(player, target, playerDmg(player));
      }
      player.hp = Math.min(player.maxhp, player.hp + player.maxhp * (inVillage(player) ? 0.05 : 0.006) * tickSeconds); player.mp = Math.min(player.maxmp, player.mp + (2 + player.lvl * 0.2) * (1 + 2 * passive(player, 'focus')) * tickSeconds);
    }
  }

  function updateMonsters(activePlayers, now) {
    // Cheap lifecycle checks for distant monsters run at 2 Hz, not the 20 Hz AI rate.
    if (now >= maintenanceAt) {
      maintenanceAt = now + 500;
      for (const monster of mobs.values()) {
        if (monster.expiresAt && now >= monster.expiresAt) { mobs.delete(monster.id); activeMonsters.delete(monster); continue; }
        if (monster.dead && now > monster.dead) respawnMonster(monster);
        mobs.update?.(monster);
        if (monster.target || monster.cast) activeMonsters.add(monster);
      }
    }
    const candidates = new Set(activeMonsters);
    for (const player of activePlayers) for (const monster of nearby(mobs, player, 1700)) candidates.add(monster);
    for (const monster of candidates) {
      if (mobs.get(monster.id) !== monster) { activeMonsters.delete(monster); continue; }
      try {
        if (monster.expiresAt && now >= monster.expiresAt) { mobs.delete(monster.id); continue; }
        const template = MOBTYPES[monster.ty];
        if (monster.dead) { if (now > monster.dead) respawnMonster(monster); continue; }
        if (template.stone) {
          updateSpiritStone(monster, nearby(players, monster, 300), now);
          continue;
        }
        // sleeping monsters (no player nearby) cost almost nothing
        if (!monster.target && now > monster.wake) { monster.wake = now + 600; monster.awake = false; for (const player of nearby(players, monster, 1700)) if (Math.abs(player.x - monster.x) < 1700 && Math.abs(player.y - monster.y) < 1700) { monster.awake = true; break; } }
        if (!monster.awake && !monster.target) continue;
        if (monster.cast && now >= monster.cast.at) resolveCast(monster, activePlayers, now);
        let targetPlayer = monster.target ? players.get(monster.target) : null; const leash = template.boss ? 1000 : monster.alpha ? 850 : 700;
        const canTarget = player => !player.dead && !inVillage(player) && Math.hypot(player.x - monster.sx, player.y - monster.sy) <= leash;
        if (targetPlayer && !canTarget(targetPlayer)) { targetPlayer = null; monster.target = 0; }
        if (!targetPlayer) for (const player of nearby(players, monster, template.aggro)) if (Math.abs(player.x - monster.x) < template.aggro && Math.abs(player.y - monster.y) < template.aggro && dist(player, monster) < template.aggro && canTarget(player)) { monster.target = player.id; targetPlayer = player; break; }
        if (targetPlayer) {
          const distance = dist(monster, targetPlayer);
          if (template.boss && !monster.cast && now > monster.slamT) startCast(monster, targetPlayer, distance, now);
          if (monster.cast && monster.cast.s !== 'summon') continue;
          if (distance > monster.r + 20) { const ox = monster.x, oy = monster.y; moveToward(monster, targetPlayer.x, targetPlayer.y, template.spd * (monster.alpha ? 1.1 : 1), tickSeconds); if (inVillage(monster)) { monster.x = ox; monster.y = oy; } }
          else if (now >= monster.cd) { monster.cd = now + (monster.alpha ? 950 : 1100); hurtPlayer(targetPlayer, monster, monster.dmg * (monster.partyDamageScale || 1) * rates.monsterDamage * rnd(0.8, 1.2), now); }
        } else {
          const d = moveToward(monster, monster.hx, monster.hy, template.spd * 0.5, tickSeconds);
          if (d < 5 && Math.random() < 0.02) {
            const home = { x: monster.sx + rnd(-70, 70), y: monster.sy + rnd(-70, 70) };
            clampWorld(home, mapOf(monster));
            monster.hx = home.x;
            monster.hy = home.y;
          }
          if (monster.hp < monster.mh) monster.hp = Math.min(monster.mh, monster.hp + monster.mh * 0.05 * tickSeconds);
          // Back home and healed: a monster made tougher by a team goes back to normal.
          else if (monster.ps > 1 || monster.combatActive) { monster.mh = Math.max(1, Math.round(monster.mh / (monster.ps || 1))); monster.hp = monster.mh; monster.ps = 1; resetEncounter(monster); }
        }
      } finally {
        mobs.update?.(monster);
        const returning = !MOBTYPES[monster.ty].stone && monster.awake && (monster.ps > 1 || Math.hypot(monster.x - monster.hx, monster.y - monster.hy) > 5 || monster.hp < monster.mh);
        if (!monster.dead && mobs.has(monster.id) && (monster.target || monster.cast || returning)) activeMonsters.add(monster);
        else activeMonsters.delete(monster);
      }
    }
  }

  function updateSpiritStone(monster, activePlayers, now) {
    const recovery = monster.stoneStep < 5 ? 0 : monster.mh * 0.004 * tickSeconds;
    monster.hp = Math.min(monster.mh, monster.hp + recovery);
    if (monster.cast && now >= monster.cast.at) {
      const radius = monster.cast.r;
      ev('slam', monster.x, monster.y, radius, { s: 'pulse' });
      for (const player of activePlayers) {
        if (!player.dead && !inVillage(player) && dist(player, monster) <= radius) {
          const damage = STONE_DMG[Math.min(6, monster.tier)] * monster.pulseMultiplier * (monster.partyDamageScale || 1) * rates.monsterDamage;
          hurtPlayer(player, monster, damage, now);
        }
      }
      monster.cast = null;
    } else if (!monster.cast && monster.stoneStep < 5 && now > (monster.slamT || 0)) {
      if (!activePlayers.some(player => !player.dead && !inVillage(player) && dist(player, monster) < 300)) return;
      monster.slamT = now + 6500;
      monster.cast = { at: now + 1300, r: 230 };
      ev('warn', monster.x, monster.y, 230, { s: 'pulse', a: monster.id });
    }
  }

  function serverStats() {
    const times = tickTimes.slice(0, Math.min(tickSample, tickTimes.length)).sort();
    return { players: players.size, mobs: mobs.size, awake: [...mobs.values()].filter(m => m.awake || m.target).length,
      loot: loot.size, tickOverruns: overruns, snapshotsSkipped, tickMs: Math.round(tickMs * 100) / 100, tickP95: Math.round((times[Math.ceil(times.length * .95) - 1] || 0) * 100) / 100,
      tickMax: Math.round((times[times.length - 1] || 0) * 100) / 100, ...getTransportStats() };
  }

  return { tick, serverStats, tickIntervalMs: tickSeconds * 1000 };
}

module.exports = { createSimulation };
