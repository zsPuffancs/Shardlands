# Typed domain and reusable component audit

Continue from local modernization work, not merely origin/develop. Initial
relocation commit: 142ecac. This plan deliberately separates identical arithmetic
from intentionally different gameplay policies.
The P1 health/presentation and category/template work, plus P2 World Boss identity/
progression helpers, are now implemented and regression-tested. P3 remains a
roadmap; this work does not claim to have converted the whole client/server to TS.
The stabilization pass also migrated forge math and its client-init contract to TS,
and connected per-instance forge/Wisdom/gold/loot/recovery/depth policies. Full
equipment stat contexts, status controllers and general snapshot types remain next.

| Priority | Exact implementations | Duplication / proposed change |
|---|---|---|
| P1 | public/ui.js:setBar and target rendering; public/game.js:label; public/ui.js:teamWindow | Repeated HP/mana/XP percentage, width caching and fill/text updates. Introduce one typed normalization and DOM presenter; retain markup/CSS, rounding steps and existing CSS transitions. |
| P1 | src/combat/combat.js:hitMob/hurtPlayer/skill; src/combat/simulation.js:updatePlayers/updateMonsters/updateSpiritStone | Repeated subtraction and `min(max,current+amount)` restoration. Extract pure arithmetic; retain defense, damage modifiers, eligibility, events and death transitions at call sites. Never use presentation clamping to change authoritative damage/overkill. |
| P1 | src/combat/monsters.js:spawnMob/markWorldBoss; src/world/regions.js:openRegion; src/progression/xp-economy.js:encounterCategory | Repeated category ordering and World Boss template/radius specialization. Typed category union and pure template/identity helpers; explicitly keep spawn category distinct from summoned/anomaly reward category. |
| P2 | src/world/universe.js:generateRegionLegacy/generateRegion/createUniverse.regionFor/fire | Centralize World Boss identity construction/progression predicate without moving RNG draws or changing proper names, identifiers, serialized shape or legacy migration. |
| P2 | src/economy/inventory.js:tryUpgrade and src/balance/simulation/forge.js | Shared production forge transition already extracted into public/forge-math.js; Markov model reuses it. Keep RNG, charging and job lifecycle in inventory. |
| P2 | src/economy/equipment.js:rollRarity and src/economy/loot.js:dropLoot | Production weights/drop specification already shared with simulator; retain server ownership, permit checks and per-member payout order. |
| P3 | public/auto-affix-ui.js, public/inventory-qol.js, public/ui.js | Equipment cell/tooltip/progress patterns deserve a separate scoped migration after health presentation is verified. Preserve UID-based selection/focus and localization; avoid a new UI framework. |
| P3 | src/player/characters.js, src/combat/enemy-scaling.js, src/world/game-world.js, src/combat/monsters.js | Deferred circular reference-hero dependency. Extract typed stat/gear contracts before moving formulas; do not replace lazy references with eager construction. |
| P3 | public/game.js status/floating text, public/adventure-ui.js notifications | Review reusable icon/timer/notification composition after resource presenters. Do not merge lifetime/ownership policies merely because markup resembles another component. |

## Domain model and design choices

Use discriminated category unions and structural contracts for existing entity
records; do not turn JSON saves into class instances. Pure functions handle
identical resource arithmetic, category classification and descriptor factories.
Keep skills, combat, inventory, rewards and world progression as composed services.
The reusable ResourceBar class encapsulates DOM update caching; variants are
configuration, not five copies or a subclass per color.

No abstract entity hierarchy is justified for player vs monster death, damage
reduction or reward eligibility: these rules differ. Prefer explicit functions
and composed services. Enable noImplicitOverride for future genuine subclasses;
do not introduce inheritance only to satisfy a stylistic target.

## Validation checkpoints

1. Finish Registry/simulator verification and document existing full-suite failures.
2. Implement typed shared health arithmetic and resource presentation; verify
   server/browser exports, round/clamp behavior, update caching, accessibility,
   before/after valid-state arithmetic and unchanged combat tests.
3. Integrate category and World Boss identity/template helpers; test exact property
   preservation, once-only radius scaling, versioned generation and progression
   predicates. Re-run deterministic/save/startup regressions.
4. Update AGENTS, module groups, architecture, TypeScript roadmap and exact commands.
5. Full suite, strict checking, clean build, shared-client artifact check, simulation
   exports. Distinguish baseline failures from introduced regressions.

No HP/damage/XP/economy coefficients, UI styles, save schemas, seed algorithms,
plugin APIs or unrelated entity behavior may change in this refactor.
