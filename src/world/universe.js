'use strict';
const { worldBossIdentity, worldBossId, canAdvanceWorldTier } = require('../shared/generated/entities');
const { monsterDisplayName } = require('./world-boss-looks');
// A server is one persistent universe: a world seed, a progression tier and a permanent
// chronicle of verified events. Everything derived from the seed is deterministic, so the
// same seed + tier + history snapshot + generator version always gives the same region.
const crypto = require('node:crypto');
const { TIERS, MOBTYPES, SPECIAL } = require('../combat/monsters');
const { LEVEL_RANGE_VERSION, resolveRegionLevels } = require('./region-levels');
const { createDangerSpec } = require('./danger-geography');

const GENERATOR_VERSION = 2;
const STATE_VERSION = 1;
const LEVEL_MILESTONES = [10, 20, 30, 40, 50, 60];
const RENOWN = { campFounded: 4, stallBuilt: 2, stallFunded: 2, worldBoss: 5, bossFirstKill: 3, firstMythic: 3, levelMilestone: 2, stoneFirst: 1, firstHero: 1 };

// ---------- deterministic randomness ----------
const { hashString, seededRandom } = require('../shared/deterministic-random');
const Settlement = require('../../public/settlement');
const { snapshotConstructionCosts } = require('../economy/settlement-economy');
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
function generateRegionLegacy(seed, tier, historySnapshot, generatorVersion) {
  generatorVersion = generatorVersion || 1;
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
    worldBoss: worldBossIdentity(tier, archetype, properName(random) + ' ' + random.pick(BOSS_TITLES[biome.element]), SPECIAL[archetype] || 'slam'),
    generatorVersion,
  };
}

function validateTier(tier) {
  if (!Number.isSafeInteger(tier) || tier < 1) throw new RangeError('World tier must be a positive safe integer.');
}
function generateRegion(seed, tier, historySnapshot, generatorVersion = GENERATOR_VERSION) {
  validateTier(tier);
  if (![1, 2].includes(generatorVersion)) throw new RangeError('Unsupported generator version: ' + generatorVersion);
  if (generatorVersion === 1) return generateRegionLegacy(seed, tier, historySnapshot, 1);
  if (tier <= FOUNDING_TIERS) return generateRegionLegacy(seed, tier, historySnapshot, 2);
  const { stream } = require('./world-generation');
  const biomeRandom = stream(seed, tier, 2, 'biome'), nameRandom = stream(seed, tier, 2, 'names');
  const bossRandom = stream(seed, tier, 2, 'bosses'), affixRandom = stream(seed, tier, 2, 'affixes');
  const slain = historySnapshot?.elements || {};
  const biome = biomeRandom.weighted(BIOMES.map(candidate => [candidate, 1 + Math.min(6, Math.max(0, Number(slain[candidate.element]) || 0) * .5)]));
  const depth = tier - FOUNDING_TIERS, levelDepth = Math.min(994, depth);
  const archetypes = Object.keys(BOSS_ELEMENT).filter(type => BOSS_ELEMENT[type] === biome.element && MOBTYPES[type]).sort();
  const archetype = bossRandom.pick(archetypes.length ? archetypes : ['deathlord']);
  const modifiers = shuffled(REGION_MODIFIERS, affixRandom).slice(0, Math.min(3, 1 + Math.floor(Math.min(depth, 9) / 3)));
  return {
    tier, kind: 'frontier', playable: false, biome: biome.id, element: biome.element,
    name: properName(nameRandom) + ' ' + nameRandom.pick(biome.places),
    levels: [Math.min(10000, 60 + (levelDepth - 1) * 10), Math.min(10000, 60 + levelDepth * 10)],
    families: shuffled(biome.families, stream(seed, tier, 2, 'families')).slice(0, 3), stones: 32, modifiers,
    worldBoss: worldBossIdentity(tier, archetype, properName(bossRandom) + ' ' + bossRandom.pick(BOSS_TITLES[biome.element]), SPECIAL[archetype] || 'slam'),
    difficulty: { worldAffixes: modifiers.slice(), encounterAffixes: [], combatAffixes: [], anomalies: { budget: 1, enabled: false } },
    generatorVersion: 2,
  };
}

// Shared by persistence and read-only previews. Never mutates its input state.
function createRegionDescriptor(state, tier, snapshot) {
  const region = generateRegion(state.seed, tier, snapshot, state.generatorVersion);
  if (tier > FOUNDING_TIERS) {
    region.levels = resolveRegionLevels(state.seed, tier, state.regions);
    region.levelRangeVersion = state.levelRangeVersion || LEVEL_RANGE_VERSION;
    if (state.generatorVersion === 2) {
      region.dangerSpec = createDangerSpec({ seed: state.seed, tier, biome: region.biome, options: state.generationSettings?.danger });
      region.progressionVersion = require('./progression-generation').POLICY_VERSION;
    }
  }
  return { ...region, snapshot: tier > FOUNDING_TIERS ? structuredClone(snapshot) : undefined };
}
// V2 needs only six element counters and scalars; do not copy an ever-growing boss ledger.
const generationSnapshot = state => ({ elements: state.generatorVersion === 1 ? { ...state.stats.elements } : Object.fromEntries(Object.keys(BOSS_TITLES).map(element => [element, state.stats.elements[element] || 0])), ...(state.generatorVersion === 1 ? { bossKills: { ...state.stats.bossKills } } : {}), stones: state.stats.stones, deaths: state.stats.deaths, mythics: state.stats.mythics, events: state.history.length });

// ---------- persistent universe ----------
function createUniverse({ store, config, broadcast, messageText, isAdmin, constructionEconomy, createPlanPreparer }) {
  const state = store.data;
  let founded = false;
  if (!state.seed) {
    founded = true;
    Object.assign(state, {
      version: STATE_VERSION, generatorVersion: config.generatorVersion === 1 ? 1 : GENERATOR_VERSION,
      seed: String(state.requestedSeed || config.worldSeed || newSeed()).trim().slice(0, 40), foundedAt: Date.now(), worldTier: 1,
      nextEventId: 1, history: [], firsts: {}, regions: {},
      stats: { bossKills: {}, elements: {}, stones: 0, deaths: 0, mythics: 0 },
    });
    delete state.requestedSeed;
    state.name = universeName(state.seed);
  }
  if (state.generatorVersion === undefined) state.generatorVersion = 1;
  if (![1, 2].includes(state.generatorVersion)) throw new RangeError('Unsupported saved generator version: ' + state.generatorVersion);
  validateTier(state.worldTier);
  if (state.generatorVersion === 1 && state.worldTier > 65542) throw new RangeError('Saved v1 tier exceeds the coordinate-based runtime capacity; save preserved.');
  if (state.generatorVersion === 2 && !state.generationSettings) {
    const options = config.worldGeneration || {};
    const numeric = values => Object.fromEntries(Object.entries(values || {}).filter(([, value]) => Number.isFinite(value)));
    state.generationSettings = { budgets: numeric(options.budgets), spacing: numeric(options.spacing), danger: numeric(options.danger) };
  }
  if (state.generatorVersion === 2 && state.generationSettings.danger === undefined) {
    state.generationSettings.danger = Object.fromEntries(Object.entries(config.worldGeneration?.danger || {}).filter(([key, value]) => ['baseline', 'noise'].includes(key) && Number.isFinite(value)));
  }
  // Apply the new level-range policy only to descriptors created after this update.
  if (state.levelRangeVersion === undefined) state.levelRangeVersion = LEVEL_RANGE_VERSION;
  if (state.levelRangeVersion !== LEVEL_RANGE_VERSION) throw new RangeError('Unsupported level-range version: ' + state.levelRangeVersion);
  const persist = () => store.save().catch(error => console.error(error));
  // Existing projects predate tier pricing: pin their original prices without touching donations.
  let settlementCostsMigrated = false;
  for (const savedSettlement of Object.values(state.settlements || {})) {
    if (snapshotConstructionCosts(savedSettlement, undefined, { legacy: true })) settlementCostsMigrated = true;
  }
  if (settlementCostsMigrated) persist();
  const historySnapshot = () => generationSnapshot(state);
  // A region is generated once, when it becomes known, and stored with the snapshot it was generated from.
  function regionFor(tier) {
    if (!state.regions[tier]) {
      state.regions[tier] = createRegionDescriptor(state, tier, historySnapshot());
    }
    const region = state.regions[tier];
    if (region.kind === 'frontier' && !region.worldBoss.archetype) { region.worldBoss.archetype = region.worldBoss.type; region.worldBoss.type = worldBossId(tier); }
    return region;
  }
  for (let tier = 1; tier <= (state.generatorVersion === 1 ? Math.max(state.worldTier, FOUNDING_TIERS) : FOUNDING_TIERS); tier++) regionFor(tier);
  if (state.generatorVersion === 2) regionFor(state.worldTier);

  const HISTORY_TEXT = {
    founded: 'The universe {universe} was founded.',
    firstHero: '{player} was the first hero to walk {universe}.',
    levelMilestone: '{player} was the first to reach level {level}.',
    bossFirstKill: '{player} was the first to slay {boss}.',
    stoneFirst: '{player} shattered the first pillar of {region}.',
    firstMythic: '{player} forged the first Mythic item: {item}.',
    worldBoss: '{player} defeated the World Boss {boss}. World Tier {tier} begins: {region} is discovered.',
    campFounded: '{player} founded the encampment of {region}.',
    stallBuilt: '{player} built the {stall} in {region} for {gold} gold.',
    stallFunded: '{player} led the building of the {stall} in {region}: {count} heroes gave {gold} gold.',
  };
  // Only verified gameplay facts go in. Text is rendered from the structured record, never stored as fact.
  // The settlement of each map. Map 0 (the founding lands) always has the village; generated regions get theirs
  // from the seed with a stream of their own, so region descriptors stay as they were.
  function settlement(tier) {
    if (!state.settlements) state.settlements = {};
    const key = tier > FOUNDING_TIERS ? String(tier) : 'founding';
    if (!state.settlements[key]) {
      if (tier <= FOUNDING_TIERS) state.settlements[key] = { kind: 'village', style: 'timber', built: {} };
      else {
        const region = regionFor(tier), record = { ...Settlement.choose(region.biome, tier, seededRandom(state.seed, 'settlement', tier)), built: {} };
        // A new village rolls once whether it starts without vendors (their stalls are bought at the village board).
        if (record.kind === 'village') record.stalls = seededRandom(state.seed, 'settlement-vendors', tier)() < Settlement.UNSTAFFED_VILLAGE_CHANCE;
        state.settlements[key] = record;
      }
      snapshotConstructionCosts(state.settlements[key], tier, { legacy: tier <= FOUNDING_TIERS, ...(constructionEconomy ? { config: constructionEconomy } : {}) });
      persist();
    }
    // Villages keep the layout they were given (older saves get one now, from a stream of their own).
    const record = state.settlements[key];
    if (snapshotConstructionCosts(record, tier, { legacy: true })) persist();
    // Villages saved before the vendor roll existed keep their vendors, and so does the founding village.
    if (record.kind === 'village' && record.stalls === undefined) { record.stalls = false; persist(); }
    if (record.kind === 'village' && !Settlement.LAYOUT_IDS.includes(record.layout)) {
      record.layout = tier <= FOUNDING_TIERS ? 'grand' : Settlement.chooseLayout(record.style, seededRandom(state.seed, 'settlement-layout', tier));
      persist();
    }
    return record;
  }
  function notifyEntry(entry) {
    if (entry.type !== 'founded' && broadcast) {
      const vars = { universe: state.name, player: entry.players[0] || '', ...entry.data };
      broadcast({ t: 'chat', n: '*', channel: 'system', m: messageText('history.' + entry.type, '📜 ' + HISTORY_TEXT[entry.type], vars) });
      broadcast({ t: 'toast', m: messageText('history.' + entry.type, '📜 ' + HISTORY_TEXT[entry.type], vars), c: '#ffd24a' });
      broadcast({ t: 'universe', u: summary() });
    }
  }
  function record(type, players, data, { deferred = false } = {}) {
    const entry = { id: state.nextEventId++, at: Date.now(), type, tier: state.worldTier, players: players || [], data: data || {} };
    state.history.push(entry); if (!deferred) { persist(); notifyEntry(entry); }
    return entry;
  }
  function recordOnce(key, type, players, data, options) {
    if (state.firsts[key]) return null;
    const entry = record(type, players, data, options); state.firsts[key] = entry.id; return entry;
  }
  if (founded) recordOnce('founded', 'founded', [], {});

  const transitions = require('./tier-transition').createTierTransitions({ state, save: () => store.save(),
    maxAttempts: config.worldGeneration?.unlockAttempts, createPreparer: createPlanPreparer,
    makeRegion(pending) {
      const region = state.regions[pending.nextTier] || createRegionDescriptor({ ...state, generationSettings: pending.generationSettings }, pending.nextTier, pending.snapshot);
      const { spawnState, ...descriptor } = region; return structuredClone(descriptor);
    },
    makeInputs: pending => structuredClone(require('./region-blueprint').regionPlanInputs({ ...state, generationSettings: pending.generationSettings }, pending.region)),
    recordVictory(pending) {
      return recordOnce('tier:' + pending.beatenTier, 'worldBoss', pending.players, { boss: pending.boss, bossType: pending.bossType,
        beatenTier: pending.beatenTier, tier: pending.nextTier, region: state.regions[pending.nextTier].name }, { deferred: true })
        || state.history.find(entry => entry.id === state.firsts['tier:' + pending.beatenTier]);
    },
    activate: tier => universe.onTierUnlocked?.(tier),
    notify: id => { const entry = state.history.find(entry => entry.id === id); if (entry) notifyEntry(entry); },
  });

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
      const bossName = monsterDisplayName(template, monster); // a World Boss shows its World Boss name (visual)
      recordOnce('boss:' + monster.ty, 'bossFirstKill', party, { boss: bossName, bossType: monster.ty, region: zone.name, level: monster.lvl });
      // World progression: only the current tier's World Boss, in its own region, advances the universe.
      // The check and the tier change happen in one synchronous step, so a tier can never unlock twice.
      const currentTier = transitions.visibleTier(), frontier = regionFor(currentTier);
      if (canAdvanceWorldTier(currentTier, frontier, monster)) {
        if (state.generatorVersion === 2) {
          transitions.stage({ players: party, boss: bossName, bossType: monster.ty, snapshot: historySnapshot() });
          return;
        }
        const beaten = state.worldTier; state.worldTier = beaten + 1;
        const next = regionFor(state.worldTier);
        // Tiers beyond the founding lands get their map built before the victory is announced.
        if (universe.onTierUnlocked) try { universe.onTierUnlocked(state.worldTier); } catch (error) { console.error('[universe] could not open World Tier ' + state.worldTier + ':', error); }
        recordOnce('tier:' + beaten, 'worldBoss', party, { boss: bossName, bossType: monster.ty, beatenTier: beaten, tier: state.worldTier, region: next.name });
      }
    },
  };

  // Game Master progression: advance exactly one World Tier through the same path a World Boss victory takes
  // (staged transition, region generation and validation, recorded victory, activation), without the kill and
  // without kill rewards. Resolves when the new tier is visible, or with the reason it is not.
  function gmAdvanceTier(gmName) {
    const currentTier = transitions.visibleTier(), frontier = regionFor(currentTier);
    if (!frontier || !frontier.playable || !frontier.worldBoss || currentTier >= Number.MAX_SAFE_INTEGER) return Promise.resolve({ ok: false, status: 'no-frontier' });
    const party = [String(gmName)], boss = frontier.worldBoss.name || frontier.worldBoss.type, bossType = frontier.worldBoss.type;
    if (state.generatorVersion === 2) {
      if (!transitions.stage({ players: party, boss, bossType, snapshot: historySnapshot() })) return Promise.resolve({ ok: false, status: 'busy', ...transitions.status() });
      return transitions.resume();
    }
    const beaten = state.worldTier; state.worldTier = beaten + 1;
    const next = regionFor(state.worldTier);
    if (universe.onTierUnlocked) try { universe.onTierUnlocked(state.worldTier); } catch (error) { console.error('[universe] could not open World Tier ' + state.worldTier + ':', error); }
    recordOnce('tier:' + beaten, 'worldBoss', party, { boss, bossType, beatenTier: beaten, tier: state.worldTier, region: next.name });
    return Promise.resolve({ ok: true, status: 'unlocked', tier: state.worldTier });
  }

  function legends() {
    const byName = new Map();
    for (const entry of state.history) for (const [index, name] of entry.players.entries()) {
      if (entry.id === transitions.pendingEntryId()) continue;
      const legend = byName.get(name) || { name, renown: 0, deeds: 0 }; byName.set(name, legend);
      legend.deeds++; legend.renown += index === 0 ? (RENOWN[entry.type] || 1) : Math.ceil((RENOWN[entry.type] || 1) / 2);
    }
    return [...byName.values()].sort((a, b) => b.renown - a.renown || a.name.localeCompare(b.name)).slice(0, 20);
  }
  // Short identity sent with the world description (login screen, client world baking).
  const identity = () => ({ name: state.name, seedNumber: hashString(state.seed) % 2147483645 + 1, tier: transitions.visibleTier(), foundedAt: state.foundedAt });
  function summary() {
    const view = region => { const { spawnPlan, spawnState, dangerSpec, snapshot, ...metadata } = region; return metadata; };
    const visibleTier = transitions.visibleTier(), frontier = view(regionFor(visibleTier));
    return {
      ...identity(), generatorVersion: state.generatorVersion, frontier,
      regions: Object.values(state.regions).filter(region => region.tier <= visibleTier).sort((a, b) => a.tier - b.tier).map(view),
      history: state.history.filter(entry => entry.id !== transitions.pendingEntryId()).slice(-200), legends: legends(), stats: { ...state.stats, bossKills: undefined, elements: { ...state.stats.elements } },
    };
  }
  const universe = { state, hooks, identity, summary, founded, record, recordOnce, regionFor, settlement, save: persist, onTierUnlocked: null,
    get unlockedTier() { return transitions.visibleTier(); }, resumePendingUnlock: transitions.resume,
    retryPendingUnlock: () => transitions.resume({ retry: true }), gmAdvanceTier, unlockStatus: transitions.status, suspendUnlocks: transitions.suspend,
    layoutRandom: label => seededRandom(state.seed, label) };
  return universe;
}

module.exports = { GENERATOR_VERSION, hashString, seededRandom, newSeed, universeName, generateRegion, createRegionDescriptor, generationSnapshot, createUniverse };
