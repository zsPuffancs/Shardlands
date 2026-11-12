# Development and testing

## Checkpoint status and prerequisites

2026-11-12: architecture audit, 44-module backend relocation, compatibility
entry points, dependency tooling and AI-agent documentation are implemented.
This is a verified phase-1 checkpoint, **not the completed modernization**.
Balance Registry/Rulesets, TypeScript, unified simulations and CSV export are
still pending. See MODERNIZATION-PLAN.md for the approved remaining phases and
MODERNIZATION-STATUS.md for actual checks and pre-existing failures.

README's runtime requirement is Node.js 18+. This checkpoint was tested with
Node.js v26.13.0 on Windows. No package.json, npm dependencies, TypeScript
compiler or build step is currently required. Git and the historical baseline
commits are required for OLD/NEW XP and gold comparison scripts. Do not npm install
or assume npm run scripts exist. Optional cloudflared is only for the invite
tunnel, not game startup, tests or reports. Art/rig tools may require assets;
they are separate from balance simulations.

All commands below run from the repository root, e.g.:

```powershell
Set-Location D:\git\Shardlands
```

```bat
cd /d D:\git\Shardlands
```

On Linux use `cd /path/to/Shardlands`. All `node ...` commands below are identical
in PowerShell, CMD and Linux shells. No shell-specific environment assignments
are necessary. Run tests/builds only when the current task authorizes them.

## Run and stop the game

```text
node local-server.js
```

This is the development/local wrapper with interactive restart support.
Windows users can also run `start.bat`; Linux users can run `sh start.sh`.
The Windows launcher opens the browser. For the production-compatible direct
entry point, with no compilation step:

```text
node server.js
```

Open http://localhost:3000 (or the configured port). Run `help` in an interactive
server console for available commands; Ctrl+C initiates the save/shutdown path.
Restart is available through the local wrapper. Back up saves before operational
changes. Starting these commands in the actual repository uses its real stores;
for automated startup checks use the isolated integration test below instead.

## Tests

Full suite:

```text
node --test tests/*.test.js
```

Focused architecture unit tests:

```text
node --test tests/architecture.test.js
```

Isolated integration/startup/plugins/save/restart check:

```text
node --test tests/architecture-startup.test.js
```

Deterministic generation and authoritative Atlas endpoint checks:

```text
node --test tests/world-generation.test.js tests/danger-atlas.test.js
```

Focused balance regression checks:

```text
node --test tests/enemy-scaling.test.js tests/xp-region-levels.test.js tests/item-soft-cap.test.js
```

These are explicit file selections, not an assertion that the entire old suite
is partitioned into unit/integration folders. There is no typecheck/build command
at this checkpoint; phase 3 must add and verify those before documenting tsc.

The full suite currently has nine baseline failures; see MODERNIZATION-STATUS.md.
A nonzero full-suite exit must not be presented as success. Compare failing test
names/assertions with the baseline, investigate new failures, and do not rewrite
fixtures or alter gameplay to hide them. Test durations vary with load.

## Existing production-formula reports

Default combat report, console Markdown:

```text
node scripts/combat-balance.js
```

XP progression report with JSON and Markdown export (output parent must exist):

```text
node scripts/xp-balance.js --progression --out xp-report.md --json xp-report.json
```

Gold OLD/NEW report:

```text
node scripts/gold-balance.js --out gold-report.md --json gold-report.json
```

**Known failure:** the default gold historical comparison currently throws
`Gold rebalance changed combat/XP reference data`. It also fails on unmodified
88c8345: its historical gold-only assertion predates subsequent combat/XP work.
Do not remove the assertion or claim a valid OLD/NEW export. Both XP and gold
scripts accept `--baseline <commit>`; select a meaningful baseline explicitly,
not merely one that makes checks pass. Missing historical Git commits also
produce an actionable failure instead of an invented estimate.

Bounded generation stress/distribution report, 100 cases and JSON output:

```text
node scripts/world-generation-stress.js 100 generation-report.json
```

The count is validated in 1..1000000. This command executes on load; do not
require the script as a library. The 100-case run checks the generator's placement
and distribution invariants, not every long-term gameplay difficulty relationship.

PowerShell/CMD/Linux can all redirect console output using `> combat-report.md`.
JSON should use the scripts' `--json` option or positional output argument rather
than redirecting human-readable stdout. The commands above create reports in the
current directory; they are disposable artifacts, not save files. Do not commit
large report outputs or include private seeds from real saves.

### Interpretation and current limitations

- Existing scripts are individual analytical reports, not a unified PASS/WARN/FAIL
  framework. They do not accept a common Ruleset, overrides or Tier range.
- Combat reports model reference heroes and explicit dodge/healing assumptions.
  Their `worlds()` helper uses an approximate Tier-to-level mapping, not current
  authoritative generated ranges. Do not use it as proof of frontier balance.
- XP reports state fixed/reference kill-time assumptions; XP/hour is a scenario,
  not measured production telemetry. Boss progression, gear and Souls have value
  beyond that number. Inspect the source and printed assumptions.
- Gold historical comparisons require an appropriate Git baseline and currently
  have the documented pre-existing assertion failure.
- Generation checks report numeric/distribution invariants and optional placement
  failures. Optional skipped encounters are not mandatory-objective failures.
- Normal/Hardcore/Accelerated/Custom selection, custom balance overrides, unified
  Tier-range simulation, forge Markov analysis, CSV export and shared status
  thresholds are phase-2/4 deliverables, **not available commands yet**.

## Dependency and focused-audit commands

```text
node scripts/module-map.js --out module-dependencies.json
node scripts/module-map.js --group player-and-monster-scaling
node scripts/module-map.js --group xp-and-progression
node scripts/module-map.js --group equipment-and-forging
node scripts/module-map.js --group gold-and-loot-economy
node scripts/module-map.js --group world-generation-and-difficulty
node scripts/module-map.js --focus src/economy/equipment.js
```

Use either --group or --focus; --out optionally exports that filtered view.
The full map includes source nodes, literal dependencies, HTML script order,
static cycles, relocation mapping and diagnostics. It never imports inspected
game modules, reads JSON stores, unlocks regions or starts the server. JSON import
targets are recorded as data edges without reading them. Lexical false positives
in comments/examples and unresolved dynamic plugin imports are documented;
inspect runtime hooks and globals manually. For small agent context, use a
filtered view instead of pasting the complete map.

## Adding balance parameters: required future workflow

There is no Registry API/type/schema to extend yet. The following worked migration
example is a **design checklist**, not runnable commands or implemented interfaces.
Use the existing settlement scaling coefficient (0.06) as a pilot:

1. Move the existing value from settlement-economy-config.js into the Registry's
   settlement domain, retaining 0.06 and the existing formula unchanged.
2. Define a strict typed settlement configuration with a numeric coefficient.
3. Validate finite, nonnegative bounded values and reject unknown keys; keep
   MAX_CURRENCY enforcement in safety-limits, not the balance schema.
4. Supply the existing value in immutable base defaults.
5. Resolve Base -> Ruleset -> server override -> validated effective config.
   All named presets initially inherit 0.06; no unapproved preset rebalance.
6. Pass the resolved settlement config explicitly into production cost calculation
   for **new** projects. Preserve legacy costs, existing price snapshots and
   donations. Classify this parameter as generation/project-initialization locked.
7. Test default equivalence, precedence, invalid values, safe integers and that
   already-snapshotted projects do not reprice after a config change.
8. Have the future simulator call that same production helper for new projects
   under each resolved configuration, recording seed/version/snapshot identity.
   Verify changed previews while existing persisted costs remain identical.

Do not add a knob to a registry unless gameplay and the simulator actually consume
the resolved value. Do not invent CLI flags for this workflow until implemented.
