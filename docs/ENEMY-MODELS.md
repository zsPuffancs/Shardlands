# Enemy models

The first three founding zones (Whispering Meadows, Gloomwood, Ashen Barrens) are the Day 1 enemies. Their regular
enemies were redesigned in `public/enemy-models.js`: low-poly creatures and characters built from the engine's
primitive meshes and animated in code, like every procedural model in `public/game.js` (walk phase, movement, attack,
hit flash, Alpha scale). The file loads after `game.js` (`public/index.html`) and replaces the `fn` of the Day 1
entries of `MODEL` only; their size (`sc`), nameplate height (`top`) and colours stay, so gameplay readability,
hit circles and nameplates are as before.

| Enemy | Zone | Before | Now |
|---|---|---|---|
| Wild Wolf (`wolf`) | Meadows | generic quadruped (`beast`) | lean canine: deep chest, jointed legs with hocks, long muzzle with a snapping jaw, tall ears, ruff, bushy tail, pale throat and muzzle |
| Frost Wolf (`frostwolf`, plugin) | Meadows | wolf body, frost colours | the new wolf in frost colours (`public/plugins/frost_wolf.js`) |
| Tusk Boar (`boar`) | Meadows | generic quadruped | shoulder hump, bristly mane ridge, cloven hooves, flat snout, upturned tusks, tufted ears, curly tail; gores upward |
| Green Slime (`slime`) | Meadows | ball with dots | droplet with a peak, core and rising bubbles, highlight, big eyes, a mouth that gapes on attack |
| Shroomling (`shroom`) | Meadows | cap on a stem | spotted cap with gills, stem with a face and scowl, stubby arms, feet; headbutts with the cap |
| Goblin Cutthroat (`goblin`) | Gloomwood | recoloured Rogue hero model | hunched, big head, long ears, hooked nose, toothy grin, yellow eyes, thin arms, big hands, ragged tunic, satchel; its dagger |
| Orc Raider (`orc`) | Gloomwood | recoloured Monk hero model | massive shoulders, head low and forward, heavy brow, underbite with tusks, topknot, bracers, crossed harness, fur mantle; its club |
| Cave Spider (`spider`) | Gloomwood | spider | patterned abdomen with a spinneret, eye cluster, fangs and pedipalps, three-segment legs with pale joints |
| Ogre Brute (`ogre`) | Ashen Barrens | big humanoid | round gut, long arms, small sunk head, one brow, bulbous nose, snaggle-tooth underbite, jug ears, hide loincloth; its club |
| Wraith (`wraith`) | Ashen Barrens | robe column | flared tattered cloak with a trailing wisp, deep hood with a void face and burning eyes, ragged mantle, bony arms with claws |

## Later stages (volcanic, glacier, voidscar; also the Death Zone and generated regions)

| Enemy | Biome | Before | Now |
|---|---|---|---|
| Hellhound (`hellhound`) | Ember Wastes / volcanic | the generic quadruped, red | heavy scorched hound: magma seams in a charcoal hide, a burning mane, swept-back horns, a glowing maw, clawed paws, an ember-tipped tail |
| Ember Drake (`drake`) | Ember Wastes / volcanic | the boss drake builder | four clawed legs, pale belly plates and dorsal plates, a long neck, horned head with brow frills, a longer snout and opening jaw, ribbed wings, a bladed tail |
| Magma Golem (`golem`) | Ember Wastes / volcanic | boulder golem | hunched giant of fused boulders, a large molten core and cracks across chest and arms, a burning mouth, obsidian spires with glowing tips, dripping fists |
| Frost Fang (`frostfang`) | Frostfang Peaks / glacier | the generic quadruped, white | bulky glacier wolf: layered shaggy coat, thick neck mane, broad paws, sabre fangs, ice shards along the spine |
| Yeti (`yeti`) | Frostfang Peaks / glacier | white humanoid | hunched snow ape: huge shoulders, long arms, short legs, fur tufts, blue-grey face, fanged mouth, forward horns, clawed hands and feet |
| Ice Golem (`icegolem`) | Frostfang Peaks / glacier | the magma golem in blue | angular ice construct: faceted crystal chest round a glowing core, block head with a glowing visor, ice-block arms with crystal fists, back icicles |
| Shade (`shade`) | Voidreach / voidscar, necropolis | the wraith in purple | a shadow, not a ghost in a robe: hunched body of smoke, jagged shoulders, long head with crescent eyes and a glowing mouth slit, long arms with scythe fingers, a trailing wisp, orbiting void motes |
| Void Weaver (`voidweaver`) | Voidreach / voidscar | the cave spider in purple | alien weaver: raised abdomen with glowing runes and crystal spines, long two-segment needle legs, rows of glowing eyes, mandibles, a void orb it weaves |
| Void Knight (`voidknight`) | Voidreach / voidscar | recoloured Warrior hero model | corrupted plate: greaves, ridged breastplate with glowing seams, spiked pauldrons, horned great-helm with a glowing T-visor, tattered cape; its void blade |

## Alpha variants

An Alpha is drawn with `MODEL[type]._a` (game.js uses it when a monster is an Alpha): the same builder at 1.3x size with
`alpha: true`, so each species adds its own features on top of its base design, never just a bigger copy:

- Wild Wolf / Frost Wolf: heavy pale mane, hackle ridge, flank scars, burning eyes.
- Tusk Boar: hide plates over the back, a second, larger pair of tusks, taller mane, red eyes.
- Green Slime: glowing toxic core, a ring of spines, angry brows.
- Shroomling: spore-glowing spots, glowing gills, a ragged veil, warts on the stem.
- Goblin Cutthroat: crest of black hair, red war paint, bone ear rings, a scar.
- Orc Raider: bone spikes on the shoulders, longer tusks, white war paint, a scarred eye.
- Cave Spider: glowing red hourglass, bristling spikes, longer fangs.
- Ogre Brute: great curved horns, a nose ring, tribal stripes, a second snaggle tooth.
- Wraith: spectral crown, glowing runes down the cloak, orbiting soul lights.
- Hellhound: twin horn pairs, a molten collar, more seams, taller mane, flame plume on the tail.
- Ember Drake: crown of horns, a glowing chest furnace, wing-claw spikes, gold-tipped plates.
- Magma Golem: obsidian armour plates, a crown of black spires, a larger core.
- Frost Fang: antler-like ice crowns, glowing rime cracks, heavier mane.
- Yeti: great curled horns, ice crusts on the shoulders, glowing eyes, a grey ruff.
- Ice Golem: crown of tall glowing crystals, rime plates, a deep blue core.
- Shade: horn crown, a second pair of arms, a burning heart, more motes.
- Void Weaver: crystal crown on the abdomen, a larger orb with a rune ring, spiked legs.
- Void Knight: crown of horns, burning runes, void flames on the pauldrons, a glowing cape hem.

`tests/fixtures/day1-model-geometry.json` freezes the approved Day 1 base models: the Alpha features are added after
the base parts, so the base geometry is unchanged.

Untouched: the Skeleton and the Bandit (model, animated Rogue character, equipment kit), every boss (Alpha Wolf, King
Slime, Orc Warlord, Spider Broodmother, Bone King, Ogre Chieftain), the Spirit Stones and their Alpha variants (Skeleton and Bandit Alphas keep their current look). The shared builders in `game.js`
(`human`, `beast`, `slime`, `spider`, `shroom`, `wraith`, `golem`, `drake`) are unchanged; the bosses that use them draw
exactly as before. `tests/enemy-models.test.js`
checks this against `tests/fixtures/enemy-model-sources.json` and checks every new model for finite geometry in every
pose. No weapons or equipment were added; the goblin dagger and the orc and ogre clubs are the ones they had.

Cost: 25 to 160 instanced primitives per enemy (the instanced batches are shared by every enemy on screen, so draw calls
do not grow with the number of enemies) and 1.5 to 16 microseconds of CPU per enemy per frame in the browser (Alphas included). Goblins, orcs
and void knights no longer use skinned hero characters (up to 26 skinned draws on screen before).
