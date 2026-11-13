# Vegetation distribution

The client bakes the world's vegetation once per map (`bakeDecor` in `public/world.js`). Nature-pack models are
placed into per-chunk GPU instance groups (trees, mid layer, ground cover), with cheap far stand-ins for trees,
chunk culling and the same draw radii and shadow rules per graphics quality as before. Nothing here is per frame.

Two placement systems exist side by side:

- **Uniform scatter** (the original): random points over the map, a model picked by the zone's table (`ZDEC`).
  Every biome look now has a recipe; the scatter still draws its random numbers (see below) and remains the fallback
  for a look without one.
- **Distribution recipes** (`public/vegetation.js`): groves, open woodland and clearings. Used by the looks listed in
  `Vegetation.LOOKS`: look 1, **Gloomwood** (the founding ring and the wildwood regions; playtested and approved, its
  output is frozen by `tests/fixtures/vegetation-approved.json`), look 0, **Meadows** (the founding ring round the
  village; approved and frozen too), and look 4, **Frostfang Peaks** (the founding ring and the glacier regions; approved and frozen), and look 2,
  **Ashen Barrens** (the founding ring and the warfields regions; approved and frozen), and look 6, **Deadlands** (the
  Death Zone ring and the necropolis regions; approved and frozen, including its bones and roots), and look 3, **Ember Wastes** (the
  founding ring and the volcanic regions; approved and frozen), and look 5, **Voidreach** (the founding ring and the
  voidscar regions; awaiting playtest).

For a planned look, the uniform passes still draw their random numbers and place nothing, so every other look, the
farmland and everything baked after the vegetation (zone specials, lava and ice pools) stays exactly as it was.
`tests/fixtures/vegetation-baseline.json` holds fingerprints of the untouched looks; the tests compare against it.

## How a recipe plants a forest

1. **Density field**: two octaves of seeded value noise (900 and 280 units) split the biome into groves, open
   woodland and thin woodland.
2. **Clearings**: one candidate clearing (130 to 220 radius) per 520-unit cell, so open ground for moving and fighting
   is spread evenly through the forest.
3. **Readable approaches**: no trunk or canopy over a road, trees along roads thinned to 30% within 200 units, and no
   trees within 240 units of the village safe zone.
4. **Trees**: a jittered 56-unit candidate grid; each candidate gets a chance from its band, a model, a size, a yaw
   and a priority. Candidates are accepted by priority with **canopy-aware spacing**: two trees need
   `max(24, 0.74 * (crownA + crownB))` between trunks, where the crown radius comes from the model's width / height
   and the tree's size. Saplings stand closer than old pines; wide crowns keep their room.
5. **Budget**: acceptance stops at the recipe's trees per km2 (Gloomwood: 52). The budget, not the clustering, sets
   the total.
6. **Forest floor**: understory round the trees (bushes, plants, mossy rocks, stumps), logs and berry bushes in open
   woodland, rock outcrops at clearings, grass and flowers in irregular patches (dense in clearings, sparse under groves).

Every decision is a hash of (universe seed + map, cell, salt): all clients build the same forest, independent of call
order and of the shared random stream.

## Meadows

Open grassland: the recipe has no groves and no clearings. Below a noise threshold the land is tree-free; elsewhere
lone trees (CommonTree, BirchTree, q1_Tree) stand at least 170 units from any other tree, and copses of 2 to 3 trees
(one per 520-unit cell at most, 60% chance) may stand closer to each other. Budget 17 per km2; in practice 8 to 11 per
km2 of the whole zone (12 to 16 on the land where trees may grow, outside the village ring and the road bands).
The ground layer uses two more noise fields: **flower meadows** (patches of Flowers with short grass) and **bare
ground** (grass chance cut to 12%), on top of grass patches of 8 to 22 tufts. Bushes, berry bushes, small mossy
rocks, logs and stumps are scattered on a 175-unit grid, small rock groups on a 560-unit grid. The farmland round the
village is untouched.

## Ashen Barrens

Harsh stony ground (look 2: the founding ring and the warfields regions). Trees only in the scrubby pockets of the
density field: twisted q1_DeadTree, dead common, birch and willow trees and a few dry-leaved hardy CommonTree_Autumn,
alone or in twos and threes, at least 170 apart otherwise (budget 13 per km2; 6 to 12 in practice). **Rock formations**
replace the scattered rocks: on a 300-unit grid, mostly where a 'rocky' noise field is high, a core of 1 to 4 large
rocks (up to 112) with 2 to 12 smaller stones spread to one side; four rock tints for variety. Dry bushes, stumps and
small rocks round the trees; fallen trunks, stumps, dry bushes and dry plants scattered; sparse patches of dry grass,
pebbles and dry plants, with a bare-ground field cutting them back. The farmland is untouched.

## Deadlands

Corrupted land where almost everything has died (look 6: the Death Zone ring and the necropolis regions). Only dead,
leafless trees with near-black, blood-tinted bark: twisted q1_DeadTree (most of them), dead willows, common trees and
birches, and stunted dead trees at the edges of the woodland. About 22 to 33 per km2 (budget 33; before: 74 to 80),
in dead woodland where the density field is high, as lone trees in the sparse band, and in knots of 3 to 6 twisted trees
(copses, standing close); below the 'open' band nothing grows. A **lifeless** noise field cuts barren patches out of
everything (trees, scrub, logs, grass) and fades life back in over their edges, so barren ground turns gradually into
dead woodland: 37 to 52% of the ground has nothing at all within 90 units. On top of that:

- **Fallen timber**: on a 340-unit grid, mostly where a 'debris' noise field is high, heaps of 2 to 4 fallen trunks
  lying roughly one way (windthrow), 3 to 7 broken branches (short WoodLogs) and a stump or two; none in the barrens.
- **Remains**: on a 400-unit grid, mostly where a 'remains' field is high, 1 to 3 bone piles (a skull with scattered long
  bones, sometimes ribs) and dead roots (a dead stump with roots sprawling from it). The nature pack has no bones or
  roots, so these are plan items with `prim` that world.js (`bakeRemains`) bakes from the engine's primitives into the
  static chunk geometry, like the zone specials (the existing spikes and skull piles of the Death Zone are untouched).
  Bones also lie in the barren patches.
- Dead thorny scrub, dried plants, stumps and dark stones round the trees; scattered fallen trunks, broken branches,
  stumps and dead bushes; small dark rock outcrops; sparse patches of dead grass, grit and dried plants with a
  bare-ground field between them.

Nothing on roads; no trees within 240 units of the village safe zone, no pieces within 60.

## Ember Wastes

A hostile volcanic land where almost nothing survives (look 3: the founding ring and the volcanic regions). **Volcanic
rock formations** are the landscape: on a 330-unit grid, mostly where a 'rocky' noise field is high, a core of 1 to 5
large rocks (up to 125) with 2 to 10 smaller stones spread to one side, in four tints (basalt, ash grey, obsidian, rust).
Trees are rare: charred, twisted q1_DeadTree, dead common trees and dead willows, almost all alone, now and then two or
three together (budget 8 per km2; 4 to 7 in practice, before 56 to 62). A **lifeless** field leaves barren volcanic
ground with nothing on it but rock; vegetation fades in at its edges. Burnt scrub, scorched stumps and stones round
the trees; a few fallen scorched trunks, stumps, burnt bushes and hardy dry plants; sparse patches of cinders, grit and
scorched grass with a bare-ground field between them. 53 to 65% of the ground has nothing within 90 units. Existing
assets only (rocks, dead trees, stumps, logs, bushes, plants, tinted); the zone specials (obsidian spikes with ember
glows, lava pools) are untouched.

Possible low-poly additions, not made yet: glowing lava cracks (flat emissive strips, like the lava pools), basalt
columns (hexagonal prisms from the engine's six-sided cone/tube mesh), smouldering ember stumps (a stump with a small
emissive core) and ash drifts (flattened grey discs). Each would be a `prim` item baked into the static chunks, as the
Deadlands bones are.

## Voidreach

Alien, corrupted land (look 5: the founding ring and the voidscar regions). No ordinary trees: void-blackened drooping
willows, twisted dead trees, tall spindly dead birches and stunted growths, 13 to 16 per km2 (budget 16; before 113 to
120), as lone trees, knots of 2 to 5 and a few dense growth clusters. A **lifeless** field leaves barren void ground
(47 to 59% of the ground has nothing within 90 units) that grows gradually more corrupted towards the clusters. Strange
plants: near-black pillar growths (tinted Cactus models), corrupted bushes, violet ground plants and grass, dark void
rocks and grit. Three small code-built **growths** (`growths` in the recipe: clustered by their own noise fields;
items with `prim`, baked by world.js `bakeRemains` into the static chunk geometry, opaque, glow only on a few faces):

- `crystals`: void crystal clusters (3 to 6 leaning octahedral shards, faint glow, on a dark stone), gathered in
  small crystal fields covering 4 to 11% of the ground.
- `growth`: alien stalks (3 to 5 tapering stalks, each ending in a bulb; a little over half the clusters glow), only
  on living ground.
- `veins`: corrupted roots breaking out of the ground, one or two of them faintly lit.

The zone specials' tall void crystals were thinned (36% of the candidate spots instead of 60%), keeping the same
random draws so nothing else in the world moves.

## Frostfang Peaks

Snow-laden pine woodland in pockets and stands: the Gloomwood structure (density field, clearings, canopy spacing, a
budget of 46 per km2) with roomier spacing (0.8 of the crowns), wider snowfield clearings (140 to 235 radius) and
copses of 2 to 5 trees out in the open, so stands range from lone trees to large pockets. Trees: PineTree_Snow
(also as saplings), CommonTree_Snow, BirchTree_Snow and a few dead snowy trees. Ground: snow bushes, snowy rocks and
stumps round the trees, fallen snowy logs, many exposed rock outcrops (3 to 7 rocks), and sparse patches of small snow
bushes, pebbles and frosted grass with bare snow between. Snow assets only; the farmland and zone specials (ice
crystals, ice pools) are untouched.

## Tools

- `node scripts/vegetation-report.js`: trees per km2, mid and ground pieces, nearest-tree distance, share of ground
  with no tree within 150 / 250 units, model variety and bake time, per look (founding map and generated regions).
- `node scripts/vegetation-fingerprint.js [file]`: fingerprints per look (used to prove untouched looks are unchanged).
- `node scripts/vegetation-load.js <look>`: instances, vertices and shadow-casting trees in view, before and after.
- `tests/vegetation.test.js`: budget and reduction, local density, canopy spacing, clearings spread through the forest,
  roads and village approach clear, forest floor, determinism, bake cost; for Meadows the same over eight seeds, groups
  of at most three trees, open ground, patchy grass, flower meadows and bare ground.

## Adding a biome

Add a recipe to `Vegetation.RECIPES` under the look index (0 Meadows, 1 Gloomwood, 2 Ashen Barrens / warfields,
3 Ember, 4 Frostfang / glacier, 5 Voidreach, 6 Death Zone / necropolis), then refresh the fingerprints of the looks
that stay untouched. Optional recipe parts (`clearings`, `copses`, `formations`, `lifeless`, `debris`, `remains`, `growths`,
`grass.flowers`, `grass.bare`, `outcrops.tint`) only act when a recipe defines them, so adding one never changes the
other looks; the fingerprint test proves it.
