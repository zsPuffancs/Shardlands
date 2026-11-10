'use strict';

const { CX, CY, rnd, dist, clampWorld, moveToward, inVillage } = require('./game-world');
const { CLASSES, playerDmg, rank } = require('./characters');
const { MOBTYPES, STONE_DMG } = require('./monsters');

function createSimulation({ players, mobs, loot, rates, respawnMonster, hitMob, hurtPlayer, startCast, resolveCast, pickupTick, ev, fire, publishSnapshots, getTransportStats }) {
  const tickSeconds = 0.05;
  let tickMs = 0, tickSample = 0;
  const tickTimes = new Float64Array(1200);
  function tick() {
    const now = Date.now(), startedAt = process.hrtime.bigint(); fire('tick', tickSeconds);
    const activePlayers = [...players.values()];
    updatePlayers(activePlayers, now);
    updateMonsters(activePlayers, now);
    pickupTick(now);
    publishSnapshots(activePlayers, now);
    const elapsed = Number(process.hrtime.bigint() - startedAt) / 1e6;
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
          player.x = CX + rnd(-50, 50);
          player.y = CY + rnd(30, 95);
          player.target = 0;
          player.chasingTarget = false;
        }
        continue;
      }

      const characterClass = CLASSES[player.cls];
      const speed = 190 * (1 + 0.04 * rank(player, 'swift')) * (now < player.buf.spd ? 1.35 : 1) *
        (1 + Math.min(60, player.g.spd || 0) / 100);
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
      clampWorld(player);
      if (target && !target.dead && now >= player.cd && dist(player, target) <= characterClass.range + target.r) {
        player.cd = now + (now < player.buf.rage ? 600 : 800) * (1 - 0.035 * rank(player, 'haste')); ev('atk', player.x, player.y, 0, { tx: Math.round(target.x), ty: Math.round(target.y), s: player.cls, a: player.id });
        hitMob(player, target, playerDmg(player));
      }
      player.hp = Math.min(player.maxhp, player.hp + player.maxhp * (inVillage(player) ? 0.05 : 0.006) * tickSeconds); player.mp = Math.min(player.maxmp, player.mp + (2 + player.lvl * 0.2) * (1 + 0.1 * rank(player, 'focus')) * tickSeconds);
    }
  }

  function updateMonsters(activePlayers, now) {
    for (const monster of mobs.values()) {
      if (monster.expiresAt && now >= monster.expiresAt) { mobs.delete(monster.id); continue; }
      const template = MOBTYPES[monster.ty];
      if (monster.dead) { if (now > monster.dead) respawnMonster(monster); continue; }
      if (template.stone) {
        updateSpiritStone(monster, activePlayers, now);
        continue;
      }
      // sleeping monsters (no player nearby) cost almost nothing
      if (!monster.target && now > monster.wake) { monster.wake = now + 600; monster.awake = false; for (const player of activePlayers) if (Math.abs(player.x - monster.x) < 1700 && Math.abs(player.y - monster.y) < 1700) { monster.awake = true; break; } }
      if (!monster.awake && !monster.target) continue;
      if (monster.cast && now >= monster.cast.at) resolveCast(monster, activePlayers, now);
      let targetPlayer = monster.target ? players.get(monster.target) : null; const leash = template.boss ? 1000 : monster.alpha ? 850 : 700;
      if (targetPlayer && (targetPlayer.dead || inVillage(targetPlayer) || Math.hypot(targetPlayer.x - monster.sx, targetPlayer.y - monster.sy) > leash)) { targetPlayer = null; monster.target = 0; }
      if (!targetPlayer) for (const player of activePlayers) if (!player.dead && Math.abs(player.x - monster.x) < template.aggro && Math.abs(player.y - monster.y) < template.aggro && dist(player, monster) < template.aggro && !inVillage(player)) { monster.target = player.id; targetPlayer = player; break; }
      if (targetPlayer) {
        const distance = dist(monster, targetPlayer);
        if (template.boss && !monster.cast && now > monster.slamT) startCast(monster, targetPlayer, distance, now);
        if (monster.cast && monster.cast.s !== 'summon') continue;
        if (distance > monster.r + 20) { const ox = monster.x, oy = monster.y; moveToward(monster, targetPlayer.x, targetPlayer.y, template.spd * (monster.alpha ? 1.1 : 1), tickSeconds); if (inVillage(monster)) { monster.x = ox; monster.y = oy; } }
        else if (now >= monster.cd) { monster.cd = now + (monster.alpha ? 950 : 1100); hurtPlayer(targetPlayer, monster, monster.dmg * rates.monsterDamage * rnd(0.8, 1.2), now); }
      } else {
        const d = moveToward(monster, monster.hx, monster.hy, template.spd * 0.5, tickSeconds);
        if (d < 5 && Math.random() < 0.02) { monster.hx = monster.sx + rnd(-70, 70); monster.hy = monster.sy + rnd(-70, 70); }
        if (monster.hp < monster.mh) monster.hp = Math.min(monster.mh, monster.hp + monster.mh * 0.05 * tickSeconds);
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
        if (!player.dead && dist(player, monster) <= radius) {
          const damage = STONE_DMG[Math.min(6, monster.tier)] * monster.pulseMultiplier * rates.monsterDamage;
          hurtPlayer(player, monster, damage, now);
        }
      }
      monster.cast = null;
    } else if (!monster.cast && monster.stoneStep < 5 && now > (monster.slamT || 0)) {
      if (!activePlayers.some(player => !player.dead && dist(player, monster) < 300)) return;
      monster.slamT = now + 6500;
      monster.cast = { at: now + 1300, r: 230 };
      ev('warn', monster.x, monster.y, 230, { s: 'pulse', a: monster.id });
    }
  }

  function serverStats() {
    const times = tickTimes.slice(0, Math.min(tickSample, tickTimes.length)).sort();
    return { players: players.size, mobs: mobs.size, awake: [...mobs.values()].filter(m => m.awake || m.target).length,
      loot: loot.size, tickMs: Math.round(tickMs * 100) / 100, tickP95: Math.round((times[Math.ceil(times.length * .95) - 1] || 0) * 100) / 100,
      tickMax: Math.round((times[times.length - 1] || 0) * 100) / 100, ...getTransportStats() };
  }

  return { tick, serverStats, tickIntervalMs: tickSeconds * 1000 };
}

module.exports = { createSimulation };
