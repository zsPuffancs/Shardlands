# Shardlands UI pack (original, CC0)

A fantasy UI set made for Shardlands: dark leather/stone panels, gold trim and ruby gems, in the same colours as the game.
Everything here was drawn from scratch as code and is released into the public domain (CC0), so use, edit and share it freely.

## Folders
- `svg/` – the source art (vector, scale to any size, easy to recolour)
- The game uses the 2x PNGs from `public/ui/` (cursors at 1x). Re-render them from `svg/` if you edit the art.
- `shardlands-ui.css` – ready-made classes (`sl-panel`, `sl-btn`, `sl-bar`, `sl-slot`, ...) using CSS border-image 9-slicing
- `preview.html` / `preview.png` – everything in use, `preview-icons.png` – all 70 icons
- `manifest.json` – size and 9-slice value of every asset

## Contents (123 assets)
- Frames: `panel` (window, 9-slice 40), `panel-plain`, `tooltip`, `panel-header` (title plate), `hotbar`, `input`, `nameplate`
- Buttons: `button` + `-hover` `-pressed` `-disabled` `-primary` `-danger`, `button-round`, `close`, `tab`, `tab-active`
- Bars: `bar-frame` + fills `hp` `mp` `xp` `stamina` `boss` `shield`; globes `globe-hp`, `globe-mp`, `globe-frame`
- Slots: `slot`, `slot-common` ... `slot-legendary`, `slot-set`, `slot-unique`, `slot-hover`, `slot-cooldown`, `keycap`
- HUD: `minimap-frame`, `portrait-frame`, `badge-level`, `badge-boss`, `divider`
- Controls: `checkbox`, `checkbox-on`, `slider-track`, `slider-knob`, `scroll-track`, `scroll-thumb`
- Cursors: `cursor`, `cursor-attack`, `cursor-talk`, `cursor-loot` (32 px, hotspots in manifest.json)
- Icons (`icons/`): 8 gear types x 5 rarities, 9 consumables, 15 skills/classes, 6 empty-slot silhouettes

## 9-slice in one line
`border: 40px solid transparent; border-image: url(png@2x/panel.png) 80 fill / 40px stretch;`
(the @2x image uses double the slice value: 80 instead of 40)
