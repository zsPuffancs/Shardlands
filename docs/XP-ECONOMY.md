# XP Economy 2.0 and party progression

The original Economy 2.0 update changed XP rewards and party combat scaling. The subsequent [XP Penalty 2.0 and progression-generation update](XP-PROGRESSION.md) adds versioned frontier level distributions and Atlas coverage diagnostics. It requires a server restart, not a reseed or save reset. The existing region-level chain fix in commit `581d7ed` is retained unchanged.

## Confirmed problems

- Old generated normal XP grew as level squared while level requirements grow as `floor(55 * level^1.85)`. The ratio therefore inflated as level^.15. Stones additionally doubled their scaled template XP; boss and stone template budgets could exceed a whole level at equal level.
- With gear, Wisdom and server rates stacked, one kill could fund many level-ups. Equipment bonuses were uncapped, and cancelled/negative plugin rewards could become +1 through `Math.max(1, ...)`.
- Old party HP **and damage** grew as `1.5^(N-1)`, while the XP pool grew by only 15% per member. Five equal-DPS members each earned about 31.6% of solo XP/hour before survival/travel effects.
- Party HP was repeatedly multiplied when a larger team hit the monster. This rescaled remaining health during combat and coupled damage inflation to HP inflation. Nearby nonparticipants could receive XP, and summoned enemies could be farmed for XP.
- Overlevel eligibility already existed at a 13-level gap and was preserved. There was no equivalent carry protection for extremely underleveled heroes. The level-up loop itself did not stop at level 10000.

## Production modules and exact files

| File | Responsibility |
|---|---|
| `xp-economy.js` | Pure reward, category, level-gap, bonus, cap and party-allocation functions; all balance constants |
| `encounter-participation.js` | Fixed roster, bounded contribution records, session identity and one-time pristine HP scaling |
| `combat.js` | Effective damage participation, category/share calculation, exactly-once death rewards, separate party damage multiplier |
| `characters.js` | Existing level-requirement export, post-bonus plugin hook, safe XP credit, preserved pending XP and maximum level |
| `monsters.js` | Centralized base XP metadata and encounter-state reset on respawn; ordinary HP/damage formulas unchanged |
| `teams.js` | Shared balance constants, linear HP compatibility accessor and versioned scaling metadata |
| `simulation.js` | Independent party damage scale for normal attacks/stone pulses and clearing participation after normal recovery |
| `encounter-runtime.js` | Save/restore independent party damage scale alongside the existing HP multiplier/fraction |
| `summons.js` | Summoned monsters explicitly advertise zero XP and are also excluded by the reward-category policy |
| `tests/xp-region-levels.test.js` | Existing cutoff/drop/region tests extended to use real participation and the new production rewards |
| `tests/xp-economy.test.js` | XP, participation, scaling, reconnect, plugin, numerical and save-state regression cases |
| `scripts/xp-balance.js` | Actual historical-production BEFORE runner and current-production AFTER simulator |
| `docs/XP-BALANCE-REPORT.md` | Generated before/after tables and measured simulation results |
| `README.md`, this document | Public rule documentation and explicit compatibility/authority boundaries |

No changes to item stat definitions, character visuals, map generation or normal HUD rendering are required. The pre-existing team-panel hint still describes the old exponential formula; its text is intentionally not edited under this task's explicit HUD boundary. The server now sends `scalingModel: linear-v2`, `hpPerMember` and `damagePerMember` for a future hint-only update. Raw XP Bonus equipment stats may also remain visible unchanged; their effective diminishing return is specified below.

## Base rewards and relative levels

The level requirement remains exactly `Q(L) = floor(55 * L^1.85)`. World Tier never appears in a reward formula.

| Category | Equal-level budget, level 10+ | Level-1 fraction before bonuses |
|---|---:|---:|
| Normal | 2.5% of Q | 20% |
| Alpha | 7.5% | 30% |
| Spirit Stone | 20% | 45% |
| Regular boss | 15% | 45% |
| World Boss | 25% | 60% |
| Boss/unauthorized summon | 0 | 0 |
| Authorized Stone guardian | 30% of normal | 30% of normal |
| Authorized Stone Alpha guardian | 50% of normal | 50% of normal |
| Future anomaly | 10% | 25% |

The early fraction blends continuously toward the standard fraction with `t=max(0,1-(L-1)/9)` and `fraction=standard+(early-standard)*t^2`. This keeps the first few levels brisk without making early special enemies less rewarding than ordinary ones. Summoned defaults to zero; only a valid lifecycle permit lets combat use the normal category at 30%/50% for Stone guardians. An anomaly flag has its own budget, followed by stone, World Boss, boss, Alpha and normal. Existing custom `template.xp` values no longer set combat rewards; plugins should use the documented XP hook. See [Spirit Stone reward bounds](STONE-REWARDS.md) for the later Stone farming rebalance; older generated reports predate that policy.

Let `gap=playerLevel-monsterLevel`. All categories, including bosses and stones, share these rules:

- `gap >= 25`: zero XP, unchanged loot/gold eligibility.
- Through +5: full factor. Smoothstep interpolation through `(5,1), (6,.95), (10,.65), (15,.30), (20,.10), (25,0)`.
- Stronger monsters: full gap factor through +10 enemy advantage, then smoothstep anchors `(15,.90), (25,.55), (40,.22), (60,.02)`. Beyond 60, `.02/(1+((advantage-60)/10)^2)` tends to zero.

To prevent importing a high-level monster's entire budget, the reward reference level is `min(monsterLevel, playerLevel+5)`. Before relative scaling it is also capped to `1.5*Q(playerLevel)` times the reference category fraction. Near-level higher content can be rewarding; extreme carries quickly approach zero. No minimum +1 is forced after rounding, so sufficiently tiny rewards really become zero. The exact 24/25 boundary, interpolation continuity and both sides of the full-reward windows are tested. See [the progression report](XP-PROGRESSION-REPORT.md) for the before/after comparison against the original 13-level penalty.

## Party difficulty and allocation

A shared encounter captures at most five living, online teammates within the existing 1000-unit sharing radius on the same map when the first real damage lands. Sharing disabled captures only the initial attacker. Other players can damage the monster but cannot acquire or transfer the existing XP claim through last hits, invitations, toggles or reconnects.

Only an originally captured participant with at least 1% of maximum HP in effective, non-overkill damage, a hit in the preceding 45 seconds, and a living, online, nearby session at death can receive XP. Level eligibility is then evaluated individually. An overleveled last hitter cannot steal an eligible participant's share. Idle and ineligible members do not consume shares or generate a party XP bonus. There are no shared-healing skills in the current system; this first participation policy credits damage only.

Leaving/disbanding does not erase a captured contributor's valid claim, but does not transfer it to new teammates either. The entire claim can expire after 45 seconds with no original contribution; the next attacker may then establish a new roster. This does not heal or resize a wounded monster. Session tokens prevent a new connection/player object from inheriting old contribution, and retained fight records contain only IDs, tokens and numbers, not disconnected connection objects.

A pristine encounter is scaled once before its first damage:

    H(N) = 1 + .45*(N-1)
    damageScale(N) = 1 + .08*(N-1)

HP is never repeatedly multiplied on subsequent hits. Wounded/restored encounters keep their current and maximum HP. The established scalar is retained until normal full recovery/respawn. Player damage and solo monster-stat formulas are unchanged. Ordinary attacks, boss specials and stone pulses use the independent damage scalar.

For `E` XP-eligible contributors and paid HP multiplier `P`:

    pool = min(H(E), P) * (1 + .05*(E-1))
    allocation = pool / E
    memberBaseXP = relativeSoloReward * allocation

Clamping to the HP multiplier actually paid prevents a wounded solo encounter from producing a free five-player HP-scaled reward pool after unload or claim expiration. A five-person roster with only one actual contributor gets solo XP against the already-established higher HP; idling is not a bonus.

For equal-level/equal-DPS members all participating, XP/hour per member relative to solo becomes `pool/H(N) = 1+.05*(N-1)`, before discrete rounding and non-XP gameplay effects. Two through five players therefore target 105%, 110%, 115% and 120% of solo efficiency. This is a reference-DPS result, not a guarantee for groups with idle members, different builds, deaths or travel.

Gold and drops intentionally retain existing killer/current-team sharing rules. A gold recipient may therefore differ from an XP recipient. There is one death settlement and recursive damage/XP hook guards, so membership manipulation or recursive callbacks cannot award the same kill twice.

## Bonus pipeline and plugin authority

1. Category/level-relative reward.
2. Eligible-party allocation.
3. Gear multiplier `1 + bonus/(100+bonus)` for nonnegative finite XP Bonus percentages (approaches 2x; 100 displayed bonus gives 1.5x).
4. Wisdom Scroll 1.5x, with its existing duration/stacking rules.
5. Server XP rate, bounded by the existing 1000000 administrative maximum.
6. The existing `xp` plugin hook receives this boosted amount and a `source` of `combat` or `direct`.
7. Final combat safety checks, rounding and safe credit.

A combat hook may cancel an award with zero or reduce it; increases are bounded to 2x the post-bonus amount. Nonfinite/negative awards become zero. A final encounter limit of `floor(.75*Q(playerLevel)*allocation)` applies after all adjustments. Applying the same allocation to the cap prevents capped server rates from accidentally favoring larger parties. The solo cap is at most 75% of a level; a legitimate new reward cannot itself create multiple level-ups. Existing accumulated XP can still fund multiple queued levels, and remains untouched.

`giveXp` / direct `gainXp` calls remain trusted in-process administrative grants, capped by safe integer credit and maximum character level rather than the per-encounter budget. They do not automatically receive the combat server rate. Plugin code can already mutate players/configuration directly, so this is not a sandbox against malicious plugins. A plugin that deliberately grants extra XP from its kill hook is explicitly outside the combat budget. Bundled plugins have no conflicting XP hook. Third-party plugins must adapt to the hook's new post-bonus order and should not rely on legacy template XP numbers. No saved equipment is rewritten.

At level 10000, new XP grants stop and level processing cannot advance further. Any previously saved XP, skill points or equipment remain stored. The global/per-player level-processing batch limits are unchanged, so administrative grants cannot create an unbounded synchronous level-up loop. Existing saved balances are not retroactively recalculated.

## Simulation and verification

Run the developer report without npm or extra dependencies:

    node scripts/xp-balance.js --out docs/XP-BALANCE-REPORT.md

Optional complete machine-readable rows:

    node scripts/xp-balance.js --json xp-balance.json

BEFORE executes historical `monsters.js`, `combat.js` and `characters.js` loaded from the specified Git commit, default `f374228585ae6b3d9e973389a2c0eab9410e80f3`. It does not silently replace missing historical code with an approximation: shallow clones need the baseline commit available or `--baseline <commit>`. AFTER calls the real production reward functions and real monster spawner. The regression suite compares live combat rewards to those functions across categories, party sizes, gear/Wisdom combinations and server rates.

The report covers 38,620 scenarios: all requested character levels and World Tiers; normal/Alpha/stone/boss/World Boss/summoned/anomaly categories; solo and groups 2-5; gear bonuses 0/100/1000; Wisdom off/on; rates 1/2/10 and an extreme 1000000 case; both overlevel cutoff sides, underlevel windows, mixed-DPS groups, disabled sharing, powerleveling and current seeded 20-45-level region chains. Region samples use minimum/midpoint/maximum levels, with 9999 included next to the 10000 ceiling. No saved regions are regenerated or rewritten.

Reference DPS uses the actual archer player damage, crit, passive, gear range and attack-delay formulas. Assumptions (rare +0 level-appropriate weapon, allocated DPS passives, category-specific active uptime and no skills/AoE/travel/deaths) are printed in the report. Below 60, a founding-zone family/boss/stone appropriate to the level is chosen; 60+ reference rows use generated-region normalization. Equal-level bosses at very low levels are mathematical scenarios, not a claim that those bosses naturally spawn at that level. World Tier scenarios select the corresponding founding/generated normalization explicitly.

Level-up counts are the eventual levels fundable from that award starting with zero pending XP, not all level-up events in one server tick. The old extreme diagnostic combines deliberately huge gear/rates; it is not a default-server example.

Selected measured default-rate results at level 9999:

| Encounter | Before fraction | After fraction |
|---|---:|---:|
| Normal | 6.881% | 2.5% |
| Spirit Stone | 207.729% | 10% |
| World Boss | 241.273% | 25% |

Five equal-DPS players improve from about 31.6% to 120% of solo per-member XP/hour. Across the full scenario grid, old multi-level reward spikes occur in 12,501 cases; the new policy has none from zero pending XP. The maximum new combat award in the stress grid is 1,035,961,472 XP, below safe integer limits. The complete project suite has **89 passing tests**, including the prior geography/Atlas/region-chain tests. No automatic test hooks were installed.

## Remaining limitations

- Constant fractional XP budgets stabilize kills-per-level, not real time-to-level. The inherited high-level boss HP curve produces long fights and low XP/hour in this reference model; one level-9999 World Boss takes roughly 26,561 seconds under its stated assumptions. Boss loot/progression value is separate. A live boss-duration/combat-content pass needs actual telemetry and separately scoped changes rather than hiding this by inflating XP again.
- Support/healing contributions would need an explicit participation model when shared healing/tanking systems are introduced.
- Very strong mentors can still accelerate appropriately leveled content if the learner contributes meaningfully; this is intentional, not a promise to eliminate every carry.
- Participation is in-memory. After a server restart or lazy unload, a wounded encounter's health/damage state is preserved but its roster is established anew; the paid-HP reward cap prevents a larger unpaid pool. Fully crash-atomic kill/XP/drop persistence remains a separate storage concern.
- The maximum character level remains 10000 while World Tier can advance independently. High-tier region ranges can therefore sit at [10000,10000], and capped characters receive no additional XP. No prestige/endgame leveling system was invented.
- The unchanged HUD's old team rule hint requires a later text update before presenting these formulas in-game. The exact current policy is documented here and the new metadata is already sent server-side.
