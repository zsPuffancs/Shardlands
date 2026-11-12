# Inventory QoL 2.0

The equipment bag remains 90 items with 30-slot pages and a separate consumables tab. Search, filters and sorting are display-only and never reorder the server bag or alter item data. This change is independent of the separately implemented monster-gold rebalance; no additional progression/economy changes are made by the inventory tools.

## Player use

Open Inventory with the existing binding (I by default). Use the search box, the expandable **Filters** section and the **Sort** dropdown above the bag. Search covers all pages, not only the visible grid. Matching is case-insensitive and accent-insensitive, supports multiple search words, and considers raw/localized item names, equipment slot/family, rarity, affix labels and available stat labels/values.

Rarity and equipment-slot checkboxes allow multiple selections. Values in one category use OR; different categories and search use AND. Item-level bounds are optional positive safe integers; invalid or reversed bounds produce a localized error instead of silently inventing a bound. Status options are All, Locked, Unlocked, Upgraded and Has affixes. **Reset all** clears search/filters and restores original bag order. **Clear search** only clears the query.

Sorting offers original order, rarity high/low, item level high/low, equipment type and name A-Z/Z-A. Ties preserve original authoritative bag order. Equipment types are populated from the actual server-provided slots. There are no fabricated acquisition timestamps: Newest/Oldest were intentionally not added. The sort preference is saved locally; query/filters remain in memory across page/window switches. Consumables and equipped gear are excluded from this pipeline.

The full processing order is **Bag → Search/filter → Stable sort → Pagination → Render**. Active filters reduce the available equipment pages; the current page is clamped. With no filter, the original three equipment tabs remain. Matching counts such as `Showing 12 of 73 items` are separate from the unchanged occupied-capacity indicator `73 / 90`. Empty grid cells follow the displayed results. Filtering/sorting makes no network requests and refreshes only the relevant bag grid/controls.

## Item actions and destruction

Existing left-click Equip, Ctrl+click Lock, merge selection and Merchant Shift/right-click Sell are preserved. Every displayed item continues to carry its stable UID. The new **⋯** button opens item actions anywhere, including while the Merchant is open. Outside the Merchant, right-click also opens this menu. A keyboard-focused item supports Enter/Space for its normal action and Shift+F10/ContextMenu for the action menu. Escape closes the menu and restores focus.

Select **Destroy item** to request an authoritative preview. A native in-game modal displays the actual item name, rarity, item level and upgrade, plus the permanent-deletion/no-reward warning. Cancel has initial focus. Legendary/Mythic items additionally require checking the acknowledgement and typing the localized confirmation word (`DESTROY` / `TÖRLÉS`). Keyboard events in inventory controls/modal do not activate movement/combat hotkeys. Confirmation disables further submits while awaiting the result.

The server protocol is deliberately two-step:

1. `prepareDestroy { uid }` runs through authenticated player-session dispatch and existing action throttling. The server finds the item only in that player's bag, verifies protection rules and returns a fresh random token, 30-second expiry and its own `itemView`.
2. `destroy { uid, token, deliberate }` consumes that pending token, verifies ownership/protection/current state again and removes exactly that item. The server ignores client-supplied rarity, stats, player ID or index.

Only one pending confirmation is retained per hero in a WeakMap. UID strings are validated without coercing arbitrary values. Equipped, locked, missing, ambiguous duplicate-UID, dead-player and trade/forge-reserved cases fail with explicit feedback. An object-identity and SHA-256 item-state check rejects an item replaced, upgraded, rerolled, relocked or otherwise changed since the preview. A token cannot be reused or used for another item/player. Trade reservations are read from the authoritative team's current offer and rechecked at confirmation. Legendary/Mythic requirements use the server item's current rarity.

Deletion grants no gold, Souls, XP, materials or loot and invokes no reward-bearing game hook. It updates the player's bag, updates the existing cached save record through `savePlayer`, sends inventory state through the normal delta transport and returns explicit localized success/failure. Normal existing autosave (10 seconds), logout and orderly-shutdown persistence remain in use; this is not a new crash-atomic storage system. Do not claim durability across a process crash before the normal save completes.

Inventory updates clear disappeared UIDs from merge/mythic selections and smith/mystic references, hide stale tooltips, and close an item menu/confirmation when its target disappears or changes. Sorting/filtering never selects an operation by visual index.

## Files

| File | Change |
|---|---|
| `public/bag-view.js` | Pure browser/Node reusable search, combined filters, stable sorting and pagination |
| `public/inventory-qol.js` | Bag view integration, local preference, menu/modal, input/focus handling and stale-reference cleanup |
| `public/index.html`, `public/ui.css` | Compact controls, item menu and native confirmation modal in the existing style |
| `public/game.js` | Dispatch new destroy preview/result messages to the inventory UI |
| `public/locales/hu.js` | Hungarian translations; English uses existing inline fallback convention |
| `src/economy/inventory.js` | Authoritative prepare/confirm/destruction and protection checks |
| `src/player/player-session.js` | Authenticated/throttled destruction message handlers |
| `src/multiplayer/teams.js` | Read-only item-reservation query; existing trading semantics preserved |
| `server.js` | Wire trade reservation and normal cached-save callback into inventory |
| `tests/inventory-qol.test.js` | Pure view, server authorization, safety, persistence and UID interaction regression cases |
| `tests/inventory-qol-client.test.js` | Client render/event integration with offline DOM fixtures; localization coverage |

No heavy dependency, new framework, capacity migration or server-side display sorting was added. The pure view is bounded by 90 items (`O(n log n)` sorting) and retains references to the single current authoritative snapshot rather than caching another inventory.

## Verification

    node --test tests/inventory-qol.test.js tests/inventory-qol-client.test.js
    node --test tests/*.test.js

The combined project suite has **114 passing tests**, including the ten gold-rebalance groups and all previous XP/geography/network tests. Inventory-specific cases cover all-page/case-insensitive search, multi-category filters, invalid numeric bounds, stable ordering, original-order restoration, pagination, UID preservation, server-challenged deletion, high-rarity safeguards, stale/expired/replayed tokens, locked/equipped/reserved/foreign items, spoofed attributes, unchanged currencies, save/reload, lock/equip/merge/sell/trade regression behavior, modal/input state and stale client references.

Client tests execute the actual inventory integration script against offline DOM fixtures and assert local filtering emits no packets. These are functional logic checks, not screenshots or a completed browser visual check. Native layout, focus across browser versions and screen-size ergonomics still deserve a manual gameplay pass. The earlier browser origin-approval denial was not bypassed or retried through another browser surface.

This version has single-item destruction only. No bulk deletion, automatic destruction, acquisition-date invention, item-price changes or unrelated HUD redesign is included.
