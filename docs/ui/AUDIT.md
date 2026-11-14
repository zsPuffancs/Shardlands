# Shardlands UI audit (Stage 1)

Snapshot of the interface before the premium redesign. Everything below was found by reading the code
(`public/index.html`, `ui.js`, `ux.js`, `game.js`, `gm.js`, `portal-ui.js`, `adventure-ui.js`, `auto-affix-ui.js`,
`inventory-qol.js`, `bag-view.js`, `resource-bars.js`, `responsive-ui.js`, the CSS files and `locales/hu.js`).

## 1. Architecture today
- Plain DOM over the WebGL canvas. No framework. Windows are static markup in `index.html` (`.win.panel` with
  `.win-h` header, `.win-b` body); their content is rebuilt as HTML strings in `ui.js` / `ux.js` / feature files.
- Styles live in **five places**: a ~100-line `<style>` block inside `index.html`, `ui.css` (9-slice PNG frames),
  `responsive-ui.css`, `portal-ui.css`, and a CSS string inside `gm.js`. Colours are mostly literals
  (`#8a6d3a`, `#5a4630`, `#ffd77a` ...); only `--gold`, `--txt`, `--mut`, `--frame` are variables.
- Text is localised through `GameText` / `data-text` (en defaults inline, `locales/hu.js`). **Many icons are emoji
  baked into the localised strings** ("📜 Skills", "💰 gold"), so icons and text are not separable today.
- Fonts: system UI font for text, Georgia for titles. No bundled font files.
- Assets: `public/ui/*.png` (9-slice frames, bars, buttons, cursors) and `public/ui/icons/*.png` (79 icons, 128 px),
  rendered from SVG sources in `art/ui-pack/svg` by `art/ui-pack/render.js` (original, CC0).
- Server communication: `send({t: ...})` from button handlers; the UI only reads state (`me`, `I`, `BAG`, ...).
  The redesign can change markup/CSS freely as long as element ids, `data-open`, `data-close`, `data-sk`,
  `data-it`, `data-stab`, `data-text` hooks and handlers stay the same.

## 2. Screens and windows
| Screen | Element | Built by |
|---|---|---|
| Login / class pick / language | `#login` | index.html, ui.js |
| HUD: player frame (portrait, level, HP/MP, gold/souls/bag line, buffs, skill-point pill) | `#pframe` | ui.js, resource-bars.js |
| HUD: target frame, boss details, cast warning, boss phase banner | `#tgt`, `#castwarn` | ui.js, ux.js |
| HUD: minimap + legend + menu buttons | `#mapbox`, `#mapbtns`, `#maplegend` | index.html, ux.js |
| HUD: action bar (3 skills, 4 consumables, XP bar) | `#actionbar` | index.html, ui.js |
| HUD: chat with filter tabs | `#chat` | index.html, ux.js |
| Zone banner, toasts, floaters, death screen, perf | `#zone`, `#toasts`, `#floaters`, `#dead` | game.js, ui.js |
| Inventory + equipment + stats + merge + consumables tab | `#invp` | ui.js, bag-view.js, inventory-qol.js |
| Item tooltip / comparison | `#tip` | ui.js |
| Item context menu, destroy dialog | `#bag-item-menu`, `#bag-destroy-dialog` | inventory-qol.js |
| Skills (actives + passives) | `#skillp` | ui.js |
| Merchant | `#shopw` | ui.js |
| Blacksmith (upgrade, auto-upgrade dialog, Mythic fusion) | `#smithw`, `#smith-auto-dialog` | ui.js |
| Soul Mystic (reroll, affix) + Auto Affix | `#mysticw`, `#autoaffixw` | ui.js, auto-affix-ui.js |
| World info | `#worldw` | ux.js |
| Team, invite bar | `#teamw`, `#askbar` | ui.js |
| Trade | `#tradew` | ui.js |
| Encampment / village board | `#campw` | ui.js |
| World Portal (biome / world selection) | `#portalw` | portal-ui.js |
| Chronicle (world progression) | `#chronw` | ui.js |
| Adventurer's Journal | `#journalw` | adventure-ui.js |
| Settings (Sound, Graphics, Keys, Log tabs) | `#setw` | index.html, ui.js |
| Tutorial | `#tutorial` | ux.js |
| GM login, password change, GM panel (tabs) | `.gm-layer` | gm.js |
| World labels: nameplates, NPC names, boss crowns | `#labels` | game.js |

## 3. Shared components found (to be unified)
Window frame + header + close button; primary/normal/danger buttons; tabs (`.tabs`, chat tabs, settings tabs, GM tabs,
inventory tabs - four different implementations); item slot (`.slot.rN`); pick grids; item card (`.itemcard`);
tooltip (`#tip`); bars (`.bar` with `<i>` fill); currency text; chips; `kbd` keycaps; dialogs (two `<dialog>`s,
`#askbar`, GM confirm); range sliders; selects; inputs; toasts; scrollbars (browser default).

## 4. Icon inventory
### 4a. PNG icons (art/ui-pack, `public/ui/icons/`)
| Group | Files | Used in | Shared |
|---|---|---|---|
| Gear: sword, bow, staff, helm, armor, boots, ring, amulet x 6 rarities | `gear-<type>-<rarity>.png` (48) | bag, equipment, tooltip, merchant, smith, mystic, trade | yes |
| Empty equipment slots: weapon, helm, armor, boots, ring, amulet | `slot-empty-*.png` (6) | equipment | no |
| Consumables: hp, hp2, mp, atk, def, spd, xp, ret, reset, souls | `item-*.png` (10) | bag, action bar, merchant, Soul Mystic | yes |
| Classes / skills: blade, archer, mage, crit, critdmg, focus, fortune, frenzy, guard, haste, lifesteal, mend, might, swift, vit | `skill-*.png` (15) | skills, action bar, portrait | yes |

### 4b. Emoji / Unicode used as icons (to be replaced)
| Glyph | Meaning | Where |
|---|---|---|
| 🎒 📜 👥 🗺 🏛 ⚙ 📖 ⚗ | menu: inventory, skills, team, world, chronicle, settings, journal, crafting | minimap buttons, window titles, tutorial |
| 💰 / 🔮 | gold / souls | HUD, inventory, trade, merchant, Mystic |
| 🏪 ⚒ 🔮 🌀 🏕 📜 | NPCs: merchant, smith, mystic, portal, camp, village board | window titles, world labels |
| ⚔ 🛡 💨 📖 🔥 | buffs (Fury, Iron, Swift, Wisdom, Rage) | buff row |
| ⚔ 🎯 ❤ 🛡 💥 🩸 ⚡ 💧 | stats: damage, crit, HP, reduction, crit dmg, lifesteal, speed, mana | inventory stats, tooltips |
| ❤️ 💪 💨 🎯 💥 🩸 🍀 ... | passive skills | skills window |
| ⚔️ 🏹 🔮 / 🌀 🎯 ✴️ | classes / class skills (fallbacks) | login class pick |
| ⚔️ ⛑️ 🛡️ 🥾 💍 📿 🪄 | slot names (fallbacks) | tooltips |
| ❤️ 💖 💧 ⚔️ 🛡️ 💨 📖 🏠 ♻️ 🧪 | consumables (fallbacks), consumables tab | inventory |
| 👑 ★ | World Boss, Region Boss markers | nameplates, target frame |
| ✦ ⚠ 🔥 | crit, cast warning, enrage | floaters, boss banners |
| 🔒 | locked item | tooltip, slot |
| 🤝 🔊 🖥 ⌨ | trade, sound, graphics, keys | window titles, settings tabs |
| 🧭 🌀 | tutorial: movement, portal | tutorial |
| ✕ ✔ ✖ ▲ ▼ ▾ ↕ ⋯ ← ↑ → ↓ | close, yes/no, sort, expand, more, arrows | controls |
| ☆ ★ | favourite / tier stars | portal |

### 4c. Dynamic icons
- `iconOf(item)` picks `gear-<family or slot>-<rarity>`; weapons by family (sword/bow/staff).
- `skillIcon(k)` maps `s1` to the class icon.
- Minimap glyphs are drawn on canvas (`ux.js` legend) - not image icons.

## 5. Proposed architecture
```
public/ds/                  design system (loaded before every feature stylesheet)
  tokens.css                colours, rarity colours, type scale, spacing, radii, shadows, motion
  components.css            .sl-window .sl-btn .sl-tabs .sl-slot .sl-bar .sl-tip .sl-currency .sl-chip ...
  theme-game.css            maps the existing ids/classes onto the components (no markup churn)
  fonts/                    bundled OFL fonts (Lora for titles, Inter for text) - the desktop build is offline
public/icons/               icon library: <category>/<name>.png (rendered) 
  registry.js               window.Icons: name -> file, Icons.img(name), Icons.html(name, opts), emoji aliases
art/icons/                  SVG sources by category + render script (art/icons/render.js)
docs/ui/                    this audit, DESIGN.md (how to add components/icons), ICONS.md (generated list)
```
- Rarity becomes data (`--r0`...`--r5` + names in one table) so a 7th rarity is one line.
- Item art becomes one icon per item type; rarity is shown by the slot frame, gem and glow from the tokens instead of
  six recoloured copies (fewer assets, new rarities need no new art).
- Emoji leave the strings: localised text keeps only words, icons come from the registry by name.
