# Metin Stone models ("Pillars")

Every stone type has a sculpted, rigged model drawn by the engine's hero path (`GL.drawHero`, the same renderer as the
premium World Bosses). This is visual only: health, spawning, summoning, rewards and destruction are unchanged.

| Type | Shown as | Where |
|---|---|---|
| `stone` Spirit Pillar | the Verdant Heart | Whispering Meadows |
| `jadestone` Jade Pillar | the Blighted Core | Gloomwood, beast regions |
| `bonestone` Bone Pillar | the Bloodforged Stone; the Ossuary Pillar in Necropolis scenery (look 6) | Ashen Barrens, war/undead regions |
| `emberstone` Ember Pillar | the Infernal Heart | Ember Wastes, fire regions |
| `froststone` Frost Pillar | the Frozen Relic | Frostfang Peaks, frost regions |
| `voidstone` Void Pillar | the Void Anchor | Voidreach, void regions |
| `doomstone` Doom Pillar | the Soul Harvester | Death Zone and other regions |

- Generated, never hand-edited: `node scripts/boss-forge/build-metin.js [meadows ember frost gloom war void ossuary doom]`
  writes `public/assets/metin/<id>.glb` (~130-230k triangles, clips Intact, Damaged, Near, Break) and `<id>-far.glb`
  (beyond 640 units and for the shadow).
- Breakable pieces are bones, so the damage stages are real geometry: chunks fall to the ground, glowing cracks open,
  the core is exposed and leaks energy, the upper block leans. Stage = replicated health: above 2/3 intact, above 1/3
  damaged, otherwise near destruction, so every client shows the same stage.
- Effects (`public/metin-stones.js`): the server's existing `fx`/`summon` event plays a biome summon burst, the `die`
  event plays the Break clip and a biome explosion; particle counts are capped.
- Fallback: until a model loads, or without the hero renderer, the original primitive stone (`stoneModel`) is drawn.
