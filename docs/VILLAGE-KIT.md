# Village kit

`public/village-kit.js` draws every village, in all six biome styles (`Settlement.KIT_STYLES`), with one cohesive set
of low-poly dark-fantasy assets. The approved **Dark** (Necropolis) style is the reference: weathered stone, dark
timber, slate roofs, muted colours and controlled glow. The original renderer (`public/village.js`) still draws the
ground work (plaza, streets, terraces, stairs, ponds), encampments and portal sites.

## Layout and biome stay separate

The layout (`public/settlement.js`) decides placement, roads, walls and gates, the plaza, the vendors and all
collision; it is the same for every style. The biome style only decides how the pieces look:

| Style | Roofs | Walls | Trees / gardens / beds | Scatter | Portal light |
|---|---|---|---|---|---|
| Dark | slate | stone | dead trees, graves, bushes | bones, wrecks, dead trees | violet |
| Timber | thick thatch with eave bands and a ridge roll; flower boxes | log palisade, log watchtowers, timber gate frames | oaks and birches, vegetable plots, flower beds | hay, log piles, flowers | green-gold |
| Snow | slate under snow caps, icicles; snowdrifts at the walls | stone with snow on walks and merlons | snowy pines, covered woodpiles, snowy shrubs | log piles, drifts, ice spires | ice blue |
| Sandstone | flat roofs with parapets, beam ends and domes; awnings and pots | sandstone, domed towers | palms, pot gardens, potted plants | pots, awning stalls | gold |
| Ember | black iron with glowing seams; lava cracks up the walls | basalt with lava seams | charred trees, lava pools, obsidian | obsidian, lava vents, bones | fire orange |
| Void | corrupted slate with crystals breaking through; rune veins and floating shards | violet stone with veins, shards over the towers | crystal trees and beds | shards, floating stones | magenta |

Each style is a descriptor in `KIT_STYLE` (roof, wall, cracks, snowCap, awnings, shards, trees, garden, bush, details,
energy) plus a palette in `KIT_PALETTES` (the same material names everywhere). The shared recipes read the descriptor
through small treatments (`roofGable`, `roofHip`, `roofCone`, `flatRoof`, `dome`, `decorHouse`, `decorStone`,
`watchTower`). Assets are built per style, only when first placed, so a map builds only its own style. The Dark
style takes exactly the plain path: its geometry, seeds and placement are unchanged (a test checks a fingerprint).

## How it fits the engine

The renderer is a dependency-free WebGL engine with two static paths: merged "baked" chunks and GPU-instanced meshes.
The nature pack (`assets/nature.json` + `.bin`) is converted to plain triangle arrays and drawn instanced per world
chunk; GLB loading is only used for skinned characters. The kit uses the same instanced path, with no new format:

- **Geometry** is made in code at first use, with the engine's own mesh format: `GL.meshFromArray(Float32Array)`,
  6 floats per vertex (`x, y, z, nx, ny, nz`), flat-shaded facets (one normal per triangle, pointing away from the
  piece's centre). A small builder (`box`, `gable`, `hip`, `cyl`, `blob`, `crystal`, `arc`, `panel`) with seeded
  jitter gives stone its weathered, hand-cut look.
- **One mesh per asset and material.** Colours are not baked into vertices; each instance carries its colour and
  emissive value from the palette (`GL.instWrite`), so one geometry serves every style.
- **Instancing:** placement fills one instance array per mesh; every frame the village queues those arrays
  (`GL.pushInst`), so all 50 lanterns are one draw call. Glass and rune parts skip the shadow pass.
- **Anchors:** assets list light points (lanterns, coals, runes, windows) and smoke points (chimneys, forges);
  the kit draws the glow and a little smoke there.
- Flat ground work (plaza paving, streets, terraces, pond, stairs) stays baked by `village.js`.

Totals for the whole kit: 38 assets, 178 meshes, about 11,700 triangles, built once. A Grand Circle village is about
800 instances in about 126 instanced draw calls, plus about 70 small lights.

## Assets

| Group | Assets (`VillageKit.RECIPES`) |
|---|---|
| Portal | `portal`: stepped octagonal dais with rune inlays and two crossed gates (east-west and north-south), each with two leaning rune monoliths, a pointed arch of carved blocks and layered violet energy panes; a floating crown crystal, drifting glyphs and rune stones. About 200 tall, readable from every road. |
| Vendor stations | `cartMerchant` + `stationMerchant` (covered wagon with crates and sacks; crates, barrels, sign with a coin mark, a table); `cartSmith` + `stationSmith` (flatbed with a chest and a weapon rack; anvil on a stump, quench tub, forge brazier with a hood); `cartMystic` + `stationMystic` (caravan with charms, bones and candles; candle altar with a rune circle, crystal pylon). |
| Houses | `houseCottage` (timber frame, steep slate gable, chimney, porch lantern), `houseStone` (rough stone, hip roof, side chimney, arched door, moss), `houseTown` (stone ground floor, jettied timber upper floor, dormer), `houseTower` (stone base, octagonal timber floor, spire), `houseChapel` (buttressed gothic hall, bell tower with a spire, glowing pointed windows). |
| Structures | `wall` (24-unit module with merlons), `tower`, `gateTower`, `gateArch` (scaled to the gate, raised portcullis, banner), `marketStall`, `well`, `forge` (open smithy shed), `lantern`, `brazier`. |
| Environment | `deadTree`, `deadTreeB`, `bush`, `rock`, `boulder`, `barrels`, `crates`, `fence`, `sign`, `supplies`, `bones`, `wreck` (broken wheel, shield, spear), `graves`, `statue`, `obelisk`, `pillar`, `banner`. |

Local frame: +x along the width, **+z is the front** (doors; the side that faces the portal), y up. Houses are built
at a 50 x 40 footprint and scaled to the layout's footprint.

## How a village is placed

`VillageKit.place(layout, cx, cz, style)` reads the shared layout from `public/settlement.js`: the same data the server
uses for collision. The portal goes at the centre. Each vendor's cart and station go at the layout's cart position,
with the cart's yaw, behind the NPC (Portal -> NPC -> cart). Buildings map from the layout type to a house variant
(chosen per position, deterministically). Props map to kit props, and wall modules are laid along the wall segments,
with gate towers and arches on the four roads. A deterministic scatter adds 40-50 small details in free corners. They
are never placed on roads, doorsteps, the plaza, near NPCs or in solid things, and have no collision.

Collision for the kit's larger solid pieces lives in `settlement.js` (so server and client agree), only for kit styles:
the four portal monoliths, the full vendor station (82 x 26) and the gate towers. The station's space is reserved in
every style, so a layout is the same whatever its style.

## Adding or changing a biome style

1. Palette: `KIT_PALETTES[style]` (start from `...DARK`, keep the material names).
2. Treatment: `KIT_STYLE[style]`. New roof or wall kinds go in the treatment helpers, never in the layouts.
3. Biome-only assets (trees, gardens, scatter) go in `R` and in `BIOME_ONLY`, and are named in the descriptor.
4. `Settlement.KIT_STYLES` lists the styles drawn by the kit; it also switches on the kit's extra collision on the
   server and the client together. All six are on.

## Adding village layouts

Layouts live in `public/settlement.js` (`LAYOUTS`). Building types are mapped in `HOUSE_FOR`, and props in the
`switch` in `place()`. A new layout that uses existing types needs no kit change; a new type needs one line there.

## Limitations of this prototype

- Ember and Void villages are drawn and tested, but the volcanic and voidscar biomes always generate encampments
  (`Settlement.choose`), so they do not appear in play unless that rule changes.
- The Avenue's ceremonial arch, terraces and stairs come from the base renderer in the style's ground colours.
- The base layouts were made for the original, smaller houses, so some kit houses are scaled down to fit tight
  footprints. Chapels stand in for cathedrals, palaces and gothic halls; tower houses for keeps.
- Scattered details have no collision, by design (they stay out of walking paths), so a hero can brush through a barrel.
- The engine has no real height, so High District terraces and the portal dais are visual steps.
- Draw cost grows with the number of distinct assets, not copies: about 120-130 instanced draws per village,
  plus shadows. Distant villages (more than 1,900 units away) are skipped entirely.
