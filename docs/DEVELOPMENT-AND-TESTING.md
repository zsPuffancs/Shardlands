# Development, tests and balance simulations

## Prerequisites and build/runtime boundary

Node.js 18+ (verified here: v26.13.0), npm and Git. TypeScript 5.9.3 is the only
development dependency. There are no runtime npm dependencies and no UI framework.
Run commands from the repository root. Existing node server.js/local launchers work
without a build or installation because generated CommonJS and browser artifacts
are committed. After editing TypeScript, build and commit the corresponding outputs.

PowerShell:

```powershell
Set-Location D:\git\Shardlands
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run typecheck
npm run check:shared-ui
```

CMD:

```bat
cd /d D:\git\Shardlands
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run typecheck
npm run check:shared-ui
```

Linux: use `cd /path/to/Shardlands`; the npm/node commands are identical.
This machine initially failed npm certificate validation. On this Node 26 Windows
setup, enabling the OS trust store for the install fixed it:
PowerShell `$env:NODE_USE_SYSTEM_CA = '1'`; CMD `set NODE_USE_SYSTEM_CA=1`.
This flag needs a Node version supporting system CA loading; otherwise install the
appropriate organization CA. Do not disable certificate verification.

Authored TypeScript lives in src/balance/typed/ and src/shared/typed/. Builds emit
CommonJS/declarations to their generated/ siblings. The build then wraps the
shared resource implementation as public/resource-bars.js for the global-script
browser client. check:shared-ui detects stale browser output. Neither generated/
nor the browser artifact is a place to hand-edit code. Existing JavaScript remains
CommonJS or browser globals; strict checking does not cover the entire legacy app.

## Running and stopping

```text
npm run dev
```

Runs local-server.js, with the interactive console and restart wrapper. Windows
also supports start.bat; Linux supports `sh start.sh`. For production-compatible
startup, after a clean build when TS source changed:

```text
npm start
```

Equivalent direct commands: `node local-server.js` and `node server.js`.
Open http://localhost:3000 or the configured port. `help` lists console commands;
`stop` or Ctrl+C requests saving and shutdown. The local wrapper also supports
`restart`. Optional cloudflared is only needed for invite tunnels.

Starting in the real repository uses its actual stores. Automated startup checks
instead copy code to a temporary directory, start the actual server and local
wrapper, load plugins, save, restart and verify seed/regions. They never copy real
player saves. Starting the server from an arbitrary cwd must not relocate storage.

## Tests

The following commands are identical on PowerShell, CMD and Linux:

```text
npm test
npm run test:unit
npm run test:integration
npm run test:balance
npm run test:determinism
npm run typecheck
npm run check:shared-ui
```

The native node:test wrapper enumerates filenames itself, avoiding shell wildcard
behavior differences. Unit tests cover Registry, mathematical models and typed
resource/entity components, retired-root import checks and scoped historical
resolution. Integration tests use real temporary files/processes.
Balance tests include production scaling, soft caps, XP ranges and deterministic
statistical samples. Determinism tests cover generation, saved fixtures and Atlas.

For a focused component run:

```text
node --test tests/resources.test.js tests/entities.test.js
```

The old full-suite failures are recorded in MODERNIZATION-STATUS.md. Do not present
a nonzero full-suite exit as success, weaken assertions, change balance or rewrite
golden fixtures to hide them. Compare failing names and values with the baseline.
The new domain-baseline.json fixture was generated from 142ecac source with a
synthetic seed, before applying shared World Boss helpers; no real world data used.

## Server Rulesets and overrides

src/balance/index.js resolves Base -> named Ruleset -> server overrides -> runtime
validation. All named presets currently preserve the same values: Normal,
Hardcore, Accelerated, Custom. A preset name does not imply an approved rebalance.

Optional config.json fragment (merge into existing configuration; do not replace
admins, port or other unrelated fields):

```json
{
  "balance": {
    "ruleset": "Custom",
    "overrides": {
      "rates": { "xpRate": 2 },
      "settlement": { "scalingCoefficient": 0.06 },
      "worldGeneration": { "budgets": { "monsters": 260 } }
    }
  }
}
```

Supported configurable domains are rates, settlement and worldGeneration. Rates
use existing technical ceilings. Settlement validates its costs, coefficient,
exponent, Tier and fixed schema version. Generation validates known budget/spacing/
danger keys. Unknown keys, nonfinite and unsafe values fail before opening saves.
The formulaCatalog() API exposes actual production XP/combat/equipment/gold/forge/
party/contracts constants read-only. They are not ignored override knobs: attempting
unsupported XP or forging policy overrides is rejected. Add further knobs only
when production consumers are migrated to accept their resolved policy explicitly.

Legacy rates.json is a compatibility layer applied after Registry resolution:
known finite numeric keys replace runtime rates, negative/high values clamp as
before, and omitted/invalid/malformed updates retain previous values. Plugin/admin
writes remain bounded. server-config.effectiveBalance() snapshots those runtime
rates. A pre-existing rates.json can therefore override new config rate values.
No local rates.json was changed by this implementation.

Classification: rates are live (monsterHp affects subsequent spawns), except
population requires restart. Settlement coefficients/costs are locked when a
project is initialized; the schema version is save-sensitive. Generation settings
are pinned in a universe's existing generationSettings snapshot. New config cannot
regenerate old regions or silently alter that universe's future geometry. The
pure resolveLiveUpdate API rejects changes requiring restart/new persisted state.

## Deterministic balance simulations and exports

Default synthetic world, levels and World Tiers 1, 100, 500, 1000, 5000, 10000:

```text
npm run simulate:balance
npm run simulate:balance -- --ruleset Normal --json reports/balance-normal.json --csv reports/balance-normal.csv --markdown reports/balance-normal.md
npm run simulate:balance -- --ruleset Hardcore --levels 1,100,10000 --tiers 8:20:4
```

Ranges use start:end:step; comma lists are also supported. At most 50 level
checkpoints and 100 Tier checkpoints are accepted. Levels are 1..10000 and Tiers
1..65542, matching the supported coordinate runtime. The two axes are not equated.

Custom simulation overrides are a JSON object containing domain patches (without
the config.json balance wrapper). A checked-in example is available:

```text
npm run simulate:balance -- --ruleset Custom --overrides docs/examples/balance-overrides.json --levels 100,10000 --tiers 8,10000 --json reports/balance-custom.json --csv reports/balance-custom.csv --markdown reports/balance-custom.md
```

These commands generate descriptors/plans through production functions using a
synthetic seed and frozen zero-history snapshot. They never unlock regions, spawn
persistent entities, read saves or write world history. Output parent directories
are created. reports/ is ignored by Git. CSV includes a BOM and quoted comma-
separated encounter rows for Excel; JSON has all domains/scenarios; Markdown has
assumptions, checks, encounters, Tier ranges and forge expectations.

PASS means its explicit mathematical/production invariant held. FAIL means an
invariant failed (including physically invalid generation); exports still include
structured diagnostics and the CLI exits 1. WARN identifies missing telemetry or
unavailable data, and exits 0. Default WARN includes absent live travel/kill/respawn
telemetry and the absence of an independent monster-defense stat (reported null).
A failed process/config validation is not a subjective balance warning.

Reference encounters use production stats/spawner/formulas and the existing
combat model: Common +0 before level 30, Rare +3 thereafter, averaged classes,
50% telegraph dodging, no potions/travel/respawn/guardian-wave time. Gold/hour and
XP/hour are on-target projections, not measured sustainable farming rates.
XP at the level cap is zero. Gold Find rounds its own raw budget; doubling an
already-rounded reward can differ by one gold. Party rewards reuse the actual
single-pool split. Stone lifecycle ceilings assume all bounded permits are used.
Expected Souls include the existing completion interval/Alpha chance; they are
not guaranteed drops or an economic valuation of Souls.

Forge +0..+9 uses exact absorbing Markov equations with production probabilities,
prices and the shared downgrade transition. Rarity/drop expectations use the same
helpers as live rolls. Reference sale prices use on-level +0 items, not a model
of actual random item-level drop sales. World rows use actual descriptor ranges
and validate real geometry/mandatory objectives. No preference is classified as
an economic failure without an explicit approved threshold.

Existing standalone reports remain available:

```text
node scripts/combat-balance.js
node scripts/xp-balance.js --progression --out reports/xp.md --json reports/xp.json
node scripts/world-generation-stress.js 100 reports/generation.json
```

The legacy combat report's worlds() convenience table retains its approximate
Tier mapping; the unified simulator uses actual descriptors instead. Historical
XP/gold OLD/NEW reports need Git baseline commits. The legacy gold report still
fails its pre-existing `Gold rebalance changed combat/XP reference data` assertion;
it also failed before modernization. Do not remove that assertion to claim an
OLD/NEW report. The new simulator reports current production formulas and does
not fabricate historical comparisons.

## Adding a real Registry parameter: worked example

The settlement scaling coefficient is now a complete implemented example:

1. Define it in SettlementEconomy (src/balance/typed/types.ts).
2. Keep the existing 0.06 in typed/base.ts; no unapproved default change.
3. Validate finite [0,1e6] values in typed/registry.ts; classify it generation-locked.
4. A named preset inherits it. Server overrides can provide the same property;
   Normal/Hardcore/Accelerated/Custom intentionally keep empty default patches.
5. server-config resolves the value; server.js injects it as constructionEconomy
   into createUniverse. New-project snapshotConstructionCosts consumes it.
6. Existing snapshots/donations are retained, including fixed legacy prices.
7. balance-registry.test.js checks equivalence, limits and precedence;
   balance-config.test.js exercises the actual production new/old project path.
8. The simulator calls constructionCostsForTier with the same resolved config;
   use the example override file and compare its new-project costs in JSON.
9. Build, typecheck, run the focused tests and regenerate simulation exports.

Do not expose a new field only in docs or simulation. Integrate production and
add invalid-input/equivalence/persistence tests before accepting the override.

## Agent navigation and remaining migrations

```text
npm run modules -- --out reports/module-dependencies.json
node scripts/module-map.js --group equipment-and-forging
node scripts/module-map.js --focus src/shared/typed/resources.ts
```

The source-only map includes authored TS entry points, imports, browser script
order, relocation map, static cycles and five audit groups. It does not execute
modules or read JSON stores. Lexical/comment examples and dynamic plugins require
manual review. Prefer filtered views to minimize agent context.
Root backend compatibility files were removed; import implementation modules from
src/. Run `node scripts/audit-root-imports.js --out reports/root-imports.json` to
check retired literal paths and review dynamic imports. The old historical report
filenames/Git paths remain virtual inputs; scripts/historical-imports.js resolves
only their imports without recreating root wrappers or patching global require.
See ROOT-WRAPPER-REMOVAL.md for every old/new path and external compatibility limits.
See AGENTS.md, ARCHITECTURE.md, DOMAIN-REFACTOR-PLAN.md and TYPESCRIPT-ROADMAP.md.
