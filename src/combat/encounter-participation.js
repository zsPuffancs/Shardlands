'use strict';
const { mapOf } = require('../world/game-world');
const { XP_BALANCE, partyDamageScale } = require('../progression/xp-economy');
const { partyHealthScale } = require('./enemy-scaling');
// A fixed roster and sharing policy are captured once. No membership scans run on server ticks.
function createEncounterParticipation({ players, teams }) {
  const fights = new WeakMap(), identities = new WeakMap();
  function identity(player) { let token = identities.get(player); if (!token) { token = {}; identities.set(player, token); } return token; }
  function begin(player, monster) {
    let fight = fights.get(monster);
    if (fight && fight.epoch === (monster.combatEpoch || 0) && Date.now() - fight.lastActivity <= XP_BALANCE.participationWindowMs) return fight;
    const shared = !!teams?.sharesLoot?.(player);
    const candidates = shared ? teams.nearbyMembers(player, monster) : [player];
    const members = [...new Set(candidates)].filter(member => players.get(member.id) === member && !member.dead && mapOf(member) === mapOf(monster) && Math.hypot(member.x - monster.x, member.y - monster.y) <= XP_BALANCE.sharingRadius).slice(0, XP_BALANCE.partySizeCap);
    // Keep only session tokens and IDs, never disconnected player/connection objects.
    fight = { epoch: monster.combatEpoch || 0, shared, members: members.map(member => ({ id: member.id, token: identity(member) })), damage: new Map(), lastActivity: Date.now() };
    fights.set(monster, fight);
    monster.combatActive = true;
    if (!monster.fightStart) monster.fightStart = Date.now();
    // Scale only a pristine encounter, before any damage. Mid-fight changes never heal or inflate it.
    // Health grows per member by category (bosses most, enemy-scaling.js); XP still pays the normal party scale.
    if (monster.hp === monster.mh && (monster.ps || 1) === 1) {
      const scale = partyHealthScale(monster.cat || (monster.alpha ? 'alpha' : 'normal'), members.length);
      monster.mh = Math.round(monster.mh * scale); monster.hp = monster.mh; monster.ps = scale;
      monster.partyDamageScale = partyDamageScale(members.length);
    }
    return fight;
  }
  function record(player, monster, damage, now) {
    const fight = begin(player, monster);
    if (!fight.members.some(member => member.id === player.id && member.token === identity(player))) return;
    const entry = fight.damage.get(player.id) || { damage: 0, lastHit: now };
    entry.damage = Math.min(monster.mh, entry.damage + Math.max(0, damage)); entry.lastHit = now;
    fight.damage.set(player.id, entry);
    fight.lastActivity = now;
  }
  function recipients(monster, now) {
    const fight = fights.get(monster); if (!fight || fight.settled) return [];
    fight.settled = true;
    return fight.members.map(member => {
      const player = players.get(member.id), contribution = fight.damage.get(member.id);
      return player && identities.get(player) === member.token && !player.dead && mapOf(player) === mapOf(monster) && Math.hypot(player.x - monster.x, player.y - monster.y) <= XP_BALANCE.sharingRadius && contribution && contribution.damage >= monster.mh * XP_BALANCE.minimumDamageFraction && now - contribution.lastHit <= XP_BALANCE.participationWindowMs ? player : null;
    }).filter(Boolean);
  }
  function reset(monster) { fights.delete(monster); monster.combatEpoch = (monster.combatEpoch || 0) + 1; monster.combatActive = false; monster.partyDamageScale = 1; monster.fightStart = 0; monster.phase = 0; monster.recoverUntil = 0; }
  return { begin, record, recipients, reset };
}
module.exports = { createEncounterParticipation };
