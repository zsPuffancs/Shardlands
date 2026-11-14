# Shardlands design system

Status: **Stage 2 benchmark**. HUD, inventory, equipment, item tooltip, settings and every window frame use it.
The other screens get the frame, buttons, tabs and slots for free and are finished in Stage 5.

## Files
| File | What it holds |
|---|---|
| `public/ds/tokens.css` | All colours, rarity colours, fonts, type scale, spacing, radii, shadows, motion timings |
| `public/ds/components.css` | Reusable `.sl-*` components: window, section, button, tabs, input, slot, bar, icon, currency, tooltip, stat line |
| `public/ds/game.css` | The existing screens (current ids/classes) drawn with the tokens. Loaded last, no markup changes needed |
| `public/ds/icons.js` | `window.Icons`: the icon registry (names -> files), item/slot helpers, emoji migration |
| `public/ds/ui.js` | Presentation helpers (slider fill) |
| `public/ds/fonts/` | Lora (titles) and Inter (text), OFL, subset for English + Hungarian |
| `public/icons/<category>/<name>.png` | Rendered icons, 128 px, transparent |
| `art/icons/*.js` | Icon sources (SVG drawn as code), one file per category; `kit.js` holds the shared materials and lighting |

## Rules
- Components never use literal colours: use a token, or add one to `tokens.css`.
- Rarity is data: `--sl-r<N>` in tokens + `.rN`/`.rtN` classes. Item art is one icon per item type; the slot frame,
  glow and name colour show the rarity. A new rarity = one token line + one `.rN` line.
- Every interactive element has hover, active (pressed), selected, disabled and `:focus-visible` states.
- Motion uses `--sl-fast` / `--sl-med`; both drop to 0 under `prefers-reduced-motion`.

## Adding an icon
1. Draw it in `art/icons/<category>.js` with the kit (`Icon()`, `part(path, material)`, `gem`, `glow`, `spark`).
   Canvas 128, keep 8 px clear at the edges, light from the top left, materials from `MAT`.
2. `node art/icons/render.js <category>` writes `public/icons/<category>/<name>.png`.
3. Add the name to `LIB` in `public/ds/icons.js`. Use it with `Icons.img('<category>/<name>')`.
4. `node --test tests/ui-icons.test.js` checks every registered file exists.

## Adding a component or screen
Build new markup from the `.sl-*` classes (`sl-window`, `sl-window-h`, `sl-title`, `sl-btn is-primary`, `sl-tabs`/`sl-tab is-on`,
`sl-slot rN`, `sl-bar` with `--c`/`--hi`, `sl-currency is-gold`, `sl-stat`). Put screen-specific layout in its own
stylesheet that only uses tokens.

## Emoji migration
Some localised strings still contain emoji (for example "📜 Skills"). `Icons.decorate` replaces them with registry icons
inside the HUD and windows (`Icons.EMOJI` lists the mapping), so the interface already shows one icon family. Stage 5
moves the icons out of the strings into the markup and removes the decorator.
