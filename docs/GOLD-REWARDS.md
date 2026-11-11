# Monster gold reward policy

Gold rebalance is limited to monster reward calculation and its existing payout path. It does not change XP, HP/damage, combat, prices, selling, trading, Souls, region generation or saves. Restart the server to instantiate the new reward metadata; no reseed or migration is needed. Existing generated frontier maps use the new rewards when monsters are instantiated, regardless of generator version or when the region was saved. The seven founding regions keep legacy solo rewards.

## Exact formulas

`gold-rewards.js` is pure and owns the balance constants. For a generated frontier monster at authoritative server level L (integer 1..10000):

    normalAverage(L) = .065 * 100 * (1 + L/12)
    budget = normalAverage(L) * categoryMultiplier * (.8 + .4*U) * goldRate

U is one uniform draw in [0,1). Category multipliers are normal 1, Alpha 4, stone 8, regular boss 80, World Boss 240. Categories are exclusive: stone, World Boss, regular boss, Alpha, normal. Summoned enemies retain the gold policy of their type; this task does not alter summoned loot mechanics.

Boss multipliers deliberately exceed the initial 10-20/25-40 hypotheses. Testing 20/40 against the real inherited HP curves gave only about 21.6%/13.2% of normal gold/hour in the reference DPS model. The chosen 80/240 raises this to approximately 86.5%/79.3%, while staying fixed, linear and bounded. A level-10000 World Boss averages 1,301,560 base gold, versus about 64,549,722 before; it represents roughly 15.6 unchanged +0 weapon attempts after a modeled 26,563-second solo fight. No monster stats were adjusted to reach this result. Actual class/gear/skills and encounter uptime can change these estimates.

The 100 and 12 values are independent economic reference constants, not runtime imports from the forge. The simulator separately reads the actual unchanged `upCostFor` function to check the relationship. Normal kills per +0 weapon attempt stay about `1/.065 = 15.385` throughout the supported level range, before Gold Find/rates and integer rounding.

For founding regions, the old calculation is retained:

    raw = inclusiveIntegerRoll(monster.gb || template.gold)
          * (spawnLevel/baseLevel)^1.5
          * (Alpha ? 5 : 1)
          * goldRate
          * (stone ? 1.5 : 1)

Solo final rounding and personal Gold Find remain identical to the old formula for valid ordinary settings. Frontier rewards never reuse those old template ranges/multipliers or add the legacy stone multiplier, avoiding double multiplication. `monsters.js` sets `goldModel` to `frontier-linear-v1` with neutral `gm=1`, or `founding-legacy-v1` with the old gm. Untagged in-memory/plugin monsters fall back to the authoritative zone's generated flag; explicit model tags are respected. Plugins should use the shared gold module rather than assuming frontier gm/gb still encode a scaled reward. Unknown model versions and invalid source levels fail closed with zero gold.

## Payout and safety

The current team/ownership rules are preserved. `combat.js` still selects the current gold-sharing roster; no XP participation restrictions are imposed on gold. `loot.js` rolls one pool, removes duplicate recipient IDs, and splits the rounded integer pool evenly. Remainder units go in the existing killer-first order. This corrects the old small party-rounding inflation (and duplicate-recipient payouts); it can shift a share by a coin compared with independently rounding fractions.

Personal Gold Find is then applied only to that recipient's share:

    reward = round(share * max(0, 1 + GoldFindPercent/100))

The existing equipment/passive `goldFind` function is unchanged, with no new effective gear cap. Solo uses the unrounded budget until its final Gold Find rounding to preserve founding payouts exactly. All paid amounts are finite safe integers; arithmetic saturates at the existing per-wallet currency cap rather than overflowing. Invalid nonfinite rates/bonuses produce zero; the existing administrative gold-rate maximum remains 1000000 and zero rate grants no gold. Huge finite bonuses saturate safely. World Tier does not enter the reward formula or allocate work.

The killer receives the same owned ground drop, with existing protection and expiry. Allies receive direct credit; overflow remains an owned drop for the same ally. Balances, Souls, XP, item stats, consumables, loot quantities, respawn state and persisted region levels are never recalculated by this module.

## Files and verification

- `gold-rewards.js`: pure source/category/scaling/roll/allocation functions.
- `monsters.js`: gold metadata integration only.
- `loot.js`: use the shared gold payout and deduplicate recipients; other loot paths remain unchanged.
- `scripts/gold-balance.js`: before/after reference simulation using historical production monster data and the real current reward functions.
- `tests/gold-rewards.test.js`: ten regression groups including 10000-level monotonicity, categorical priority, founding parity, party conservation/ownership/overflow, Gold Find, rate/numeric extremes and unchanged saved player data.
- `docs/GOLD-BALANCE-REPORT.md`: generated tables covering every requested level/category, gold/hour, unchanged forge costs, founding regions, seeded World Tiers, Gold Find/rates and party distribution.
- `README.md`, this document: usage and rules.

Commands:

    node scripts/gold-balance.js --out docs/GOLD-BALANCE-REPORT.md
    node scripts/gold-balance.js --json gold-balance.json
    node --test tests/*.test.js

The report's OLD monster source is Git commit `9d3866c7f7405c0ef07657997913266becf16617`; the legacy reward path is locked against the original expression by regression tests. Missing historical source fails explicitly; use a full clone or `--baseline <commit>`. NEW averages use 8192 deterministic stratified samples per frontier case after actual integer rounding. OLD averages enumerate the inclusive template range. Kill times reuse actual spawner HP and production player damage/crit/haste formulas; the rare +0 weapon, passive allocation and category uptime assumptions are printed explicitly. It does not simulate gear selling, combat deaths or guardian gold as income.

The full project suite passed **99 tests** after this focused change, including all prior XP, inventory, world-generation and Atlas cases. No automatic test hooks were introduced.

## Remaining economic imbalances deliberately untouched

Founding rewards, particularly late founding zones, can exceed early frontier rewards. Since gold has no XP-like level-gap cutoff and Gold Find still applies, returning to old zones may remain efficient. Preserving early-game rewards and adopting the lower frontier cost reference cannot simultaneously eliminate that opportunity without an additional rule change.

Gold Find values can keep growing with equipment level; high gear bonuses may dominate a stable base drop. Gear selling/rarity progression, summoned guardian loot, shop/forge cost curves and other currencies are separate income/sink systems. Spirit Stone gold/hour relative to normal rises with level because its unchanged HP exponent is lower. Party gold has no new XP-like efficiency bonus, so gold/hour per member still reflects shared gold and existing party HP. These are documented findings, not hidden adjustments to the rest of the economy.
