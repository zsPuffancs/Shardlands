# World Bosses: identities and visual variants

There are two boss categories:

- **Region Bosses**: the 13 boss types (Alpha Wolf, King Slime, Spider Broodmother, Orc Warlord, Ogre Chieftain, The
  Bone King, Elder Drake, Infernal Colossus, Frost Wyrm, Yeti King, Void Lord, Abyssal Wyrm, Lord of Death) with their
  own models, names and fights.
- **World Bosses**: the boss of each World Tier whose defeat advances the universe. It wears one of eight dedicated
  World Boss identities, each with three visual variants.

The split is **visual only**. A World Boss still fights as the Region Boss type its tier rolled (founding zones: one of
the zone's two boss types, the Death Zone always Lord of Death; generated regions: a type of the biome's element):
stats, attacks, telegraphs, hitbox, size, AI, rewards, spawns and progression are unchanged. The known double-size
hitbox of generated World Bosses built on a founding archetype is left as it is.

| World Boss | Appears in | Variant A | Variant B | Variant C |
|---|---|---|---|---|
| Vârcolac | Whispering Meadows | ancient: dark fur, silver markings, golden eclipse | pale: moon-marked, glowing crescents, full moon, spectral wisps | feral: black bristling mane, scars, torn ear, blood-red eclipse |
| The Devourer | Gloomwood, wildwood regions | ancient: crocodile head, lion mane, hippo hindquarters, gold-and-lapis collar | overgrown: moss, roots binding the legs, saplings and flowers on the back | corrupted: black, bone spikes, exposed ribs, green glow |
| Oni Warlord | Ashen Barrens, warfields regions | traditional: red skin, lacquered armour, white mane, kanabo | commander: blue skin, heavier armour, crested kabuto, great horns, war banner | feral: bared to the waist, burning scars, broken horn and a third horn |
| Feathered Sovereign | Ember Wastes, volcanic regions | fiery: crimson scales, turquoise and gold plumes | ash: grey-black scales, charcoal plumes, smoke | molten: obsidian scales with glowing seams, molten plumes |
| Frostbound Jarl | Frostfang Peaks, glacier regions | frozen warlord: horned helm, frost beard, fur mantle, ice-edged axe | ancient: heavier plate, closed helm with antler horns, glowing runes, rimed cloak | battle-scarred: broken horn, ice spikes on shoulders and back, axe locked in ice |
| Moon-Eater | Voidreach, voidscar regions | cosmic: indigo, star-speckled, pale moon in its jaws | corrupted: black with void cracks, tendrils, eclipsed moon | star-marked: midnight blue, constellations, golden fins, orbiting stars |
| Ossuary King | necropolis regions | ancient royal: gold-trimmed plate, gold crown, purple cape | heavy: ribcage breastplate, bone spikes, skull trophies, crown of bones | decayed: plates gone to bare ribs and spine, tattered cape, broken crown |
| The Reaper | Death Zone | spectral: black robe, green lights and wisps | skeletal: skull in the hood, ribs through the robe, rusted scythe | supernatural: pale-blue glow, dissolving robe, halo of soul orbs with faces |

The Region Boss "The Bone King" keeps its name, model and identity; the necropolis World Boss is the Ossuary King.

## Names

Founding worlds show the concept name ("Vârcolac"); generated regions keep their generated name as a title
("Moon-Eater — Morvath the Hollow"). The name is worked out at run time: region descriptors in `universe.json` keep the
names they were generated with, and earlier Chronicle entries are not rewritten (new ones use the shown name).

## How a variant is chosen

`src/world/world-boss-looks.js`, on the server, nothing persisted:

- identity: founding tier 1-7 → Vârcolac, Devourer, Oni, Sovereign, Jarl, Moon-Eater, Reaper; generated regions by
  biome (wildwood, warfields, volcanic, glacier, voidscar, necropolis).
- variant: the k-th World Boss of an identity in a universe wears variant (seed offset + k) mod 3, the offset hashed
  from the universe seed and the identity. Repeated encounters with the same boss look different, the order differs
  between universes, and the answer does not depend on the order in which tiers are opened.
- the look is set on the World Boss template (`worldBossLook`, a field combat never reads); a spawned monster carries a
  look code (identity * 3 + variant + 1) only when it is the World Boss of its own tier, so a Void Lord spawning as a
  Region Boss in the Death Zone keeps its Region Boss look.
- the code is the last field of the monster snapshot row (`mob.look`) and the World Boss name is `wn` in the type row;
  the client (`public/world-boss-models.js`) draws the model for that code and `shownMobName` shows the name. Every
  client sees the same appearance, and it cannot change during an encounter.

## Models

`public/world-boss-models.js`: eight builders from the engine's primitives, each taking the variant; sized to the
World Boss hitbox of the rolled type (`t.r`), capped at 240 units tall. Effects are small and opaque (a few spectral
parts are translucent) and sit above the ground, so attack telegraphs on the ground stay readable.

## Premium sculpted models

The Vârcolac is rebuilt as a sculpted, rigged and animated model (the other seven still use the primitive builders):
`public/assets/bosses/varcolac-{a,b,c}.glb` (full detail, ~200k triangles, 29 bones, clips Idle, Walk, Run, Attack,
Attack2, RecieveHit, Death) and `varcolac-{a,b,c}-far.glb` (~35k triangles, used beyond 640 units and for its shadow).

- Generated, never hand-edited: `node scripts/boss-forge/build.js varcolac` (deterministic, no dependencies). The
  forge sculpts with blended signed-distance shapes (anatomy, ~3,500 fur locks, teeth, claws, the eclipse), meshes
  them, bakes colour, ambient occlusion, gloss, glow and a surface type into every vertex, skins them to the rig and
  writes quantized glTF (KHR_mesh_quantization, 16-bit indices, at most 65,535 vertices per primitive).
- Drawn by the engine's hero shader (`GL.drawHero`): the skinned character path plus per-vertex material, a
  procedural detail bump (fur, skin, horn, stone) in bind-pose space, fur wrap lighting, rim and pulsing glow, and its
  own shadow program. The existing character and world shaders are unchanged.
- Loaded per variant the first time it is seen. Until then, or without the hero shader, the primitive model is drawn.
  Same units, size, position and facing as the primitive model; gameplay is untouched.

## Tests

`tests/world-boss-looks.test.js`: identity mapping and names, deterministic and rotating variants (also when tiers are
opened out of order), the look only on the tier's own World Boss with every gameplay field of the spawned monster
unchanged, the network fields, all 24 appearances drawing finite geometry in every pose within the size cap, three
distinct silhouettes and materials per boss, and the Region Boss models untouched. `tests/enemy-models.test.js`
checks the Region Boss model sources byte for byte. `tests/world-boss-premium.test.js` checks the sculpted model files
(engine limits, ground contact, facing, clips, distinct variants), the primitive fallback and the unchanged shaders.
