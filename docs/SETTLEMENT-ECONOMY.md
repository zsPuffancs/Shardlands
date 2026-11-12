# Tier-scaled settlement construction

Newly initialized generated settlements use:

```javascript
depth = Math.max(0, tier - startingTier);
multiplier = 1 + scalingCoefficient * depth ** scalingExponent;
cost = Math.round(baseCost * multiplier);
```

Tune `SETTLEMENT_ECONOMY` in `settlement-economy-config.js`: merchant 250,000 gold, smith 400,000, mystic 400,000; starting Tier 8, coefficient .06, exponent .7. The pure `constructionCostsForTier(tier, config)` accepts the same configuration shape for future Rulesets / Balance Registry integration. No framework, dependency or runtime ruleset registry is added. Restart after changing the module; new settings apply only to settlements initialized afterward.

The inputs are the settlement's own World Tier and configuration, never the visiting player or the currently unlocked maximum tier. Both encampments and unstaffed villages use the same system. Founding settlement prices retain their historical fixed values. Shared geometry and NPC placement are unchanged.

## Persistent prices and compatibility

Each settlement stores `constructionCosts: { merchant, smith, mystic }` and `constructionEconomyVersion` before its first save. Generated settlements use policy version 1; legacy/founding snapshots use version 0. Every existing saved settlement without a snapshot receives the **historical fixed prices**, including projects with no donations yet. The migration does not modify built stalls, donor amounts, contribution times, deeds or Chronicle history. It is persisted and idempotent. Missing snapshots in subsequently accessed legacy records receive the same fallback.

`LEGACY_CONSTRUCTION_COSTS` is immutable historical migration data: do not tune it. Change `SETTLEMENT_ECONOMY.baseCosts` for future settlements instead. Once a snapshot exists, it is read and validated rather than recomputed. This also preserves any future ruleset's already stored costs. Invalid saved snapshots are reported instead of silently replaced with higher remaining requirements.

The server sends the snapshot through the existing `world.settlement.cost` field. The construction board already displays that field, so no second client pricing formula is introduced. The server also charges against the same snapshot. `Settlement.STALL_COST` remains a deprecated legacy compatibility export, not the source of live prices.

Donation behavior is unchanged: players can contribute partially, a contribution cannot exceed the remaining cost or wallet balance, the largest donor receives the deed, ties use contribution timestamps, and stall completion unlocks its NPC and records the existing Chronicle events. Recovered wallet/world checkpoints retain the price snapshot along with existing project state.

## Numeric limits and verification

World Tiers must be positive safe integers. Base prices must be positive safe integers; starting Tier is a positive safe integer; coefficient and exponent must be finite and nonnegative. Growth overflow saturates to `MAX_CURRENCY` before multiplying. Rounded prices remain positive safe integers up to that currency limit. Donation totals use bounded accumulation; malformed legacy donor balances are preserved without taking further gold against them.

No tests were added or run for this change. Verification was limited to source review, JavaScript syntax and whitespace checks.
