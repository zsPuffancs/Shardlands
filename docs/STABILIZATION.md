# Stabilization and production balance policies

Date: 2026-11-12. Runtime verified: Node 26.13.0, Windows PowerShell.

## Verified Git checkpoint

The local tree matched the documented wrapper-removal checkpoint: 263 tests,
254 passed, exactly the nine existing failures. Build/typecheck and the AST root
import audit passed; all 44 wrappers were absent. Code, generated runtime artifacts,
docs and synthetic test fixtures were committed as **5adfac7**:
`feat(architecture): add typed balance and shared domains; retire root wrappers`.
Push succeeded to origin/develop. Ignored reports, node_modules, real saves,
rate/configuration files and credentials were not staged.

Later changes in this stabilization pass remain local. No later commit or push
is authorized by that initial checkpoint instruction.

## Historical failure causes and corrections

| Prior failing test | Intended behavior / smallest correction |
|---|---|
| adventure-improvements: daily eligibility | The old assertion excluded gap 13. Production and current XP design exclude gap 25. Test now proves 13 counts, 25 does not, and still verifies once-only concurrent durable claims. |
| adventure-improvements: catalog completeness | Regex mistook a concatenated category prefix for a whole translation key. Scan complete literal calls and explicitly assert all five dynamic category catalog keys. |
| gold-rewards: zero-rate Stone Souls | Direct drop fixture lacked a lifecycle permit. Complete an actual policy lifecycle before testing payout; gold remains zero and Souls remain present. |
| safety-limits: death penalty cap | Test expected historical cap 1; intentional Death Gold Penalty 2.0 ceiling is .05. Verify clamping, ignored NaN and explicit zero. |
| safety-limits: ten-drop cap | Artificial Stone had no completion permit. Authorize via the real lifecycle, assert ten drops at extreme Tier and verify replay pays nothing. |
| village-kit: Necropolis fingerprint | Stored raw MD5 cannot be reproduced even from approved 6dde9bd source on this runtime. All 38 approved/current asset Float32 buffers compare byte-identical; placement retains its original MD5. Use an approved-source canonical SHA256 at 0.0001-unit precision, retaining old raw hashes and provenance in the fixture. No production geometry was changed. |
| xp-economy: Stone party payout | Fixture explicitly set spent stage zero. Use a fresh stage-five lifecycle and retain individual penalty, per-member and duplicate-kill assertions. |
| xp-economy: category payout matrix | The synthetic Stone row lacked a fresh stage. Initialize only that row; preserve assertions across every actual category and malformed level. |
| xp-progression: guardian XP | Old test demanded XP-free guardians. Assert current 30%/50% normal-reference policy, exact live combat payouts, inherited levels and duplicate-hit protection. |

No production balance was changed to make these tests pass. Two new Stone-policy
regressions prove 48/3 lifetime budgets, single-use claims/loot permits, no renewal
through healing/stage reset, rewardless boss summons, identity checks and genuine
respawn invalidation of old tickets. Phase-2 full suite: **265/265 passed**.

### Necropolis evidence and fixture policy

Using git show 6dde9bd:public/village-kit.js and the current source with the same
stub GL/Settlement runtime gives the same per-asset Float32 data. Both raw global
MD5 values on Node 26 are e8d513e26a0b9d1c9ea2c3fde0f597de, versus the old recorded
39a39e86c5576e1d4cc0b83824f9c116. The exact reason for that historical raw-hash
provenance discrepancy is not established; it is not evidence of a current geometry
change. Both approved/current canonical SHA256 values are
ebb737d858a7ad9018694d64c67c4c907b33f0548ee3eea8f4544e092f37956f.
Placement remains 6815e785fc2200e1c39f2918cbd26d18. Canonicalization rounds every
Float32 coordinate/normal to 0.0001 before hashing, including material and asset
names. Existing topology, unit-normal, bounds and placement tests remain strict.
The new reference was derived from approved source, not automatically regenerated
from current output. No production recipe, generation version or save changed.

## Typed domain and network slice

src/shared/typed/forge.ts is the sole forge math implementation. It defines
ForgeItem, ForgePolicy, pricing, the unchanged failure/downgrade transition and
ForgeClientConfig. The build emits CommonJS/declarations plus the browser UMD
artifact; public/forge-math.js must no longer be edited directly.

Server inventory uses the resolved immutable forge policy for manual and automatic
attempts. Sessions serialize a copied forgePolicy plus the existing upRate array;
the browser uses the same typed calculation with that policy. Missing policy falls
back to original defaults for older-server compatibility. Client packet mutation
does not mutate server policy. The policy cannot be supplied by a forge request.

Services remain composed factories. No abstract entity hierarchy or saved class
instances were introduced. Base health/stats, loot ownership, party splitting,
plugin hooks and JSON save formats remain unchanged.

## Newly configurable production parameters

Precedence remains Base -> named Ruleset -> server overrides -> validation, with
the existing numeric rates.json adapter afterward. Presets still share defaults.
Every parameter below is **restart-required**, not silently live-reloaded.

| Domain / parameter | Existing default | Actual consumers and simulation |
|---|---:|---|
| forging.costBase / costExponent / levelDivisor / nonWeaponMultiplier | 100 / 1.3 / 12 / .8 | Shared typed pricing, server manual/automatic jobs, init metadata, browser price, Markov expected costs |
| forging.successRates | 1,.95,.9,.8,.7,.6,.5,.4,.3 | Actual server outcomes and browser chances, Markov transitions; exactly nine positive bounded entries |
| progression.wisdomMultiplier | 1.5 | Real createProgression Wisdom awards; simulator xpWithWisdom |
| gold.normalCostFraction / variation | .065 / .20 | Frontier budgets, loot/party payouts, death reference reward and simulator; founding legacy gold formula stays intact |
| loot.gearBaseChance / gearTierIncrement | .14 / .02 | Random normal/guardian gear probability in the real drop path and simulator; fixed boss/Stone drop counts unchanged |
| combat.recoveryDamageMultiplier | 1.25 | Real hits during boss recovery, world metadata and combat model punish window |
| monsters.hpPerDepth / damagePerDepth / worldExponent | .05 / .08 / .7 | Production spawner via monsterStats/worldFactor, world metadata and simulation including Tier 10000 |

Values are finite and bounded; forging arrays are shape-checked, minimum/maximum
legal-item prices must be positive safe integers, and unknown keys and
unsafe values fail validation. Configurable instance state is injected explicitly;
no mutable global policy or process-wide require hook was added. Existing technical
caps remain in safety-limits. Saved generation settings, descriptors and settlement
project snapshots retain authority. Changing an explicit restart policy affects
runtime calculations, not saved world identities or item records.

## Remaining read-only policy and next safe checkpoint

This pass does not claim every gameplay coefficient is configurable. Still read-only:

- XP requirement base/exponent, gap curves, encounter fractions/limits and party allocation.
- Equipment soft-cap parameters, primary/extra/affix formulas, rarity weights,
  merge/sell values and stored item stat construction.
- Monster reference-hero/category/party budgets, phases/enrage timings and size.
- Stone permit budgets/completion multipliers, fixed special drops, Souls and daily contracts.

Equipment stat tuning needs a policy context through character stats, reference-hero
cache identity, generation, rerolls, affixes, tooltips and trade/inventory itemView.
Exposing it before that migration would silently ignore settings in some consumers
or corrupt cached reference power. Such overrides remain rejected. Future work
should introduce that context and typed snapshot/equipment/status-effect boundaries
as independently verified slices, without changing defaults or save schemas.

The old standalone historical gold comparison still fails its pre-existing
combat/XP equivalence assertion; that guard was not removed. Unified simulations
use current production formulas and do not fabricate OLD/NEW data. Simulated
income is on-target analytical output, not live farming telemetry.

## Verification

Commands and final counts are recorded in MODERNIZATION-STATUS.md. Local logs and
JSON/CSV/Markdown outputs are under ignored reports/. The 263-test checkpoint is
the comparison base, not an expected-failure policy for the now-green suite.

Executed: npm run build, npm run typecheck, npm run check:shared-ui, npm test
(271/271), npm run test:unit (36/36), npm run test:balance (57/57), and npm run
test:integration (4/4). Normal and Custom gameplay-policy simulations both evaluated
levels/Tiers 1,100,500,1000,5000,10000 with 73 PASS, two documented analytical
limitations as WARN and zero FAIL. Generation/protocol/save fixtures are also part
of the complete suite; npm run test:determinism also passed 25/25. A recursive
comparison confirmed every previously existing Normal simulation field remains
exactly unchanged; only additive policy/XP-with-Wisdom metadata was introduced.
JSON and Markdown were parsed and CSV BOM/row counts checked after export.

Exact PowerShell/CMD install, build, run, targeted/full-test and export commands
remain in DEVELOPMENT-AND-TESTING.md. The new gameplay override sample is explicit
simulation input, never a default or an automatically loaded server rebalance.
