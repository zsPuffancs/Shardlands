# Vegetation distribution

The client bakes the world's vegetation once per map (`bakeDecor` in `public/world.js`). Nature-pack models are
placed into per-chunk GPU instance groups (trees, mid layer, ground cover), with cheap far stand-ins for trees,
chunk culling and the same draw radii and shadow rules per graphics quality as before. Nothing here is per frame.

Two placement systems exist side by side:

- **Uniform scatter** (the original): random points over the map, a model picked by the zone's table (`ZDEC`).
  Still used by every biome look except Gloomwood.
- **Distribution recipes** (`public/vegetation.js`): groves, open woodland and clearings. Used by the looks listed in
  `Vegetation.LOOKS`; today only look 1, **Gloomwood** (the founding ring and the wildwood regions).

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

## Tools

- `node scripts/vegetation-report.js`: trees per km2, mid and ground pieces, nearest-tree distance, share of ground
  with no tree within 150 / 250 units, model variety and bake time, per look (founding map and generated regions).
- `node scripts/vegetation-fingerprint.js [file]`: fingerprints per look (used to prove untouched looks are unchanged).
- `tests/vegetation.test.js`: budget and reduction, local density, canopy spacing, clearings spread through the forest,
  roads and village approach clear, forest floor, determinism, bake cost.

## Adding a biome

Add a recipe to `Vegetation.RECIPES` under the look index (0 Meadows, 1 Gloomwood, 2 Ashen Barrens / warfields,
3 Ember, 4 Frostfang / glacier, 5 Voidreach, 6 Death Zone / necropolis), then refresh the fingerprints of the looks
that stay untouched.
