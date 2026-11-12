# Architecture modernization: audited migration plan

Audit baseline: develop at `88c8345` (2026-11-12). This document is a plan;
implementation status is recorded separately in DEVELOPMENT-AND-TESTING.md.
The plan below records the original phase sequence; consult MODERNIZATION-STATUS.md
for implemented Registry/TypeScript/simulation scope and subsequent domain refactors.
Its temporary root-wrapper compatibility strategy has since been superseded by
ROOT-WRAPPER-REMOVAL.md; current imports use src/ and root shims are retired.

## Baseline architecture

The backend is root-level CommonJS, without package.json, a build step or a
TypeScript toolchain. Node's built-in test runner executes tests/*.test.js.
server.js composes services and starts the server on import. local-server.js
forks it, handles restart IPC and optionally starts the invite tunnel.
public/index.html loads ordered browser scripts, including shared UMD helpers.
dev-atlas/ is a separate local-only developer UI served by world-atlas.js.

The root composition order matters: recover the redo journal before opening
stores; create world/universe and coordinated persistence; compose equipment,
inventory, teams, adventure, loot and combat; then snapshots, simulation,
plugins, sessions, transport and lifecycle. Several factories receive lazy
callbacks to services created later. Do not eagerly invoke those callbacks.

Dependency discovery must read source, never require server.js or simulation
scripts with top-level execution. Plugin hooks and browser globals are runtime
dependencies beyond literal require() edges. enemy-scaling.js deliberately
defers loading characters.js and equipment.js; a static cycle does not prove
a startup failure.

## Exact relocation map and compatibility strategy

docs/module-domains.json is the exact relocation manifest: each basename in a
domain maps from `<basename>.js` to `src/<domain>/<basename>.js`. server.js and
local-server.js remain root entry points. public/, plugins/, scripts/, tests/,
dev-atlas/ and art/ stay in place. Root module paths remain compatibility
re-exports, preserving existing plugin, script and third-party require paths.
Implementation-to-implementation imports must target src/ modules directly.

Move one dependency-coherent group at a time. Record baseline tests before
moving. After each group, compare exports, run focused tests and check every
literal relative dependency. Update source-inspection tests to read relocated
implementations, without removing or weakening assertions. Finish with the full
suite and an isolated real-server startup. Root storage and asset anchors must
not move: server.js passes root paths explicitly; tunnel and Atlas defaults
need explicit root resolution after relocation.

## Phase 2: Balance Registry

Build a dependency-free typed schema/validator with immutable resolution:
base defaults -> selected Ruleset -> server overrides -> validated effective
configuration. Separate domain values from safety-limits technical ceilings.
Normal, Hardcore, Accelerated and Custom initially resolve identical defaults;
their names do not authorize new balance values. Extract constants without
changing results and integrate consumers incrementally, with equivalence tests.
Do not create a registry that advertises overrides ignored by gameplay.

Classify parameters as live, restart-required, generation-locked or
save-sensitive. rates.json remains a numeric compatibility adapter, preserving
hot reload, bounded plugin writes and previous values on malformed input.
Generation-locked values must be frozen in descriptors/world snapshots and may
only affect newly generated content under an explicit version policy. Existing
settlement costs and donations remain immutable snapshots.

Suggested domains: progression, combat/monsters, equipment/forge, loot/gold,
region/generation, party, contracts and settlements. Add only implemented
parameters; avoid a generic configuration framework.

## Phase 3: TypeScript

Keep CommonJS and JavaScript entry points. Add only TypeScript as development
tooling, strict checking for new balance/types modules and emitted CommonJS
compatible with the supported Node version. Browser UMD files remain directly
loadable. Clearly distinguish authored TS from emitted JS, define reproducible
builds, and test launch from a clean checkout. Existing JS can adopt JSDoc at
domain boundaries without enabling checkJs across the whole repository.

## Phase 4: simulations

Compose real production helpers; do not fork formulas. Support Ruleset and
override inputs only where those inputs also affect production. Reuse existing
combat/XP/gold reports, identifying their assumptions and historical Git
dependencies. Use absorbing Markov states for forge downgrades, deterministic
seeded samples for loot distributions, and actual descriptor level ranges for
World Tiers. Evaluate levels and Tiers 1, 100, 500, 1000, 5000, 10000 separately.
Never equate these axes or invent time-to-kill data. Export JSON, CSV and
Markdown. Numeric/compatibility invariants define PASS/FAIL; economic preferences
and missing telemetry are documented WARN/limitations.

## Phases 5–7: verification and developer workflow

Use native node:test, temporary save directories and isolated ports. Cover
precedence, invalid inputs, equivalent base formulas, rates compatibility,
shared UMD behavior, plugins, coordinated persistence, deterministic generation,
integer bounds and deterministic statistical samples. Do not regenerate golden
fixtures to hide regressions. Classify baseline failures before changing code.

Document exact commands in DEVELOPMENT-AND-TESTING.md. Verify full/focused tests,
types, simulations/exports and isolated startup before claiming completion.
Never run startup against actual saves just to check a migration. Runtime code
does not get to rewrite saves merely because its file path changed.

## Review boundaries

No balance changes, save migrations, procedural regeneration, client redesign,
or unrelated cleanup are part of this structural work. Stop at a verified
checkpoint if a later phase cannot be completed safely within the execution
window; report unimplemented phases explicitly. No commit/push is implied.
