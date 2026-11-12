# Spirit Stone farming rewards

The server policy and lifecycle permits live in `src/economy/stone-rewards.js`. Tuning values are centralized in `STONE_REWARDS` for a future Rulesets integration; there is no new framework or dependency.

| Enemy | XP | Gold | Additional loot |
|---|---:|---:|---|
| Ordinary nonsummoned enemies | Existing 100% | Existing 100% | Existing rules |
| Boss summons / other unapproved summons | 0% | 0% | None |
| Authorized Stone guardian | 30% of a normal monster | 30% of a normal monster | 25% normal equipment/consumable chances, at most one equipment item |
| Authorized Stone Alpha guardian | 50% of a normal monster | 50% of a normal monster | 40% normal equipment/consumable chances, at most one equipment item; 8% chance for one Soul |
| Spirit Stone completion | Full updated Stone budget | Twice the previous Stone budget | 3–6 Souls; 5 + floor(zoneIndex/2) equipment items, capped at 10; minimum Uncommon; existing four consumables |

Guardian percentages use the defeated entity's actual level and a **normal** category budget. Alpha guardian HP/damage remain Alpha-scaled, but their XP and gold do not receive an extra ordinary Alpha reward multiplier. Legacy Alpha gold scaling is removed from the reference before applying 50%. Gold variation and existing server gold rates, personal Gold Find and one shared party pool still apply. Guardian loot is not a guaranteed rare/Alpha drop table; rates affect the reduced ordinary drop chances.

The mature equal-level Stone XP budget is now 20% of the recipient's level requirement (previously 10%). The level-1 fraction is 45% (previously 35%), with the existing early taper. Level-gap penalties, recipient reference caps, party participation/allocation, Wisdom, XP rate, plugin bounds and the level-10000 XP stop remain unchanged. Normal, ordinary Alpha, boss and World Boss XP budgets are unchanged. Stone equipment has no guaranteed Rare/Epic/Legendary floor; more rolls and reliable Souls support farming without a guaranteed top-rarity payout.

## Bounded lifecycle rewards

The existing four health-triggered waves can authorize at most 12 normal guardians each and one Alpha at stages 3, 2 and 1: **48 normal permits + 3 Alpha permits per Stone life**. The actual spawn counts, stage transitions, difficulty, lifetime and global/per-map/per-source summon caps are untouched. Lower-zone Stones naturally produce fewer guardians. Slots are reserved at spawn; an expired, skipped, unloaded or unclaimed guardian does not refund its slot. Repeating an already used wave gives its summons no new reward permit.

Permits are server-private WeakMap entries, bound to the exact guardian, parent Stone and lifecycle. They cannot be fabricated by setting a serialized `summoned` or `summonKind` field. A kill consumes the guardian ticket once; loot has a separate one-use receipt so duplicate drop calls cannot repeat gold, Souls, equipment or consumable rolls. Boss summons never receive tickets. All summoned kills continue to skip unrestricted plugin `kill` rewards, including direct item grants; only the controlled guardian payout path is enabled.

Healing, leashing and participation resets do not reset the reward ledger. Normal Stone respawn starts a fresh lifecycle; old guardians cannot carry permits into it. Reserved guardians may still pay after their parent dies, provided the same parent life is still present. Stone completion itself also settles once per lifecycle.

For persisted encounter plans, the existing `stoneStep` field records the lowest used stage even if runtime healing/reset code raises the live stage. Completion stores spent stage 0; normal respawn restores stage 5. Checkpoint/reload therefore cannot reissue earlier waves. Parent entity identity checks invalidate permits after unloading. Player rewards and encounter checkpoints still use the existing coordinated world/character save journal, so persisted rewards include the already-burned stage. No inventory or save schema fields are added. Legacy v1 worlds retain their existing fresh monster population on server startup; this change does not introduce v1 encounter persistence.

## Files and limits

- `src/economy/stone-rewards.js`: tunable policy, stage reservation, one-use XP/loot authorization and respawn reset.
- `src/combat/summons.js`, `src/combat/combat.js`: source classification, wave authorization and reward settlement through existing participation.
- `src/progression/xp-economy.js`, `src/economy/gold-rewards.js`: shared Stone budgets and premodifier reward scaling; ordinary paths preserved.
- `src/economy/loot.js`: controlled reduced guardian loot and improved completion rewards.
- `src/combat/monsters.js`, `src/world/encounter-runtime.js`: normal respawn reset and existing stage checkpoint integration.

These are balance settings, not a measured XP/hour guarantee. Clear time depends on class, AoE, gear, risk and travel; no combat timings or benchmarks were executed. No tests were added/modified/run; no build, lint or verification commands were run.
