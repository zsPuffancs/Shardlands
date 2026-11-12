# Compact client layout

`public/responsive-ui.css` overrides the desktop skin on screens up to 760 CSS pixels wide, coarse-pointer devices up to 1100 pixels wide, and short screens up to 1100 × 480. `public/responsive-ui.js` uses the same media query. Desktop layout remains in the existing skin.

- The player frame, minimap, labels, hero name and damage numbers get compact dimensions. The minimap keeps the existing frame/canvas ratio at every size.
- Navigation buttons move into a separate row above the seven-slot action bar. In landscape, chat sits beside the action bar; portrait chat sits above navigation. Buttons retain touch-sized hit areas.
- NPC services open without automatically placing the inventory over them on compact screens. Inventory remains available from navigation. Item pickers inside services remain available.
- Windows use a centered, bounded viewport with an internally scrollable body. Existing desktop inline widths and saved positions are overridden only while compact mode applies. Mobile header taps do not save dragged positions; returning to desktop restores saved placement.
- Browser `visualViewport` resize/scroll events update the usable rectangle, including the on-screen keyboard. Safe-area insets protect controls from notches and the home indicator. Updates are coalesced to one animation frame. HUD height changes reposition target information and warnings without per-frame DOM measurement.
- Form inputs use at least 16px text to avoid automatic focus zoom on iOS. Browser text inflation is disabled; manual pinch zoom remains available. The existing text-size preference is retained. The 3D renderer and world projection are not globally scaled or moved.

After updating the client, refresh the page to load the new stylesheet and script. No world regeneration or server setting is required. This change adjusts layout; it does not introduce a touch joystick or redesign movement controls.

Verification for this change was limited to JavaScript syntax and Git whitespace/conflict checks, per the user's instruction not to run tests automatically. Browser/phone visual verification has not been performed. Suggested manual checks: 320/390/430px portrait, 844 × 390 landscape, a tablet, desktop restoration, long names/large currency totals, all service windows, a text field with the keyboard open, and the minimap legend.
