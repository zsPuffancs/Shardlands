# Procedural generation audit and v2 foundation

Audit date: 2026-11-11. Local develop branch; Node v26.13.0 on Windows. Existing uncommitted snapshot/UI work was preserved. This audit adds no UI changes and does not migrate the live universe.

## Confirmed findings

- Founding annuli sampled radius uniformly, concentrating surface density toward the inner radius. Camp offsets could cross zone boundaries and the village exclusion. No common encounter-spacing validation existed.
- Frontier regular monsters and Alphas were already fixed at 260 and 8. The suggested unbounded count formula was not in the repository. However, every unlocked map eagerly instantiated all of its monsters, so aggregate live population grew with progression.
- Seeded layout streams existed, but a single stream coupled categories within a layout. Persistent spawn levels could still depend on runtime unseeded randomness. Legacy scenery already had a separate seed-derived client stream.
- The map runtime uses one global coordinate plane and an array of map descriptors. Pure generation can support much larger tiers than this runtime can address efficiently. Increasing integer tiers is not a complete infinite-world architecture.

## Mathematics

Let a and b be the inner and outer radius. An annulus has area pi*(b^2-a^2). With uniform radial sampling, the radial PDF is 1/(b-a); the **surface density** is 1/(2*pi*r*(b-a)). The request's 1/r relationship describes surface density, not the radial PDF.

For uniform area, the radial CDF is F(r)=(r^2-a^2)/(b^2-a^2). Inverse-CDF sampling therefore gives:

    r = sqrt(a^2 + u*(b^2-a^2)), theta = 2*pi*v

for independent uniform u,v. Its radial PDF is 2*r/(b^2-a^2), giving constant surface density 1/(pi*(b^2-a^2)). This is implemented by sampleAnnulus.

Square regions use uniform X/Y candidates, jittered subdivisions and rejection of the protected disk and exclusions. Annular sampling is not applied to square corners. Final repulsive/stratified encounter layouts are intentionally not iid area-uniform samples; the iid distribution test applies to the primitive sampler, not to those correlated layouts.

## Modules and pipeline

- deterministic-random.js contains the exact previous hash/PRNG implementation for v1 compatibility.
- world-generation.js contains pure v2 generation, budgets, serializable definitions and validation. It does not instantiate gameplay objects.
- universe.js dispatches generator versions and persists descriptors/settings/history. V2 descriptions at extreme tiers use bounded level metadata; the combat scaling formulas themselves were not redesigned.
- regions.js adapts plans to existing zone/map data without introducing a terrain engine.
- encounter-runtime.js activates a bounded working set near players and checkpoints its state.
- simulation.js calls the encounter lifecycle; server.js checkpoints it before saves.

Generation sequence: validate boundaries; reserve a settlement/protected disks and four open road corridors; reserve required boss arenas; place camp clusters; place Alphas, stones and optional resource sites; build boss connection paths; validate and persist. Roads/path segments are traversable in the current obstacle-free server movement model. This is not terrain-aware navigation.

Bosses are placed first and the required World Boss is always included. Distances between unrelated encounter centers are max(kind minima, footprint radii sum + 20). Defaults: camps 180, stones 200, Alphas 180, bosses 500, resource sites 180 world units. Camp members scatter within radius 80; internal camp clustering is intentional. Region/footprint/protected checks prevent offsets from escaping the allowed domain. Applications can provide additional protected wilderness disks.

Bounded rejection with a spatial grid was chosen over a full Bridson sampler: encounter kinds need different spacing and fixed priority, and founding regions already have irregular usable areas. It has deterministic work limits and never silently relaxes constraints. Optional placement can underfill; a missing required boss rejects the plan. Camp angular strata get a seed-dependent phase; square strata get a seed-dependent permutation. Failed strata can fall back to broader candidates, leaving irregular wilderness instead of forcing a lattice.

## Determinism and compatibility

The new default is generator v2 **only for newly founded universes**. Existing version-1 worlds keep version 1, including future regions in that universe. Existing seed-bearing saves without a generatorVersion are pinned to v1. There is no automatic upgrade or live reseed. Unknown saved versions fail explicitly without deleting the save.

Three pre-change v1 fixtures lock all founding coordinates/types/Alpha flags (3390, 3381 and 3392 entities) by SHA-256, plus descriptors at tiers 1,3,7,8,20,1000. All hashes still match. This preserves the actual legacy layout algorithm, including its historical limitations. Previously unseeded v1 combat-stat choices are not retrospectively rewritten or claimed deterministic.

The bundled frost_wolf plugin keeps its original nine unseeded startup spawns in v1. In v2 it registers its family with the seeded camp generator instead, so its monsters obey the same placement/activation budgets. Arbitrary third-party plugins can still bypass generation; they must use version-aware registration and be included in the world content manifest.

V2 streams use SHA-256 counter blocks with a length-unambiguous JSON label tuple: seed, tier, version, purpose and stable encounter ID. Camps, member selection, spawn stats, stones, bosses, elite encounters, resources, coverage, names, biome/families and affix descriptors have independent streams. A change to a later resource budget cannot shift camp outcomes. Family and boss candidate lists are canonicalized. Deliberate spacing/hierarchy dependencies remain: changing an arena can move later encounters.

Terrain and decoration purpose labels can use the same stream API, but no terrain engine or replacement client scenery generator was introduced. Existing client scenery was left intact to respect the no-UI-change scope. A later scenery migration needs its own versioned client contract.

Generation budgets/spacing are captured in generationSettings at universe creation and persisted. Generated plans are stored once in each region; changing deployment configuration does not rewrite them. New gameplay levels are chosen in the plan using the existing base-level/zone rules and then passed explicitly into spawnMob. Runtime randomness is not used for v2 persistent generation.

## Definitions, persistence and active budgets

A spawn plan stores encounter centers, stable spawn IDs, types, local coordinates, levels, paths, exclusions, requested budgets and placement diagnostics. Resource/anomaly/affix data are preparatory only; no new combat-affix mechanics were implemented. V2 world, encounter and combat affix arrays are separate, with a disabled anomaly slot bounded to one.

Hard per-region limits: 800 regular monsters, 40 stones, 16 Alphas, 4 bosses and 32 non-monster resource sites. Frontier defaults are 260 regular monsters, 32 stones, 8 Alphas, 1 boss: at most 301 planned monsters, independent of tier. Founding budgets use their zone values clamped to those hard limits. Budgets are maxima, not promises to violate geometry.

Default runtime limits are 2048 total existing entities before further procedural activation and 512 per map, with activation queries within a 1700-unit square neighborhood. These limits govern procedural activation; plugins/admin spawns and combat summons are not an absolute total-entity quota. V1 worlds retain legacy eager population.

Plans are generated lazily when players approach a zone. Active regions are indexed by map; thousands of unvisited registrations do not run generation or AI. After 30 seconds without nearby players, encounters without a target or pending cast unload. Health fraction, death deadline, stone phase, team multiplier and boss special-attack timer are saved; an unload/reload does not restore wounded stones or reset an unexpired death timer. Expired deaths respawn normally. Shutdown and regular save paths checkpoint active state.

Optional deployment example (layout values are frozen at new-universe creation; activation limits are deployment controls):

    "worldGeneration": {
      "budgets": { "monsters": 260, "stones": 32, "alphas": 8 },
      "spacing": { "camp": 180, "stone": 200, "alpha": 180, "boss": 500 },
      "activation": { "maxActive": 2048, "maxPerMap": 512, "activationRadius": 1700, "unloadAfterMs": 30000 }
    }

## Validation results

All 37 unit/regression tests passed. An isolated two-client live server test also passed v2 cold startup, lazy activation, persisted spawn plans/state, inventory/team/trade/chronicle updates, resync and graceful shutdown.

Run unit/regression tests:

    node --test tests/*.test.js

Run the reproducible stress harness (an optional final argument is the output JSON path):

    node --expose-gc scripts/world-generation-stress.js 10000

Final stress workload: 10,000 deterministic combinations, including all seven founding rings, square frontier regions, million-scale tiers and tiers near Number.MAX_SAFE_INTEGER. Results:

| Metric | Result |
|---|---:|
| Invalid regions / required arena failures | 0 |
| Minimum-distance violations | 0 |
| Boundary/protected-area violations | 0 |
| Member placement failures | 0 |
| Optional encounter placement failures | 730 |
| Maximum planned monsters in any tested region | 848 |
| Generation mean | 1.773 ms |
| Generation p95 | 5.493 ms |
| Generation max | 12.836 ms |
| Total run including geometric validation | 20.58 s |
| Heap before / after forced GC | 4.81 / 5.55 MiB |
| Sampled peak heap / RSS | 54.48 / 151.37 MiB |

All 730 optional failures were in the first narrow founding ring: 1.42% of requested encounters there. No optional failures occurred in the 3000 square frontier cases. This is deliberate bounded underfill, not a distance violation. The initial 220/240 camp/stone settings caused 8194 optional failures; empirical density tuning to 180/200 reduced it without relaxing the final configured constraints.

The iid sampler was tested with 100,000 points. For normalized squared radius the KS statistic was 0.003412, below the predeclared 1% threshold 0.005148. Angular chi-square was 5.576 with 11 degrees of freedom, below 24.725. No thresholds were fitted to the observed statistics. Fixed-seed statistical tests check gross distribution defects, not a proof of randomness.

Memory figures include Node/JIT/allocator retention and sampled peaks; the harness generates then discards plans, so these numbers are not the memory cost of retaining 10000 world histories. A separate runtime test registers 1000 dormant regions and verifies only the occupied map loads. Restart tests reproduce exact spawn definitions, levels and wounded health; missing generation dependencies are isolated and retried rather than deleting state.

## Remaining limits and next steps

1. Legacy v1 worlds remain eager and keep their original placement imperfections. Opt-in migration requires a separately reviewed migration preserving encounter IDs and progress; it was not performed.
2. Plans/history still live in one JSON universe store. Persistent definition memory/disk use grows with explored history, even though active procedural monsters are capped. Next: a region repository with paged loading, a bounded plan cache and incremental checkpoint writes.
3. The current global coordinate/map-array runtime is explicitly capped at 65535 frontier maps. Pure v2 descriptors/plans accept positive safe-integer tiers; that does not make the runtime infinite. Next: region-local coordinates, map IDs independent of array indices and eventually simulation sharding.
4. Fixed-step combat still uses the existing level scaling. V2 level metadata saturates at 10000; long-term progression through mechanics/affixes requires the separate combat design requested by the audit.
5. Connectivity is proven only for the present unobstructed server plane. Before adding collision terrain, validate a navigation graph/flood fill against actual obstacles and terrain costs.
6. Streaming may create a short activation delay (lifecycle checks run every 500 ms), and a full global active budget can postpone additional encounters. Per-player reservations/fair scheduling and dormant-region eviction under capacity pressure are future refinements.
7. Resource sites, anomalies and layered affixes are schemas only. Earlier-region usefulness needs economic/progression design, not higher monster counts; no new loot economy was invented in this audit.
8. Content tables/plugin changes can alter definitions not yet generated. Next: persist a content manifest/version alongside generator settings; arbitrary third-party plugins are outside the pure generator guarantee.
9. Spawn definitions and seed-dependent placement are deterministic, not secret. Do not derive credentials or valuable secret outcomes from public world seeds.
