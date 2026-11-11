'use strict';
// A server is one persistent universe: a world seed, a progression tier and a permanent
// chronicle of verified events. Everything derived from the seed is deterministic, so the
// same seed + tier + history snapshot + generator version always gives the same region.
const crypto = require('node:crypto');
const { TIERS, MOBTYPES, SPECIAL } = require('./monsters');

const GENERATOR_VERSION = 1;
const STATE_VERSION = 1;
const LEVEL_MILESTONES = [10, 20, 30, 40, 50, 60];
const RENOWN = { worldBoss: 5, bossFirstKill: 3, firstMythic: 3, levelMilestone: 2, stoneFirst: 1, firstHero: 1 };

// ---------- deterministic randomness ----------
function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
function mulberry32(state) {
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// One independent random stream per purpose, e.g. seededRandom(seed, 'spawns') or (seed, 'region', 9).
function seededRandom(seed, ...labels) {
  const random = mulberry32(hashString([seed, ...labels].join('|')));
  random.float = (a, b) => a + random() * (b - a);
  random.int = (a, b) => Math.floor(random.float(a, b + 1));
  random.pick = list => list[Math.floor(random() * list.length)];
  random.weighted = entries => {
    let roll = random() * entries.reduce((sum, entry) => sum + entry[1], 0);
    for (const entry of entries) { roll -= entry[1]; if (roll < 0) return entry[0]; }
    return entries[entries.length - 1][0];
  };
  return random;
}
const SEED_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newSeed() {
  const bytes = crypto.randomBytes(8);
  const text = Array.from(bytes, byte => SEED_ALPHABET[byte % SEED_ALPHABET.length]).join('');
  return text.slice(0, 4) + '-' + text.slice(4);
}

// ---------- names ----------
const UNIVERSE_ADJECTIVES = ['Crimson', 'Forgotten', 'Eternal', 'Sundered', 'Gilded', 'Hollow', 'Silent', 'Burning', 'Verdant', 'Shattered', 'Twilight', 'Iron', 'Ashen', 'Radiant', 'Drowned', 'Wandering'];
const UNIVERSE_NOUNS = ['Dynasty', 'Kingdom', 'Winter', 'Reach', 'Covenant', 'Frontier', 'Dominion', 'Age', 'Throne', 'Expanse', 'Legacy', 'Wilds', 'Empire', 'Dawn', 'Vigil', 'Accord'];
const NAME_START = ['Vor', 'Kael', 'Thar', 'Mor', 'Sel', 'Dra', 'Ith', 'Bal', 'Zan', 'Eld', 'Gor', 'Nyx', 'Ur', 'Hal', 'Fen', 'Quor'];
const NAME_MIDDLE = ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'or', 'ar', 'en'];
const NAME_END = ['gath', 'dor', 'mir', 'th', 'ros', 'vyn', 'kar', 'dun', 'lis', 'mar', 'zul', 'ren'];
const BOSS_TITLES = { fire: ['the Ashen', 'Flamecaller', 'the Cinder King'], frost: ['the Rimebound', 'Winter\'s Maw', 'the Pale'], void: ['the Unseen', 'Voidheart', 'the Hollow'], beast: ['the Ravenous', 'Packlord', 'the Untamed'], war: ['the Conqueror', 'Ironhand', 'the Breaker'], undead: ['the Deathless', 'Gravecaller', 'the Withered'] };
const shuffled = (list, random) => { const copy = list.slice(); for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; };
const properName = random => random.pick(NAME_START) + random.pick(NAME_MIDDLE) + random.pick(NAME_END);
const universeName = seed => { const random = seededRandom(seed, 'name'); return 'The ' + random.pick(UNIVERSE_ADJECTIVES) + ' ' + random.pick(UNIVERSE_NOUNS); };

// ---------- region generation ----------
// Element of every boss. The elements a universe's heroes slay most often shape its later regions.
const BOSS_ELEMENT = { alphawolf: 'beast', kingslime: 'beast', broodmother: 'beast', warlord: 'war', ogrechief: 'war', boneking: 'undead', elderdrake: 'fire', infernal: 'fire', frostwyrm: 'frost', yetiking: 'frost', voidlord: 'void', abyssalwyrm: 'void', deathlord: 'void' };
const BIOMES = [
  { id: 'volcanic', element: 'fire', places: ['Caldera', 'Cinderfields', 'Ashlands'], families: ['hellhound', 'drake', 'golem'] },
  { id: 'glacier', element: 'frost', places: ['Glacier', 'Frostmarch', 'Icefields'], families: ['frostfang', 'yeti', 'icegolem'] },
  { id: 'voidscar', element: 'void', places: ['Rift', 'Voidscar', 'Abyss'], families: ['shade', 'voidweaver', 'voidknight'] },
  { id: 'wildwood', element: 'beast', places: ['Wildwood', 'Thornreach', 'Hunting Grounds'], families: ['wolf', 'boar', 'spider', 'shroom'] },
  { id: 'warfields', element: 'war', places: ['Warfields', 'Bastion', 'Ironmarch'], families: ['orc', 'bandit', 'ogre', 'goblin'] },
  { id: 'necropolis', element: 'undead', places: ['Necropolis', 'Barrows', 'Bonefields'], families: ['skeleton', 'wraith', 'shade'] },
];
// Bounded modifiers: later tiers combine mechanics instead of only inflating numbers.
const REGION_MODIFIERS = ['swift-packs', 'armored-elites', 'twin-stones', 'restless-dead', 'raging-alphas', 'thin-air', 'rich-veins', 'long-nights'];
const FOUNDING_TIERS = TIERS.length;

// Region = Generate(WorldSeed, Tier, HistorySnapshot, GeneratorVersion). Pure: no clock, no Math.random.
// Tiers 1..7 describe the hand-built founding lands; later tiers are generated frontier regions.
function generateRegion(seed, tier, historySnapshot, generatorVersion) {
  generatorVersion = generatorVersion || GENERATOR_VERSION;
  const random = seededRandom(seed, 'region', tier, 'v' + generatorVersion);
  if (tier <= FOUNDING_TIERS) {
    const zone = TIERS[tier - 1];
    const worldBoss = zone.outer ? 'deathlord' : random.pick([...new Set(zone.bosses)].sort());
    return { tier, kind: 'founding', playable: true, name: zone.name, levels: zone.lv.slice(), element: BOSS_ELEMENT[worldBoss] || 'beast', worldBoss: { type: worldBoss, name: MOBTYPES[worldBoss] ? MOBTYPES[worldBoss].name : worldBoss }, generatorVersion };
  }
  const slain = (historySnapshot && historySnapshot.elements) || {};
  const biome = random.weighted(BIOMES.map(candidate => [candidate, 1 + Math.min(6, (slain[candidate.element] || 0) * 0.5)]));
  const depth = tier - FOUNDING_TIERS;
  const archetypes = Object.keys(BOSS_ELEMENT).filter(type => BOSS_ELEMENT[type] === biome.element && MOBTYPES[type]).sort();
  const archetype = random.pick(archetypes.length ? archetypes : ['deathlord']);
  const modifierCount = Math.min(3, 1 + Math.floor(depth / 3));
  const modifiers = []; while (modifiers.length < modifierCount) { const modifier = random.pick(REGION_MODIFIERS); if (!modifiers.includes(modifier)) modifiers.push(modifier); }
  return {
    tier, kind: 'frontier', playable: false, biome: biome.id, element: biome.element,
    name: properName(random) + ' ' + random.pick(biome.places),
    levels: [60 + (depth - 1) * 10, 60 + depth * 10],
    families: shuffled(biome.families, random).slice(0, 3),
    stones: Math.min(40, 24 + depth * 2), modifiers,
    // The World Boss is its own monster type (wb<tier>) built on an existing boss archetype.
    worldBoss: { type: 'wb' + tier, archetype, name: properName(random) + ' ' + random.pick(BOSS_TITLES[biome.element]), signature: SPECIAL[archetype] || 'slam' },
    generatorVersion,
  };
}

// ---------- persistent universe ----------
function createUniverse({ store, config, broadcast, messageText, isAdmin }) {
  const state = store.data;
  let founded = false;
  if (!state.seed) {
    founded = true;
    Object.assign(state, {
      version: STATE_VERSION, generatorVersion: GENERATOR_VERSION,
      seed: String(state.requestedSeed || config.worldSeed || newSeed()).trim().slice(0, 40), foundedAt: Date.now(), worldTier: 1,
      nextEventId: 1, history: [], firsts: {}, regions: {},
      stats: { bossKills: {}, elements: {}, stones: 0, deaths: 0, mythics: 0 },
    });
    delete state.requestedSeed;
    state.name = universeName(state.seed);
  }
  const persist = () => store.save().catch(error => console.error(error));
  const historySnapshot = () => ({ elements: { ...state.stats.elements }, bossKills: { ...state.stats.bossKills }, stones: state.stats.stones, deaths: state.stats.deaths, mythics: state.stats.mythics, events: state.history.length });
  // A region is generated once, when it becomes known, and stored with the snapshot it was generated from.
  function regionFor(tier) {
    if (!state.regions[tier]) { const snapshot = historySnapshot(); state.regions[tier] = { ...generateRegion(state.seed, tier, snapshot, state.generatorVersion), snapshot: tier > FOUNDING_TIERS ? snapshot : undefined }; }
    const region = state.regions[tier];
    if (region.kind === 'frontier' && !region.worldBoss.archetype) { region.worldBoss.archetype = region.worldBoss.type; region.worldBoss.type = 'wb' + tier; }
    return region;
  }
  for (let tier = 1; tier <= Math.max(state.worldTier, FOUNDING_TIERS); tier++) regionFor(tier);

  const HISTORY_TEXT = {
    founded: 'The universe {universe} was founded.',
    firstHero: '{player} was the first hero to walk {universe}.',
    levelMilestone: '{player} was the first to reach level {level}.',
    bossFirstKill: '{player} was the first to slay {boss}.',
    stoneFirst: '{player} shattered the first stone of {region}.',
    firstMythic: '{player} forged the first Mythic item: {item}.',
    worldBoss: '{player} defeated the World Boss {boss}. World Tier {tier} begins: {region} is discovered.',
  };
  // Only verified gameplay facts go in. Text is rendered from the structured record, never stored as fact.
  function record(type, players, data) {
    const entry = { id: state.nextEventId++, at: Date.now(), type, tier: state.worldTier, players: players || [], data: data || {} };
    state.history.push(entry); persist();
    if (type !== 'founded' && broadcast) {
      const vars = { universe: state.name, player: entry.players[0] || '', ...entry.data };
      broadcast({ t: 'chat', n: '*', channel: 'system', m: messageText('history.' + type, '📜 ' + HISTORY_TEXT[type], vars) });
      broadcast({ t: 'toast', m: messageText('history.' + type, '📜 ' + HISTORY_TEXT[type], vars), c: '#ffd24a' });
    }
    return entry;
  }
  function recordOnce(key, type, players, data) {
    if (state.firsts[key]) return null;
    const entry = record(type, players, data); state.firsts[key] = entry.id; return entry;
  }
  if (founded) recordOnce('founded', 'founded', [], {});

  const counts = player => !isAdmin(player) || config.recordAdminHistory === true;
  const fighters = new WeakMap(); // monster -> Map(player name -> last hit time)
  const hooks = {
    join(player) {
      if (counts(player)) recordOnce('firstHero', 'firstHero', [player.name], {});
    },
    levelup(player) {
      if (!counts(player)) return;
      for (const level of LEVEL_MILESTONES) if (player.lvl >= level) recordOnce('level:' + level, 'levelMilestone', [player.name], { level });
    },
    damage(player, monster) {
      const template = MOBTYPES[monster.ty];
      if (!template || !(template.boss || template.stone) || !counts(player)) return;
      let names = fighters.get(monster); if (!names) fighters.set(monster, names = new Map());
      names.set(player.name, Date.now());
    },
    death() { state.stats.deaths++; },
    merge(player, result) {
      if (result.rar < 5) return;
      state.stats.mythics++;
      if (counts(player)) recordOnce('firstMythic', 'firstMythic', [player.name], { item: result.name });
    },
    kill(player, monster) {
      const template = MOBTYPES[monster.ty];
      if (!template || monster.summoned || !(template.boss || template.stone)) return;
      const names = fighters.get(monster) || new Map(); fighters.delete(monster);
      if (!counts(player)) return;
      const recent = Date.now() - 300000;
      const party = [player.name, ...[...names].filter(([name, at]) => name !== player.name && at >= recent).map(([name]) => name)];
      const zone = TIERS[monster.tier] || TIERS[0];
      if (template.stone) { state.stats.stones++; recordOnce('stone:' + monster.tier, 'stoneFirst', party, { region: zone.name }); return; }
      state.stats.bossKills[monster.ty] = (state.stats.bossKills[monster.ty] || 0) + 1;
      const element = BOSS_ELEMENT[monster.ty] || template.element; if (element) state.stats.elements[element] = (state.stats.elements[element] || 0) + 1;
      recordOnce('boss:' + monster.ty, 'bossFirstKill', party, { boss: template.name, bossType: monster.ty, region: zone.name, level: monster.lvl });
      // World progression: only the current tier's World Boss, in its own region, advances the universe.
      // The check and the tier change happen in one synchronous step, so a tier can never unlock twice.
      const frontier = regionFor(state.worldTier);
      if (frontier.playable && frontier.worldBoss.type === monster.ty && monster.tier === state.worldTier - 1) {
        const beaten = state.worldTier; state.worldTier = beaten + 1;
        const next = regionFor(state.worldTier);
        // Tiers beyond the founding lands get their map built before the victory is announced.
        if (universe.onTierUnlocked) try { universe.onTierUnlocked(state.worldTier); } catch (error) { console.error('[universe] could not open World Tier ' + state.worldTier + ':', error); }
        recordOnce('tier:' + beaten, 'worldBoss', party, { boss: template.name, bossType: monster.ty, beatenTier: beaten, tier: state.worldTier, region: next.name });
      }
    },
  };

  function legends() {
    const byName = new Map();
    for (const entry of state.history) for (const [index, name] of entry.players.entries()) {
      const legend = byName.get(name) || { name, renown: 0, deeds: 0 }; byName.set(name, legend);
      legend.deeds++; legend.renown += index === 0 ? (RENOWN[entry.type] || 1) : Math.ceil((RENOWN[entry.type] || 1) / 2);
    }
    return [...byName.values()].sort((a, b) => b.renown - a.renown || a.name.localeCompare(b.name)).slice(0, 20);
  }
  // Short identity sent with the world description (login screen, client world baking).
  const identity = () => ({ name: state.name, seed: state.seed, seedNumber: hashString(state.seed) % 2147483645 + 1, tier: state.worldTier, foundedAt: state.foundedAt });
  function summary() {
    const frontier = regionFor(state.worldTier);
    return {
      ...identity(), generatorVersion: state.generatorVersion, frontier,
      regions: Object.values(state.regions).filter(region => region.tier <= state.worldTier).sort((a, b) => a.tier - b.tier),
      history: state.history.slice(-200), legends: legends(), stats: { ...state.stats, bossKills: undefined, elements: { ...state.stats.elements } },
    };
  }
  const universe = { state, hooks, identity, summary, founded, record, recordOnce, regionFor, onTierUnlocked: null, layoutRandom: label => seededRandom(state.seed, label) };
  return universe;
}

module.exports = { GENERATOR_VERSION, hashString, seededRandom, newSeed, universeName, generateRegion, createUniverse };
