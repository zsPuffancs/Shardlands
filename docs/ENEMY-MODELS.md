# Day 1 enemy models

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

Untouched: the Skeleton and the Bandit (model, animated Rogue character, equipment kit), every boss (Alpha Wolf, King
Slime, Orc Warlord, Spider Broodmother, Bone King, Ogre Chieftain), the Spirit Stones and all later enemies. The shared
builders in `game.js` (`human`, `beast`, `slime`, `spider`, `shroom`, `wraith`, ...) are unchanged; enemies of later zones
that reuse them (Hellhound, Frost Fang, Shade, Void Weaver, ...) draw exactly as before. `tests/enemy-models.test.js`
checks this against `tests/fixtures/enemy-model-sources.json` and checks every new model for finite geometry in every
pose. No weapons or equipment were added; the goblin dagger and the orc and ogre clubs are the ones they had.

Cost: 25 to 130 instanced primitives per enemy (the instanced batches are shared by every enemy on screen, so draw calls
do not grow with the number of enemies) and 1.5 to 12 microseconds of CPU per enemy per frame in the browser. Goblins
and orcs no longer use skinned hero characters (up to 26 skinned draws on screen before).
