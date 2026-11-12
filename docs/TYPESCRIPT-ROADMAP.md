# Incremental TypeScript and reusable domains

Implemented strict TS (including noImplicitOverride/noUncheckedIndexedAccess):

- src/balance/typed/types.ts: Ruleset, resolution, rates, settlement and generation contracts.
- src/balance/typed/base.ts and registry.ts: immutable defaults and strict runtime resolution.
- src/shared/typed/resources.ts: pure restoration/subtraction, display normalization,
  ResourceBar DOM caching/accessibility and WeakMap-based presenter composition.
- src/shared/typed/entities.ts: category union, discriminated encounter descriptor,
  World Boss identity/template/idempotent radius specialization and progression predicate.
- src/shared/typed/forge.ts: canonical ForgeItem/ForgePolicy arithmetic and additive
  ForgeClientConfig network boundary, used by server and generated browser module.

Use `npm run build` to emit CommonJS/declarations next to each typed/ directory in
generated/. Commit those artifacts so existing `node server.js` and launchers work
without TypeScript installed. public/resource-bars.js and public/forge-math.js are
generated from shared resource/forge outputs, with dependency-free UMD wrappers. `npm run check:shared-ui`
detects drift. Never edit emitted JS by hand. `npm run typecheck` checks both TS
projects; the rest of the browser is still JavaScript, not silently typechecked.

Pure functions implement genuinely identical arithmetic; factory/services compose
different gameplay policies. ResourceBar is a class because it owns DOM write
caches. Player/monster death, defense and reward policies remain separate, because
they differ. No inheritance hierarchy is justified yet; future actual subclasses
must use override where applicable. JSON saves remain plain records.

Next migrations, each requiring regression fixtures and focused verification:

1. Typed snapshot/player/monster/equipment structural contracts around existing
   service boundaries, then extract the deferred reference-hero cycle.
2. Extend the implemented per-instance forge/Wisdom/frontier-gold/gear-chance/
   recovery-hit/monster-depth contexts to equipment stat/affix/tooltips and full
   XP/category/phase policies. Partition reference-power caches by policy before
   exposing stat coefficients; reject knobs until all consumers use them.
3. Inventory cells and tooltip controllers with UID/focus ownership, not generic
   HTML template replacements. Preserve current localization/visual appearance.
4. Status effects, damage-number lifetime and notifications through composed
   controllers; do not unify intentionally different timing/ownership rules.

No full-client conversion, framework dependency, seed/version migration, balance
rebalance or class-instance persistence is authorized merely by this roadmap.
