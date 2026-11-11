# UI/UX audit (November 2026)

Checked against the "UI/UX Improvement Audit" brief on the `develop` branch. Status before this
change, and what was done. New client code is in `public/ux.js`; it wraps `openWin` and
`onUniverse` from `ui.js` instead of rewriting them.

| # | Item | Before | Now |
|---|---|---|---|
| 1 | Escape | Esc closed everything and **opened Settings** | Closes the topmost thing only: confirmation → team/trade prompt → tutorial → map legend → tooltip → topmost window. Opens nothing. Settings: O or ⚙ |
| 2 | Item tooltips | Comparison always shown; Shift showed stat ranges; tooltip could overlap the cursor at the right edge | Short tooltip with a one-line verdict ("▲ 3 better ▼ 1 worse than equipped"). Shift shows per-stat changes and possible values. Tooltip flips left near the right edge and never leaves the screen |
| 3 | Responsive | At 1024×600 windows ran off the bottom and under the action bar; at 1920×1080 they covered the player frame | Windows open below the player frame, end above the action bar (or move up), and scroll inside. HUD pieces shrink to 85% below 1100 px wide or 700 px tall. Windows sit above the action bar |
| 4 | Onboarding | None | 8-step tutorial on first entry (move, fight, inventory, skills, merging, souls, World Tiers/portal, teams). Skip or finish remembers it in this browser; Settings → "Show the tutorial again" |
| 5 | Combat readability | Numbers overlapped; crits only bigger/yellow | ✦ and ! on crits, − on damage taken, + on healing/mana; numbers at the same spot stack upwards; other heroes' hits are smaller |
| 7 | Target / boss UI | Boss tag only; cast warnings only on the ground | 👑 WORLD BOSS tag; named cast warning under the target frame ("Ogre Chieftain: Ground Slam! Leave the red area.") for your target or a boss within 700 units. Empty `#tgtmods` row reserved for future affix/anomaly icons. No phase transitions exist, so none are shown |
| 8 | Minimap | Colour dots only; stones and portal used the same purple | Shapes: diamond boss (gold for World Boss), square stone, triangle Alpha, ring portal, outlined heroes/NPCs. "?" toggles a legend (remembered) |
| 9 | Inventory safety | No locks; auto-merge and Mythic fusion ran at once | Ctrl+click locks/unlocks an item (server-enforced: no selling, sell-all, merging, auto-merge, Mythic fusion or trading). Confirmation before auto-merges that use Epic+ items, merging Epic+ by hand, selling Epic+ and the 1,000,000-gold Mythic fusion |
| 10 | World information | None | 🗺 button: current map, World Tier, frontier region and World Boss, what is active here, and region modifiers clearly marked **"not active yet"** |
| 11 | Chronicle / portal | Legends had an empty state; no explanation of progression | "How does the World Tier grow?" explainer in the Chronicle. The portal window already explained unlocking |
| 12 | Customisable HUD | Windows draggable, positions lost on reload | Dragged positions are remembered; Settings → "Reset window positions" |
| 13 | Accessibility | Text size 85–130% already existed | Rarity letters on item slots (C U R E L M, on by default), Reduce motion (no camera shake, softer red flash, damage numbers barely move; follows the system setting until changed) |
| 14 | Consistency | — | Reuses the existing panel, button and token styles; no new dependencies |

## Not done / left for later

- **Compact HUD mode (#6)** beyond the small-screen scaling: no toggle to hide HUD parts.
- **Danger telegraphs for colour-blind players**: ground warnings are still red only (the new text
  warning helps for bosses).
- **Movable HUD panels** (player frame, minimap, hotbar) - only windows move.
- **Gamepad / full keyboard navigation** of windows.
- **Phone layouts**: the game needs a mouse and keyboard; nothing was done for touch.

## Manual checks still worth doing

- Windows on a real 1366×768 laptop and a 4K screen with OS scaling.
- Hungarian text lengths in the tutorial and confirmation boxes.
- Lock an item, log out and back in: the lock is saved with the item.
- Reduce motion with the operating system's "reduce animations" setting on.
- A real boss fight with several players: cast warnings, stacked numbers, World Boss tag.
