'use strict';

const { rnd, rint, pick } = require('../world/game-world');
const { rollValue } = require('../../public/affix-math');
const { UP_RATE, upCostFor } = require('../../public/forge-math');

const SLOTS = ['weapon', 'helm', 'armor', 'boots', 'ring', 'amulet'], NO_DMG = { helm: 1, armor: 1, boots: 1 };
const RARITY = [{ n: 'Common', m: 1, x: 0, w: 60 }, { n: 'Uncommon', m: 1.25, x: 1, w: 25 }, { n: 'Rare', m: 1.55, x: 2, w: 11 }, { n: 'Epic', m: 1.9, x: 3, w: 3.5 }, { n: 'Legendary', m: 2.4, x: 4, w: 0.6 }, { n: 'Mythic', m: 3.1, x: 5, w: 0 }];
// Mythic items also raise passive skills (ranks on top of what you learned)
const MYTHIC = 5, PASSIVES = ['vit', 'might', 'swift', 'crit', 'critdmg', 'lifesteal', 'guard', 'haste', 'focus', 'fortune'];
// how many items of a rarity it takes to merge into the next one (common -> uncommon ... legendary -> mythic)
const MERGE_COST = [2, 3, 4, 5, 15];
// souls the Soul Mystic asks to reroll an item, by rarity
const REROLL_COST = [1, 1, 2, 3, 5, 10];
const MATS = ['Rusty', 'Iron', 'Steel', 'Runed', 'Dragonbone', 'Voidforged', 'Starmetal', 'Celestial', 'Doomforged'];
const BASES = { weapon: { sword: 'Sword', bow: 'Bow', staff: 'Staff' }, helm: ['Helm', 'Cap', 'Hood'], armor: ['Mail', 'Robe', 'Vest'], boots: ['Boots', 'Greaves', 'Sandals'], ring: ['Ring', 'Band', 'Signet'], amulet: ['Amulet', 'Pendant', 'Charm'] };
const SUFFIX = ['of the Wolf', 'of Embers', 'of the Bear', 'of Storms', 'of the Fox', 'of Ruin', 'of Kings', 'of the Void', 'of Dawn', 'of Frost', 'of the Abyss'];
const STATDEF = {
  dmg: { n: 'Damage', f: i => 1.1 * i + 1 }, hp: { n: 'Max HP', f: i => 7 * i + 8 }, mp: { n: 'Max MP', f: i => 3 * i + 3 }, def: { n: 'Defense', f: i => 0.9 * i + 1 },
  crit: { n: 'Crit Chance %', f: i => 1.5 + i * 0.07, pct: 1 }, spd: { n: 'Move Speed %', f: i => 1.5 + i * 0.05, pct: 1 },
};
// Gear no longer gives XP or gold bonuses. Old items lose these stats when their owner logs in.
const REMOVED_STATS = ['gf', 'xpb'];
const PRIMARY = { weapon: { dmg: i => 3 * i + 5 }, helm: { def: i => 1.3 * i + 2 }, armor: { hp: i => 12 * i + 20, def: i => 1.6 * i }, boots: { spd: i => 1.5 + i * 0.08, def: i => 0.8 * i }, ring: { dmg: i => 0.9 * i + 1, crit: i => 1 + i * 0.05 }, amulet: { hp: i => 6 * i + 10, mp: i => 2 * i + 4 } };
// Affixes: one bonus stat per weapon, ring or amulet, put on by the Soul Mystic. The affix also names the item.
const AFFIX_SLOTS = { weapon: 1, ring: 1, amulet: 1 };
const AFFIXES = {
  ls:   { n: 'Lifesteal %',     prefix: 'Vampiric', f: i => 0.5 + i * 0.03 },
  cdmg: { n: 'Crit Damage %',   prefix: 'Brutal',   f: i => 5 + i * 0.5 },
  aspd: { n: 'Attack Speed %',  prefix: 'Swift',    f: i => 2 + i * 0.08 },
};
// souls the Soul Mystic asks to put an affix on an item, by rarity
const AFFIX_COST = [2, 2, 3, 5, 8, 15];
// three unwanted Mythics become one random Mythic at the Blacksmith
const MYTHIC_MERGE_COUNT = 3, MYTHIC_MERGE_GOLD = 1000000;
// Soft cap: up to ITEM_STAT_SOFT_CAP_START an item's stats grow linearly with its level, as before. Above it, every
// stat formula is fed an effective level that keeps growing, but logarithmically (diminishing returns, no hard cap).
// Only stat values use it; ilvl itself, level requirements, names, prices and upgrade (+) bonuses stay on the real level.
const ITEM_STAT_SOFT_CAP_START = 500;
const ITEM_STAT_SOFT_CAP_SCALE = 500;
function effectiveStatLevel(itemLevel) {
  const level = Math.max(1, Number(itemLevel) || 1);
  if (level <= ITEM_STAT_SOFT_CAP_START) return level;
  return ITEM_STAT_SOFT_CAP_START + ITEM_STAT_SOFT_CAP_SCALE * Math.log1p((level - ITEM_STAT_SOFT_CAP_START) / ITEM_STAT_SOFT_CAP_SCALE);
}
const PRIMARY_SPREAD = [0.9, 1.1], EXTRA_SPREAD = [0.85, 1.15], AFFIX_SPREAD = [0.85, 1.15];
const extraFactor = rarity => 0.6 + 0.4 * RARITY[rarity].m;
// The same continuous range drives real rolls, tooltips and Auto Affix probability estimates.
function affixRange(item, key) {
  if (!item || !Object.hasOwn(AFFIXES, key) || !Object.hasOwn(AFFIX_SLOTS, item.slot) || !Number.isSafeInteger(item.ilvl) || item.ilvl < 1 || !Number.isInteger(item.rar) || !RARITY[item.rar]) return null;
  const base = AFFIXES[key].f(effectiveStatLevel(item.ilvl)) * extraFactor(item.rar), low = base * AFFIX_SPREAD[0], high = base * AFFIX_SPREAD[1];
  return [base, low, high].every(Number.isFinite) && low >= 0 && high * 10 < Number.MAX_SAFE_INTEGER ? { base, low, high, spread: AFFIX_SPREAD.slice() } : null;
}
// Lowest and highest value each stat of this item could have rolled (before + upgrades).
function statRanges(item) {
  const ranges = {}, rarity = RARITY[item.rar] ? item.rar : 0, statLevel = effectiveStatLevel(item.ilvl);
  for (const key in item.stats) {
    const primary = PRIMARY[item.slot] && PRIMARY[item.slot][key];
    const base = primary ? primary(statLevel) * RARITY[rarity].m : STATDEF[key] ? STATDEF[key].f(statLevel) * extraFactor(rarity) : null;
    if (base === null) continue;
    const spread = primary ? PRIMARY_SPREAD : EXTRA_SPREAD;
    ranges[key] = [base * spread[0], base * spread[1]];
  }
  if (item.afx && AFFIXES[item.afx.k]) { const base = AFFIXES[item.afx.k].f(statLevel) * extraFactor(rarity); ranges['afx:' + item.afx.k] = [base * AFFIX_SPREAD[0], base * AFFIX_SPREAD[1]]; }
  return ranges;
}
// What clients get for an item: the item plus its stat ranges (ranges are never stored).
const itemView = item => item ? { ...item, rg: statRanges(item) } : item;

function sanitize(item) { if (item && item.stats) for (const key of REMOVED_STATS) delete item.stats[key]; if (item && NO_DMG[item.slot]) { delete item.stats.dmg; delete item.stats.crit; } if (item && !item.plus) item.plus = 0; return item; }
const plusMul = (item, statKey) => 1 + (item.plus || 0) * (item.slot === 'weapon' && statKey === 'dmg' ? 0.15 : 0.1);
const sellValue = item => Math.round((3 * item.ilvl + 5) * (1 + RARITY[item.rar].x * RARITY[item.rar].x * 0.6) * (1 + (item.plus || 0) * 0.5));

function createEquipment({ rates }) {
  let nextItemNumber = 0; const newUid = () => Date.now().toString(36) + '-' + (nextItemNumber++).toString(36);
  function rollRarity(bonus, minimumRarity) {
    const rarityBonus = (bonus || 0) + rates.rarityBoost, weights = RARITY.map((roll, i) => roll.w * (1 + rarityBonus * i * 1.5)); let roll = Math.random() * weights.reduce((a, c) => a + c, 0), selectedRarity = 0;
    for (let i = 0; i < weights.length; i++) { roll -= weights[i]; if (roll <= 0) { selectedRarity = i; break; } }
    return Math.max(selectedRarity, minimumRarity || 0);
  }
  // 2-3 different passive skills, +1 to +3 ranks each
  function rollPassives() { const pool = PASSIVES.slice(), out = {}; for (let i = rint(2, 3); i > 0; i--) out[pool.splice(rint(0, pool.length - 1), 1)[0]] = rint(1, 3); return out; }
  // new random stats (and passive bonuses) for an existing item; keeps its name, level, rarity and upgrades
  function rerollGear(item) { const fresh = genGear(item.slot, item.ilvl, item.rar, item.fam); item.stats = fresh.stats; if (fresh.psk) item.psk = fresh.psk; else delete item.psk; return item; }
  // Put a new affix on an item (replacing the old one, and its name prefix).
  function applyAffix(item, key) {
    const range = affixRange(item, key), affix = AFFIXES[key]; if (!range) return false;
    if (item.afx && AFFIXES[item.afx.k] && item.name.startsWith(AFFIXES[item.afx.k].prefix + ' ')) item.name = item.name.slice(AFFIXES[item.afx.k].prefix.length + 1);
    item.afx = { k: key, v: rollValue(range.base, range.spread, Math.random()) };
    item.name = affix.prefix + ' ' + item.name;
    return true;
  }
  const roundStat = (statKey, value) => (STATDEF[statKey] && STATDEF[statKey].pct) ? Math.round(value * 10) / 10 : Math.round(value);
  function genGear(slot, itemLevel, rarity, weaponFamily) {
    slot = SLOTS.includes(slot) ? slot : pick(SLOTS); itemLevel = Math.max(1, itemLevel | 0); rarity = rarity === undefined || rarity === null ? rollRarity(0) : Math.max(0, Math.min(MYTHIC, rarity | 0));
    const rarityDefinition = RARITY[rarity], stats = {}, statLevel = effectiveStatLevel(itemLevel);
    for (const statKey in PRIMARY[slot]) stats[statKey] = roundStat(statKey, PRIMARY[slot][statKey](statLevel) * rarityDefinition.m * rnd(PRIMARY_SPREAD[0], PRIMARY_SPREAD[1]));
    const pool = Object.keys(STATDEF).filter(statKey => !(statKey in stats) && !(NO_DMG[slot] && (statKey === 'dmg' || statKey === 'crit')));
    for (let i = 0; i < rarityDefinition.x && pool.length; i++) { const statKey = pool.splice(rint(0, pool.length - 1), 1)[0]; stats[statKey] = roundStat(statKey, STATDEF[statKey].f(statLevel) * extraFactor(rarity) * rnd(EXTRA_SPREAD[0], EXTRA_SPREAD[1])); }
    let base; if (slot === 'weapon') { weaponFamily = BASES.weapon[weaponFamily] ? weaponFamily : pick(Object.keys(BASES.weapon)); base = BASES.weapon[weaponFamily]; } else { base = pick(BASES[slot]); weaponFamily = undefined; }
    const name = MATS[Math.min(MATS.length - 1, Math.floor((itemLevel - 1) / 7))] + ' ' + base + (rarity >= 2 ? ' ' + pick(SUFFIX) : '');
    const item = { uid: newUid(), slot, fam: weaponFamily, name, rar: rarity, ilvl: itemLevel, req: Math.max(1, itemLevel - 3), stats, plus: 0 };
    if (rarity >= MYTHIC) item.psk = rollPassives();
    return item;
  }

  return { rollRarity, genGear, rerollGear, applyAffix };
}

module.exports = { PRIMARY, ITEM_STAT_SOFT_CAP_START, ITEM_STAT_SOFT_CAP_SCALE, effectiveStatLevel, affixRange, REMOVED_STATS, SLOTS, NO_DMG, RARITY, MYTHIC, PASSIVES, MERGE_COST, REROLL_COST, AFFIXES, AFFIX_SLOTS, AFFIX_COST, MYTHIC_MERGE_COUNT, MYTHIC_MERGE_GOLD, statRanges, itemView, BASES, STATDEF, UP_RATE, sanitize, plusMul, sellValue, upCostFor, createEquipment };
