# Auto Affix Roller 2.0

Start the server normally, visit the **Soul Mystic → Affix**, select a weapon, ring or amulet and choose **Auto Affix**. The separate draggable window supports item selection, target affix, a one-decimal minimum, maximum attempts and maximum Souls spending. English and Hungarian are supported. The window uses existing item tooltips and window positioning/resizing conventions.

Start is enabled after the server validates the selected item and sends its actual ranges/cost. The server checks ownership, unique UID, item reference, inventory location, region, life, Mystic range, reservations and available Souls before each attempt. Locked items remain eligible, matching manual Mystic behavior. Target fields are disabled during a run. Stop or closing the window cancels; Escape closes the top window. A Stop bypasses action throttling, but repeated cancellation of an inactive job generates no extra packets.

## Existing formulas and estimates

Roll values and costs are unchanged:

- Lifesteal base: `0.5 + 0.03 * itemLevel`.
- Critical Damage base: `5 + 0.5 * itemLevel`.
- Attack Speed base: `2 + 0.08 * itemLevel`.
- Rarity factor: `0.6 + 0.4 * rarityMultiplier`.
- Value: `Math.round(base * rarityFactor * (0.85 + U * (1.15 - 0.85)) * 10) / 10`, where `U` is the existing independent `Math.random()` draw in `[0,1)`.
- Souls per attempt by rarity: `2, 2, 3, 5, 8, 15`.

`equipment.affixRange` is the authoritative range descriptor. `public/affix-math.js` supplies the exact rounding operation to both production rolls and previews. The estimator inverts that monotone rounded function by bounded bisection, accounting for one-decimal and floating-point boundary behavior; it never consumes randomness. Probability assumes independent uniform draws, with numerical precision limited by JavaScript doubles. It does not predict future rolls.

For one-roll probability `p` and `N = min(maxAttempts, floor(min(maxSouls, currentSouls) / cost))`:

- Success within limits: `1 - (1-p)^N`, evaluated as `-expm1(N * log1p(-p))` with explicit zero/one cases.
- Unlimited expected attempts: `1/p` and Souls: `cost/p`, undefined for `p=0`.
- Expected attempts consumed within limits: `[1-(1-p)^N]/p`; for `p=0`, `N`.
- Expected Souls consumed within limits: `cost * expectedLimitedAttempts`.

These are expectations, not promised attempt counts. An already-sufficient current affix returns success with zero attempts and zero spending even if the current Souls balance is zero or the existing value exceeds the new-roll maximum. An otherwise impossible target cannot start. Min/max values shown are rounded production values.

## Jobs, safeguards and persistence

One job per player, maximum **100,000 attempts**, **1,000,000 Souls budget**, and **1,000,000 target value**. Attempt/budget limits require safe integers; minimum accepts exactly one decimal. These are technical input limits, not changes to crafting costs or stat ranges.

The existing 50ms simulation calls `inventory.processJobs()`. Auto Affix gets a separate allowance of at most **50 attempts per tick globally**, **10 per player per visit**, and **100 jobs visited per tick**. Unfinished jobs rotate to the queue tail. Forge jobs retain their independent limits. Progress and inventory messages are batched at most once per 250ms per running job; starts and final results publish immediately. No per-roll timers or full inventory messages are created.

Every attempt uses the original `applyAffix`, replacing the prefix and affix while preserving UID, upgrades, stats, passives and unrelated metadata. A failed/invalid roll restores the pre-attempt item and Souls; earlier valid attempts remain charged. Success stops immediately before another roll. The actual final roll remains on the item; the best target value observed during this run is informational and is never restored. If an already-sufficient item needs no rolls, best observed during the run is empty.

The active UID is reserved against equip/unequip (including replacing occupied equipment), lock changes, manual affix/reroll, upgrades, selling, destruction, merges and trade offers/execution. Bulk selling/merging skips it. Starting is rejected if a trade offer or automatic forge already reserves the item. Operations on other items remain available and can change the shared Souls balance; the next attempt rechecks it. Externally changed/replaced/removed items cancel safely.

Jobs end on death, disconnect, travel, leaving Mystic range, invalidation, requested limits, internal roll error, Stop or server shutdown. Batched completed mutations and Souls update the existing player-save cache together. Disconnect cancels before saving; graceful shutdown cancels before closing transport and flushing saves. The existing periodic durable save policy remains unchanged: a hard crash may lose work since the latest durable save, consistently with other crafting operations. Jobs and result history are transient and never serialized/resumed. Existing saves and item formats require no migration.

## Protocol and validation

Authenticated message: `{t:'autoAffix', op:'inspect'|'start'|'stop'|'status', ...}`. Inspect requires `uid,key`; start also requires numeric `minimum,maxAttempts,maxSouls`. Server replies `autoAffixPreview` with authoritative item/ranges/cost/limits, or `autoAffixStatus` with an error code or authoritative job counters/current value/best/status/reason. Client-side estimates never update run counters. Completed status explicitly distinguishes success, exhausted attempts/budget, insufficient Souls, stopped, invalid item, range loss, disconnection, cancellation and error.

Run all tests on explicit request with `node --test tests/*.test.js`. Focused tests cover production rounding, estimates, strict validation, all stopping paths, rollback, fair scheduling, packet batching, actual inventory/trade/forge/session integration, save compatibility, graceful shutdown ordering, localized feedback and offline client interactions. Browser visual verification remains a separate manual check.

Implementation validation: **133 tests passed**, including **19 Auto Affix tests**, after integrating develop through `1a6be1e`. Existing forge, inventory, trade, XP, gold, snapshots and world-generation regressions passed. No new dependencies or automatic test hooks were introduced.
