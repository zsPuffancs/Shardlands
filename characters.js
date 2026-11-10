'use strict';

const { localizedText: messageText } = require('./localized-text');

const { SLOTS, NO_DMG, plusMul } = require('./equipment');

const CLASSES = {
  blade:  { name: 'Blade',  desc: 'Melee tank with a sweeping whirlwind.', color: '#b9bccb', fam: 'sword', range: 40,  hp: 1.25, mp: 0.8, atk: 1.0,  s1: 'Whirlwind', s1r: 100, s1m: 1.8, s1c: 15, s1n: 99, s2: 'Second Wind',  s3: 'Battle Rage' },
  archer: { name: 'Archer', desc: 'Ranged hunter, hits several targets.',  color: '#5fae56', fam: 'bow',   range: 260, hp: 1.0,  mp: 1.0, atk: 0.9,  s1: 'Multishot', s1r: 260, s1m: 1.4, s1c: 18, s1n: 3,  s2: 'Herbal Salve', s3: 'Eagle Focus' },
  mage:   { name: 'Mage',   desc: 'Glass cannon with a huge nova.',        color: '#8b63d8', fam: 'staff', range: 210, hp: 0.85, mp: 1.5, atk: 1.05, s1: 'Nova',      s1r: 140, s1m: 2.2, s1c: 25, s1n: 99, s2: 'Healing Light', s3: 'Arcane Surge' },
};
const ITEMS = { // stackable consumables. w = random drop weight (0 = shop only)
  hp:    { n: 'Health Potion',         price: 40,  d: 'Restores 40% HP',              w: 30, color: '#e24a4a' },
  hp2:   { n: 'Greater Health Potion', price: 150, d: 'Restores 100% HP',             w: 6,  color: '#ff2a6a' },
  mp:    { n: 'Mana Potion',           price: 50,  d: 'Restores 50% MP',              w: 24, color: '#4a8fe2' },
  atk:   { n: 'Fury Elixir',           price: 120, d: '+30% damage for 60s',          w: 8,  color: '#ff9a3a' },
  def:   { n: 'Iron Elixir',           price: 120, d: '-35% damage taken for 60s',    w: 8,  color: '#aab4c0' },
  spd:   { n: 'Swift Scroll',          price: 80,  d: '+35% move speed for 60s',      w: 8,  color: '#3ae0c0' },
  xp:    { n: 'Wisdom Scroll',         price: 300, d: '+50% XP for 5 minutes',        w: 4,  color: '#b06aff' },
  ret:   { n: 'Return Scroll',         price: 60,  d: 'Teleports you to the village', w: 5,  color: '#ffffff' },
  reset: { n: 'Skill Reset Scroll',    price: 500, d: 'Refunds all skill points',     w: 0,  color: '#555566' },
};

const SKILLS = ['s1', 'mend', 'frenzy', 'vit', 'might', 'swift', 'crit', 'critdmg', 'lifesteal', 'guard', 'haste', 'focus', 'fortune'], ACTIVE = { s1: 1, mend: 1, frenzy: 1 }, MAXRANK = 5, PMAX = 10;
const maxRank = k => ACTIVE[k] ? MAXRANK : PMAX;
const xpNeed = l => Math.floor(55 * Math.pow(l, 1.85));
const newSk = () => ({ s1: 1, mend: 0, frenzy: 0, vit: 0, might: 0, swift: 0, crit: 0, critdmg: 0, lifesteal: 0, guard: 0, haste: 0, focus: 0, fortune: 0 });

function gearSum(player) { const g = {}; for (const slot of SLOTS) { const item = player.eq[slot]; if (item) for (const statKey in item.stats) { if (NO_DMG[slot] && (statKey === 'dmg' || statKey === 'crit')) continue; g[statKey] = (g[statKey] || 0) + item.stats[statKey] * plusMul(item, statKey); } } return g; }
function stats(player) {
  const characterClass = CLASSES[player.cls]; player.g = gearSum(player);
  player.maxhp = Math.floor((100 + player.lvl * 28) * characterClass.hp * (1 + 0.05 * player.sk.vit) + (player.g.hp || 0));
  player.maxmp = Math.floor(((40 + player.lvl * 8) * characterClass.mp + (player.g.mp || 0)) * (1 + 0.05 * player.sk.focus));
  player.w = player.eq.weapon ? player.eq.weapon.plus : 0;
}
const defRed = player => { const defense = player.g.def || 0; return 1 - (1 - defense / (defense + 100 + 8 * player.lvl)) * (1 - 0.025 * player.sk.guard); };
const critCh = player => Math.min(0.8, 0.12 + (player.g.crit || 0) / 100 + 0.015 * player.sk.crit), critMul = player => 1.8 + 0.12 * player.sk.critdmg, goldFind = player => (player.g.gf || 0) + 6 * player.sk.fortune;
const dmgMul = (player, now) => (1 + 0.05 * player.sk.might) * (now < player.buf.atk ? 1.3 : 1) * (now < player.buf.rage ? 1.2 + 0.05 * player.sk.frenzy : 1);
const playerDmg = player => ((6 + player.lvl * 2.6) * CLASSES[player.cls].atk + (player.g.dmg || 0)) * dmgMul(player, Date.now());

function createProgression({ fire, ev, say, toast, broadcast, sendInv }) {
  function gainXp(player, xp) {
    { const award = { v: xp }; fire('xp', player, award); xp = Math.round(award.v); }
    xp = Math.max(1, Math.round(xp * (1 + (player.g.xpb || 0) / 100)));
    if (Date.now() < player.buf.xp) xp = Math.round(xp * 1.5);
    player.xp += xp; ev('xp', player.x, player.y, '+' + xp + ' xp');
    let leveledUp = false;
    while (player.xp >= xpNeed(player.lvl)) {
      player.xp -= xpNeed(player.lvl); player.lvl++; player.sp++; leveledUp = true; stats(player); player.hp = player.maxhp; player.mp = player.maxmp;
      ev('lvl', player.x, player.y, messageText("server.levelBanner", "LEVEL {level}", { level: player.lvl })); ev('fx', player.x, player.y, 110, { s: 'lvl', a: player.id });
      say(player, messageText("server.levelPoint", "Level {level}! You gained a skill point (press K).", { level: player.lvl })); toast(player, messageText("server.level", "Level {level}!", { level: player.lvl }), '#ffe97a');
      broadcast({ t: 'chat', n: '*', m: messageText("server.playerLevel", "{player} reached level {level}!", { player: player.name, level: player.lvl }) }); fire('levelup', player);
    }
    if (leveledUp) sendInv(player);
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

  return { gainXp, learnSkill };
}

module.exports = { CLASSES, ITEMS, SKILLS, MAXRANK, PMAX, maxRank, xpNeed, newSk, stats, defRed, critCh, critMul, goldFind, playerDmg, createProgression };
