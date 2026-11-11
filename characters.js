'use strict';

const { MAX_SAFE_AMOUNT, LEVEL_UPS_PER_TICK, validAmount, credit } = require('./safety-limits');
const { localizedText: messageText } = require('./localized-text');

const { SLOTS, NO_DMG, PASSIVES, REMOVED_STATS, plusMul } = require('./equipment');
const { MAX_PLAYER_LEVEL, validLevel, xpNeed, applyXpBonuses, finalizeXpAward, encounterLimit } = require('./xp-economy');

const CLASSES = {
  blade:  { name: 'Blade',  desc: 'Melee tank with a sweeping whirlwind.', color: '#b9bccb', fam: 'sword', range: 40,  hp: 1.25, mp: 0.8, atk: 1.0,  s1: 'Whirlwind', s1r: 100, s1m: 1.8, s1c: 15, s1n: 99, s2: 'Second Wind',  s3: 'Battle Rage' },
  archer: { name: 'Archer', desc: 'Ranged hunter, hits several targets.',  color: '#5fae56', fam: 'bow',   range: 260, hp: 1.0,  mp: 1.0, atk: 0.9,  s1: 'Multishot', s1r: 260, s1m: 1.4, s1c: 18, s1n: 3,  s2: 'Herbal Salve', s3: 'Eagle Focus' },
  mage:   { name: 'Mage',   desc: 'Glass cannon with a huge nova.',        color: '#8b63d8', fam: 'staff', range: 210, hp: 0.85, mp: 1.5, atk: 1.05, s1: 'Nova',      s1r: 140, s1m: 2.2, s1c: 25, s1n: 99, s2: 'Healing Light', s3: 'Arcane Surge' },
};
const ITEMS = { // stackable consumables. w = random drop weight (0 = shop only)
  hp:    { n: 'Health Potion',         price: 40,  d: 'Restores 40% HP',              w: 30, color: '#e24a4a' },
  hp2:   { n: 'Greater Health Potion', price: 150, d: 'Restores 100% HP',             w: 6,  color: '#ff2a6a' },
  mp:    { n: 'Mana Potion',           price: 50,  d: 'Restores 50% MP',              w: 24, color: '#4a8fe2' },
  atk:   { n: 'Fury Elixir',           price: 120, d: '+30% damage for 60s (stacks up to 5 min)',          w: 8,  color: '#ff9a3a' },
  def:   { n: 'Iron Elixir',           price: 120, d: '-35% damage taken for 60s (stacks up to 5 min)',    w: 8,  color: '#aab4c0' },
  spd:   { n: 'Swift Scroll',          price: 80,  d: '+35% move speed for 60s (stacks up to 5 min)',      w: 8,  color: '#3ae0c0' },
  xp:    { n: 'Wisdom Scroll',         price: 300, d: '+50% XP for 5 minutes',        w: 4,  color: '#b06aff' },
  ret:   { n: 'Return Scroll',         price: 60,  d: 'Teleports you to the village', w: 5,  color: '#ffffff' },
  reset: { n: 'Skill Reset Scroll',    price: 500, d: 'Refunds all skill points',     w: 0,  color: '#555566' },
};

const SKILLS = ['s1', 'mend', 'frenzy', 'vit', 'might', 'swift', 'crit', 'critdmg', 'lifesteal', 'guard', 'haste', 'focus', 'fortune'], ACTIVE = { s1: 1, mend: 1, frenzy: 1 }, MAXRANK = 5, PMAX = 99;
const maxRank = k => ACTIVE[k] ? MAXRANK : PMAX;
const newSk = () => ({ s1: 1, mend: 0, frenzy: 0, vit: 0, might: 0, swift: 0, crit: 0, critdmg: 0, lifesteal: 0, guard: 0, haste: 0, focus: 0, fortune: 0 });

function gearSum(player) {
  const g = {}, bonus = {};
  for (const slot of SLOTS) { const item = player.eq[slot]; if (!item) continue; for (const statKey in item.stats) { if (NO_DMG[slot] && (statKey === 'dmg' || statKey === 'crit')) continue; if (REMOVED_STATS.includes(statKey)) continue; g[statKey] = (g[statKey] || 0) + item.stats[statKey] * plusMul(item, statKey); }
    if (item.afx && item.afx.k) g[item.afx.k] = (g[item.afx.k] || 0) + (+item.afx.v || 0);
    if (item.psk) for (const k in item.psk) if (PASSIVES.includes(k)) bonus[k] = (bonus[k] || 0) + (item.psk[k] | 0); }
  player.skb = bonus; return g;
}
// skill rank including passive ranks granted by Mythic gear
// (gear can push a passive up to 5 ranks past the normal maximum)
const rank = (player, k) => Math.min(PMAX + 5, (player.sk[k] || 0) + ((player.skb && player.skb[k]) || 0));
// Passive effects: [gain per rank, cap]. The first 10 ranks give the full gain each. After that the
// gain gets a little smaller with every rank and the effect levels off towards its cap, reaching about
// 95% of it at rank 99. Every rank still helps, and damage reduction or attack speed never reach 100%.
const PASSIVE_EFFECT = { vit: [0.05, 3], might: [0.05, 3], swift: [0.04, 0.8], crit: [0.015, 0.3], critdmg: [0.12, 4], lifesteal: [0.008, 0.15], guard: [0.025, 0.6], haste: [0.035, 0.6], focus: [0.05, 3], fortune: [6, 300] };
const LINEAR_RANKS = 10;
function passiveValue(k, r) {
  // Fortune is simple: 2% gold find at rank 1, +1% per rank, 100% at rank 99 (gear ranks cannot push it higher).
  if (k === 'fortune') return r > 0 ? Math.min(100, r + 1) : 0;
  const [step, cap] = PASSIVE_EFFECT[k]; if (r <= LINEAR_RANKS) return step * r;
  const head = step * LINEAR_RANKS, room = cap - head;
  const curve = Math.min(step / room, 3 / (PMAX - LINEAR_RANKS));
  return head + room * (1 - Math.exp(-(r - LINEAR_RANKS) * curve));
}
const passive = (player, k) => passiveValue(k, rank(player, k));
// Affix totals from gear, with caps.
const gearLifesteal = player => Math.min(15, player.g.ls || 0) / 100;
const gearAttackSpeed = player => Math.min(40, player.g.aspd || 0) / 100;
function stats(player) {
  const characterClass = CLASSES[player.cls]; player.g = gearSum(player);
  player.maxhp = Math.floor((100 + player.lvl * 28) * characterClass.hp * (1 + passive(player, 'vit')) + (player.g.hp || 0));
  player.maxmp = Math.floor(((40 + player.lvl * 8) * characterClass.mp + (player.g.mp || 0)) * (1 + passive(player, 'focus')));
  player.w = player.eq.weapon ? player.eq.weapon.plus : 0;
}
const BASE_PLAYER_MOVE_SPEED = 190;
const MAX_PLAYER_MOVE_SPEED = 400;
function playerMoveSpeed(player, now) {
  const speed = BASE_PLAYER_MOVE_SPEED * (1 + passive(player, 'swift')) * (now < player.buf.spd ? 1.35 : 1) *
    (1 + Math.min(60, player.g.spd || 0) / 100);
  return Math.min(MAX_PLAYER_MOVE_SPEED, Math.max(0, speed));
}
const defRed = player => { const defense = player.g.def || 0; return 1 - (1 - defense / (defense + 100 + 8 * player.lvl)) * (1 - passive(player, 'guard')); };
const critCh = player => Math.min(0.8, 0.12 + (player.g.crit || 0) / 100 + passive(player, 'crit')), critMul = player => 1.8 + passive(player, 'critdmg') + (player.g.cdmg || 0) / 100, goldFind = player => passive(player, 'fortune');
const dmgMul = (player, now) => (1 + passive(player, 'might')) * (now < player.buf.atk ? 1.3 : 1) * (now < player.buf.rage ? 1.2 + 0.05 * player.sk.frenzy : 1);
const playerDmg = player => ((6 + player.lvl * 2.6) * CLASSES[player.cls].atk + (player.g.dmg || 0)) * dmgMul(player, Date.now());

function createProgression({ fire, ev, say, toast, broadcast, sendInv }) {
  const pendingLevels = new Map();
  const processingAwards = new WeakSet();
  function gainXp(player, xp, context = {}) {
    if (!validLevel(player.lvl) || player.lvl >= MAX_PLAYER_LEVEL || processingAwards.has(player)) return 0;
    const combat = context.source === 'combat', limit = combat ? encounterLimit(player.lvl, context) : MAX_SAFE_AMOUNT;
    const boosted = applyXpBonuses(xp, { gearBonus: 0, wisdom: Date.now() < player.buf?.xp, serverRate: combat ? context.serverRate : 1, limit });
    if (!boosted) return 0;
    const award = { v: boosted, source: combat ? 'combat' : 'direct' };
    processingAwards.add(player);
    try { fire('xp', player, award); } finally { processingAwards.delete(player); }
    xp = finalizeXpAward(boosted, award.v, { combat, limit });
    if (!xp) return 0;
    const awarded = credit(player, 'xp', xp, MAX_SAFE_AMOUNT); if (awarded) ev('xp', player.x, player.y, '+' + awarded + ' xp');
    if (awarded) pendingLevels.set(player.id, player);
    return awarded;
  }
  function processLevels(activePlayers) {
    const online = new Set(activePlayers); let budget = LEVEL_UPS_PER_TICK;
    for (const player of activePlayers) if (validLevel(player.lvl) && player.lvl < MAX_PLAYER_LEVEL && validAmount(player.xp) && player.xp >= xpNeed(player.lvl)) pendingLevels.set(player.id, player);
    for (const [id, player] of [...pendingLevels]) {
      pendingLevels.delete(id); if (!online.has(player) || !validAmount(player.xp) || !validLevel(player.lvl) || player.lvl >= MAX_PLAYER_LEVEL) continue;
      let leveledUp = false, count = 0;
      while (budget > 0 && count < 5 && validLevel(player.lvl) && player.lvl < MAX_PLAYER_LEVEL && player.xp >= xpNeed(player.lvl)) {
        budget--; count++;
        player.xp -= xpNeed(player.lvl); player.lvl++; player.sp++; leveledUp = true; stats(player); player.hp = player.maxhp; player.mp = player.maxmp;
        ev('lvl', player.x, player.y, messageText("server.levelBanner", "LEVEL {level}", { level: player.lvl })); ev('fx', player.x, player.y, 110, { s: 'lvl', a: player.id });
        say(player, messageText("server.levelPoint", "Level {level}! You gained a skill point (press K).", { level: player.lvl })); toast(player, messageText("server.level", "Level {level}!", { level: player.lvl }), '#ffe97a');
        broadcast({ t: 'chat', n: '*', m: messageText("server.playerLevel", "{player} reached level {level}!", { player: player.name, level: player.lvl }) }); fire('levelup', player);
      }
      if (leveledUp) sendInv(player);
      if (player.lvl < MAX_PLAYER_LEVEL && player.xp >= xpNeed(player.lvl)) pendingLevels.set(id, player);
      if (budget <= 0) break;
    }
  }

  function learnSkill(player, skillKey) {
    if (!SKILLS.includes(skillKey) || !(player.sp > 0) || !(player.sk[skillKey] < maxRank(skillKey))) return;
    const previousMaxHealth = player.maxhp;
    player.sk[skillKey]++;
    player.sp--;
    stats(player);
    player.hp = Math.min(player.maxhp, player.hp + Math.max(0, player.maxhp - previousMaxHealth));
    sendInv(player);
  }

  return { gainXp, learnSkill, processLevels };
}

module.exports = { BASE_PLAYER_MOVE_SPEED, MAX_PLAYER_MOVE_SPEED, playerMoveSpeed, rank, passive, passiveValue, PASSIVE_EFFECT, gearLifesteal, gearAttackSpeed, CLASSES, ITEMS, SKILLS, MAXRANK, PMAX, maxRank, xpNeed, newSk, stats, defRed, critCh, critMul, goldFind, playerDmg, createProgression };
