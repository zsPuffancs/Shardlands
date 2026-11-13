'use strict';
// World Boss identities: the eight dedicated World Boss appearances and their three visual variants.
//
// Purely visual. A World Boss still fights as the Region Boss type its tier rolled (stats, attacks, hitbox, size,
// rewards and progression are untouched); this module only decides which of the eight World Boss identities it
// wears, which variant, and its display name. Nothing is persisted: the identity follows from the tier's region
// (founding zone or frontier biome) and the variant from the universe seed and the tier, so every client sees the same
// appearance, it never changes during an encounter, and existing saves and Chronicle entries stay as they are.
const crypto = require('node:crypto');

const IDENTITIES = Object.freeze([
  { id: 'varcolac', name: 'Vârcolac' },
  { id: 'devourer', name: 'The Devourer' },
  { id: 'oni', name: 'Oni Warlord' },
  { id: 'sovereign', name: 'Feathered Sovereign' },
  { id: 'jarl', name: 'Frostbound Jarl' },
  { id: 'mooneater', name: 'Moon-Eater' },
  { id: 'ossuary', name: 'Ossuary King' },
  { id: 'reaper', name: 'The Reaper' },
].map(Object.freeze));
const VARIANTS = 3;
const INDEX = Object.freeze(Object.fromEntries(IDENTITIES.map((identity, index) => [identity.id, index])));
// Founding tiers 1-7: Whispering Meadows, Gloomwood, Ashen Barrens, Ember Wastes, Frostfang Peaks, Voidreach, Death Zone.
const FOUNDING = Object.freeze(['varcolac', 'devourer', 'oni', 'sovereign', 'jarl', 'mooneater', 'reaper']);
const BIOME = Object.freeze({ wildwood: 'devourer', warfields: 'oni', volcanic: 'sovereign', glacier: 'jarl', voidscar: 'mooneater', necropolis: 'ossuary' });

// The identity of a tier's World Boss, from its region descriptor (null when it has none).
function identityFor(region) {
  if (!region || !region.worldBoss) return null;
  const id = region.kind === 'founding' ? FOUNDING[region.tier - 1] : BIOME[region.biome];
  return id ? IDENTITIES[INDEX[id]] : null;
}
// Founding worlds show the concept name; generated regions keep their generated name as a title.
function displayName(region, identity = identityFor(region)) {
  if (!identity) return region && region.worldBoss ? region.worldBoss.name : '';
  return region.kind === 'founding' ? identity.name : identity.name + ' — ' + region.worldBoss.name;
}
// 1-based look code sent to clients (0: not a World Boss): identity * 3 + variant + 1.
const lookCode = (identity, variant) => INDEX[identity.id] * VARIANTS + variant + 1;
const decodeLook = code => code > 0 && code <= IDENTITIES.length * VARIANTS ? { identity: IDENTITIES[Math.floor((code - 1) / VARIANTS)], variant: (code - 1) % VARIANTS } : null;
const seedOffset = (seed, id) => crypto.createHash('sha256').update('world-boss-look:' + String(seed) + ':' + id).digest()[0] % VARIANTS;

// Looks for one universe. Variants rotate: the k-th World Boss of an identity in this universe wears variant
// (seed offset + k) mod 3, so repeated encounters with the same boss change appearance, and the order differs between
// universes. regionFor(tier) must return the committed region descriptor of every tier up to the one asked.
function createWorldBossLooks({ seed, regionFor }) {
  const before = [0], counts = new Map(); // before[t]: earlier World Bosses with tier t's identity; counts: up to tier before.length - 1
  function advanceTo(tier) {
    while (before.length <= tier) {
      const t = before.length, identity = identityFor(regionFor(t)), n = identity ? counts.get(identity.id) || 0 : 0;
      before.push(n);
      if (identity) counts.set(identity.id, n + 1);
    }
  }
  function look(tier) {
    const region = regionFor(tier), identity = identityFor(region);
    if (!identity) return null;
    advanceTo(tier);
    const variant = (seedOffset(seed, identity.id) + before[tier]) % VARIANTS;
    return Object.freeze({ id: identity.id, name: displayName(region, identity), variant, code: lookCode(identity, variant), zone: tier - 1 });
  }
  // Give a World Boss template its look (a field combat never reads). zone: the tier index whose World Boss it is.
  function apply(template, tier) { const value = template && look(tier); if (value) template.worldBossLook = value; return value; }
  return { look, apply };
}
// The look code of one spawned monster: only the World Boss of its own tier wears it.
const monsterLook = (template, tier) => (template && template.worldBossLook && template.worldBossLook.zone === tier ? template.worldBossLook.code : 0);
const monsterDisplayName = (template, monster) => (template && template.worldBossLook && monster && template.worldBossLook.zone === monster.tier ? template.worldBossLook.name : template && template.name);

module.exports = { IDENTITIES, VARIANTS, FOUNDING, BIOME, identityFor, displayName, lookCode, decodeLook, createWorldBossLooks, monsterLook, monsterDisplayName };
