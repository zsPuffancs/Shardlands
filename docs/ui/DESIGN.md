# Shardlands design system

The approved Stage 2 benchmark is the visual standard: charcoal and near-black panels, restrained gold and bronze
accents (gold only for important elements), Lora for window titles, Inter for everything else, metallic hairline
borders, subtle gradients, and one painted icon family.

## Files
| File | What it holds |
|---|---|
| `public/ds/tokens.css` | Every colour, rarity colour, font, type step, spacing step, radius, shadow and motion timing |
| `public/ds/components.css` | Reusable `.sl-*` components for new screens (window, section, button, tabs, input, slot, bar, icon, currency, tooltip, stat line) |
| `public/ds/game.css` | The game's existing screens (current ids/classes) drawn with the tokens. Loaded last, after the older stylesheets |
| `public/ds/icons.js` | `window.Icons`: icon registry plus the data tables the UI reads (`CURRENCY`, `RARITY`, `SLOT`) |
| `public/ds/ui.js` | Presentation helpers (slider fill) |
| `public/ds/fonts/` | Lora and Inter (SIL OFL), subset for English + Hungarian, bundled because the desktop build runs offline |
| `public/icons/<category>/<name>.png` | Rendered icons: 128 px, transparent |
| `art/icons/<category>.js` | Icon sources (SVG written as code); `kit.js` holds the shared materials, lighting and outline |
| `art/icons/render.js` | Renders sources to `public/icons` with the bundled Chromium |
| `tests/ui-icons.test.js` | Every registered icon exists at 128 px, every game icon key resolves, no emoji or symbol placeholders remain |

`public/ui.css`, `responsive-ui.css`, `portal-ui.css` and the `<style>` block in `index.html` still hold layout
(positions, grids, breakpoints). Colours there are being retired in favour of tokens; `game.css` wins where both apply.

## Components (use these for anything new)
| Need | Markup |
|---|---|
| Window | `<div class="win panel" id="…"><div class="win-h"><b><img class="sl-ico t-ico" src="icons/…"><span data-text="…">Title</span></b><button class="x" data-close></button></div><div class="win-b">…</div></div>` (open with `openWin(id)`) |
| New-screen window | `.sl-window` > `.sl-window-h` (`.sl-title`) + `.sl-window-b` |
| Section heading | `<div class="hd2"><span>Label</span></div>` or `.sl-section` |
| Buttons | `<button>` (default), `button.pri` / `.sl-btn.is-primary` (one per view), `.sl-btn.is-danger`, `.sl-btn.is-icon` |
| Tabs | `.tabs` > `button` (+ `.on`) or `.sl-tabs` > `.sl-tab` (+ `.is-on`) |
| Item slot | `slotHtml(item, attrs)` in ui.js, or `.sl-slot.r<rarity>` with `Icons.item(item)` |
| Item card / tooltip body | `tipItem(item, compareTo)` inside `.itemcard` or `#tip` |
| Bar | `.bar` / `.sl-bar` with `<i style="width:…">` and `--c` / `--hi` colours |
| Currency | `Icons.currency(key, value)` |
| Stat line | `.sl-stat` (icon, label, `<b>` value) |
| List row | `.row` > `.ico` + `.t` (`b` + `small`) + `button` |
| Choice grid | `.pickgrid` of slots (`.pick` = selected) |
| Inline icon | `Icons.img('<category>/<name>', 'extra classes')` |

All interactive components have hover, pressed, selected (`.on`, `.pick`, `.sel`, `aria-pressed`), disabled and
`:focus-visible` states. Motion uses `--sl-fast` / `--sl-med`, which are 0 under `prefers-reduced-motion`.

## Extending
- **New rarity**: add `--sl-r6` to tokens.css, `.r6`/`.rt6` lines (slot and text colour) in components.css and game.css,
  and the name to `Icons.RARITY`. No new art: rarity is the slot frame, glow and name colour.
- **New currency**: one entry in `Icons.CURRENCY` (icon name) and a colour class `.sl-currency.is-<key>`;
  `Icons.currency(key, value)` renders it anywhere.
- **New equipment slot**: draw `gear/<slot>`, add it to `LIB.gear` and `Icons.SLOT`. Slots, tooltips and the equipment grid use it.
- **New item category / consumable**: `item/<id>` icon; `uiImg('item-<id>')` resolves it.
- **New class**: an optional `skill/<class>` icon; without one the class uses its weapon family's icon (login, portrait, action bar).
- **New NPC interaction**: `npc/<kind>` icon, a `.win` for its window, and one entry in `NPCICON` (game.js) for its world label.
- **New window or system**: build from the components above; put layout in its own stylesheet using tokens only.
- **GM tools**: `gm.js` styles use the same tokens; new panels go in `.gm-group` blocks.

## Icons
- **Style**: 128 px canvas, 8 px clear margin, light from the top left, dark ink outline, soft drop shadow, bevelled
  rims, materials from `MAT` in `kit.js` (steel, gold, bronze, wood, leather, cloth, gems, glass, magic).
- **Categories**: `gear`, `item`, `currency`, `menu`, `stat`, `skill`, `npc`, `boss`, `quest`, `ui`, `gm`.
- **Add one**:
  1. Draw it in `art/icons/<category>.js` with `Icon()`, `part(path, material)`, `line`, `gem`, `glow` and `spark`.
  2. Run `node art/icons/render.js <category>`.
  3. Add the name to `LIB` in `public/ds/icons.js`.
  4. Use it with `Icons.img('<category>/<name>')`.
  5. Check it at its in-game size (16-52 px) and run `node --test tests/ui-icons.test.js`.
- **Text never carries icons**: localised strings contain words only. Put the icon next to the text in markup
  (`Icons.img(...) + '<span>' + esc(text(key, fallback)) + '</span>'`). Where localisation replaces an element's whole
  text (`[data-text]` on the element itself), give the element its icon from CSS (`::before` with the icon URL).
  The test fails if an emoji or symbol placeholder comes back.
- `Icons.legacy(key)` maps the keys the game code builds (`gear-sword-epic`, `slot-empty-helm`, `item-hp`, `skill-crit`)
  to registry names, so item data never stores file names.
