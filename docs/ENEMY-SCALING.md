# Enemy scaling

How strong monsters are: `enemy-scaling.js` (all parameters in `ENEMY_SCALING`), used by `monsters.js` when a monster spawns,
by `encounter-participation.js` for party scaling, and by `combat.js` / `simulation.js` for boss behaviour.
`scripts/combat-balance.js` prints the tables below from the live formulas; `tests/enemy-scaling.test.js` checks them.

## What was wrong (measured with the production formulas)

- Monster health followed `template × (level / template level)^1.9`, damage `^1.37`. Player damage grows differently
  (passive ranks, gear, the item stat soft cap above item level 500), so the gap changed with level: on-level normal
  monsters died in 1–2 s from level 45 up, and at very high levels monsters ran away from players (a World Boss at World Tier 300: 30 minutes).
- Monster damage was low next to hero health: a normal needed 40–75 hits to kill an on-level hero, a boss 25–35.
- Category multipliers were uneven: Alphas 5× health / 1.6× damage, World Bosses 3× a boss (≈170× a normal monster on generated maps),
  bosses 15–60× a normal monster depending on the zone.
- Party scaling gave every category +45% health per member (+8% damage), so groups melted bosses (4 heroes: 59% of the solo time).
- Bosses' attack rhythm never changed during a fight; there was no window to punish.

## The model

A **reference hero** of the monster's level is built with the real player code: every slot at that item level, Rare +3
(ramping from Common +0 at level 1 to Rare +3 at level 30), affixes on weapon/ring/amulet, one skill point per level
(actives to rank 5, then passives), averaged over the three classes. From it, cached per level:

```
health = heroDPS(level) × timeToKill(level) × archetype.hp × category.hp × world.hp(tier) / 1.6   (default rates.monsterHp)
damage = heroEHP(level) / hitsToKill(level) × archetype.dmg × category.dmg × world.dmg(tier) / 1.4 (default rates.monsterDamage)
```

- `timeToKill`: 2.5 s at level 1 → **5 s** from level 25 (an on-level normal monster, solo, at default rates).
- `hitsToKill`: 24 hits at level 1 → **14 hits** from level 25 (normal-monster hits that kill the hero, before healing).
- `archetype`: the type's health/damage next to the other monsters of its founding zone, clamped to 0.6–1.6
  (Wolf 0.63 health, Shroomling 1.49; Golems tanky, Wraiths hard-hitting). Generated maps use the same factor.
- Health and damage use separate targets and separate world curves, so either can be tuned alone.
- Server admins' `monsterHp` / `monsterDamage` still multiply everything on top.

### Categories (on top of the level budget, applied once)

| Category | Health | Damage | Notes |
|---|---:|---:|---|
| Normal | 1× | 1× | |
| Alpha | 3× | 1.5× | aggro range ×1.35, attacks every 0.95 s (unchanged), 1.1× speed (unchanged) |
| Regional boss | 8× (zone 1) → 12× (zone 7 and beyond) | 1.8× | phases, punish window |
| World Boss | 15× (World Tier 1) → 20× (World Tier 15+) | 2× | phases, punish window, enrage after 2 min |
| Spirit Stone | 12× | pulse 2.2× | guardians are normal/Alpha monsters of the zone |

### World progression

`world factor = 1 + perDepth × depth^0.7`, depth = World Tier − 7 (the founding lands are depth 0).
Health +0.05 per depth step, damage +0.08: deeper worlds hit harder rather than turning monsters into sponges.
It keeps growing (no plateau) but never accelerates (no exponential). Monster levels still come from the generated region ranges.

| World Tier | Depth | Health | Damage | Boss health | World Boss health |
|---:|---:|---:|---:|---:|---:|
| 1 | 0 | ×1.00 | ×1.00 | ×8.0 | ×15.0 |
| 7 | 0 | ×1.00 | ×1.00 | ×12.0 | ×17.1 |
| 8 | 1 | ×1.05 | ×1.08 | ×12.0 | ×17.5 |
| 9 | 2 | ×1.08 | ×1.13 | ×12.0 | ×17.9 |
| 10 | 3 | ×1.11 | ×1.17 | ×12.0 | ×18.2 |
| 15 | 8 | ×1.21 | ×1.34 | ×12.0 | ×20.0 |
| 25 | 18 | ×1.38 | ×1.61 | ×12.0 | ×20.0 |
| 50 | 43 | ×1.70 | ×2.11 | ×12.0 | ×20.0 |
| 100 | 93 | ×2.19 | ×2.91 | ×12.0 | ×20.0 |
| 300 | 293 | ×3.67 | ×5.26 | ×12.0 | ×20.0 |
| 1000 | 993 | ×7.26 | ×11.02 | ×12.0 | ×20.0 |

### Party scaling

Health per extra member (2–5 heroes): normal +45% (unchanged), Alpha and stones +50%, bosses +60%, World Bosses +70%.
Damage stays +8% per member (`xp-economy.js`), so joining a group is never a punishment. XP still pays at most the normal
party scale (`partyAllocation` caps it), so the extra boss health does not inflate XP.

### Boss behaviour (existing attacks, telegraphs and identities kept)

| Phase | Health | Time between telegraphed attacks | Their damage | Ordinary hits |
|---|---|---:|---:|---:|
| 1 | 100–60% | ×1 | ×1 | ×1 |
| 2 (enraged) | 60–30% | ×0.75 | ×1.15 | ×1.1 faster |
| 3 (desperate) | below 30% | ×0.55 | ×1.3 | ×1.25 faster |
| World Boss, 2 min+ | | ×0.85 more | ×1.2 more | ×1.25 more |

After every telegraphed attack the boss **recovers** for 1.3 s (0.9 s in phase 3): it cannot move or hit and takes **+25% damage**.
Phase changes and recover windows show a banner under the target frame (`ux.js`, English and Hungarian).

### Rewards

- XP: unchanged (`xp-economy.js` category budgets). Alphas now pay 3× a normal for 3× the health (before: 3× for 5×).
- World Bosses now drop 7 items (was 5), at least Epic (was Rare), item level +5 (was +3), and 5–10 souls (was 1–5).
  Bosses, Alphas and stones are unchanged. Gold is unchanged (`gold-rewards.js`).

## Before and after

Reference heroes at their level, default rates, averaged over the three classes, half of the telegraphed attacks dodged,
the boss's target in melee range. TTK = time to kill, TTD = time to die. "With heals" includes Second Wind on cooldown,
lifesteal and regeneration (no potions). Before = the previous monster code measured with the same model.

| Hero | World Tier | Enemy | Party | TTK before → after | TTD no heals before → after | Hit on hero before → after | TTD with heals after |
|---|---:|---|---:|---|---|---|---|
| 10 (U+1) | - | normal | 1 | 1.3 s → **2.4 s** | 40.2 s → **31.0 s** | 26 → 34 | ∞ |
| 10 (U+1) | - | normal | 4 | 0.8 s → **1.4 s** | 32.4 s → **25.0 s** | 33 → 42 | ∞ |
| 10 (U+1) | - | alpha | 1 | 6.6 s → **7.2 s** | 21.7 s → **17.8 s** | 42 → 51 | ∞ |
| 10 (U+1) | - | alpha | 4 | 3.9 s → **4.5 s** | 17.5 s → **14.4 s** | 52 → 64 | ∞ |
| 10 (U+1) | - | boss | 1 | 10.1 s → **22.5 s** | 31.7 s → **17.1 s** | 35 (cast 55) → 72 (cast 115) | ∞ |
| 10 (U+1) | - | boss | 4 | 5.9 s → **15.7 s** | 25.5 s → **13.8 s** | 43 (cast 69) → 89 (cast 142) | ∞ |
| 10 (U+1) | - | worldBoss | 1 | 30.4 s → **39.8 s** | 31.7 s → **15.4 s** | 35 (cast 55) → 80 (cast 128) | ∞ |
| 10 (U+1) | - | worldBoss | 4 | 17.8 s → **30.9 s** | 25.5 s → **12.4 s** | 43 (cast 69) → 99 (cast 158) | ∞ |
| 10 (U+1) | - | normal ×3 | 1 | 4.0 s → **7.2 s** | 13.4 s → **10.3 s** | 26 → 34 | ∞ |
| 45 (R+3) | - | normal | 1 | 1.8 s → **4.2 s** | 50.4 s → **16.8 s** | 121 → 365 | ∞ |
| 45 (R+3) | - | normal | 4 | 1.0 s → **2.5 s** | 40.7 s → **13.5 s** | 151 → 452 | ∞ |
| 45 (R+3) | - | alpha | 1 | 8.9 s → **12.6 s** | 27.2 s → **9.7 s** | 194 → 547 | ∞ |
| 45 (R+3) | - | alpha | 4 | 5.2 s → **7.9 s** | 21.9 s → **7.8 s** | 241 → 678 | 83.5 s |
| 45 (R+3) | - | boss | 1 | 35.5 s → **52.8 s** | 36.4 s → **10.2 s** | 174 (cast 278) → 693 (cast 1,108) | ∞ |
| 45 (R+3) | - | boss | 4 | 20.9 s → **36.9 s** | 29.4 s → **8.3 s** | 216 (cast 345) → 859 (cast 1,375) | 221 s |
| 45 (R+3) | - | worldBoss | 1 | 107 s → **78.2 s** | 36.4 s → **9.2 s** | 174 (cast 278) → 770 (cast 1,232) | ∞ |
| 45 (R+3) | - | worldBoss | 4 | 62.7 s → **60.6 s** | 29.4 s → **7.4 s** | 216 (cast 345) → 955 (cast 1,527) | 155 s |
| 45 (R+3) | - | normal ×3 | 1 | 5.3 s → **12.6 s** | 16.8 s → **5.6 s** | 121 → 365 | 18.5 s |
| 150 (R+3) | 10 | normal | 1 | 1.2 s → **7.0 s** | 54.5 s → **11.8 s** | 445 → 2,055 | ∞ |
| 150 (R+3) | 10 | normal | 4 | 0.7 s → **4.1 s** | 44.0 s → **9.5 s** | 552 → 2,548 | ∞ |
| 150 (R+3) | 10 | alpha | 1 | 5.9 s → **21.0 s** | 29.4 s → **6.8 s** | 713 → 3,082 | ∞ |
| 150 (R+3) | 10 | alpha | 4 | 3.5 s → **13.1 s** | 23.7 s → **5.5 s** | 884 → 3,822 | 254 s |
| 150 (R+3) | 10 | boss | 1 | 46.4 s → **103 s** | 25.9 s → **5.7 s** | 969 (cast 1,551) → 4,960 (cast 7,936) | ∞ |
| 150 (R+3) | 10 | boss | 4 | 27.3 s → **71.9 s** | 20.9 s → **4.6 s** | 1,202 (cast 1,923) → 6,151 (cast 9,841) | 34.4 s |
| 150 (R+3) | 10 | worldBoss | 1 | 139 s → **156 s** | 25.9 s → **5.1 s** | 969 (cast 1,551) → 5,511 (cast 8,818) | 52.7 s |
| 150 (R+3) | 10 | worldBoss | 4 | 81.8 s → **121 s** | 20.9 s → **4.1 s** | 1,202 (cast 1,923) → 6,834 (cast 10,934) | 18.3 s |
| 150 (R+3) | 10 | normal ×3 | 1 | 3.6 s → **21.0 s** | 18.2 s → **3.9 s** | 445 → 2,055 | 15.3 s |
| 1000 (E+5) | 40 | normal | 1 | 1.0 s → **7.0 s** | 74.9 s → **11.4 s** | 2,877 → 18,953 | ∞ |
| 1000 (E+5) | 40 | normal | 4 | 0.6 s → **4.1 s** | 60.4 s → **9.2 s** | 3,568 → 23,502 | ∞ |
| 1000 (E+5) | 40 | alpha | 1 | 4.9 s → **21.1 s** | 40.4 s → **6.5 s** | 4,603 → 28,430 | ∞ |
| 1000 (E+5) | 40 | alpha | 4 | 2.9 s → **13.2 s** | 32.6 s → **5.3 s** | 5,708 → 35,253 | ∞ |
| 1000 (E+5) | 40 | boss | 1 | 38.5 s → **103 s** | 35.6 s → **5.5 s** | 6,259 (cast 10,015) → 45,751 (cast 73,202) | ∞ |
| 1000 (E+5) | 40 | boss | 4 | 22.6 s → **72.3 s** | 28.7 s → **4.4 s** | 7,762 (cast 12,419) → 56,731 (cast 90,770) | ∞ |
| 1000 (E+5) | 40 | worldBoss | 1 | 115 s → **172 s** | 35.6 s → **4.9 s** | 6,259 (cast 10,015) → 50,835 (cast 81,335) | ∞ |
| 1000 (E+5) | 40 | worldBoss | 4 | 67.8 s → **133 s** | 28.7 s → **4.0 s** | 7,762 (cast 12,419) → 63,035 (cast 100,856) | ∞ |
| 1000 (E+5) | 40 | normal ×3 | 1 | 2.9 s → **21.1 s** | 25.0 s → **3.8 s** | 2,877 → 18,953 | ∞ |
| 76 (R+3) | 8 | normal | 1 | 1.9 s → **6.6 s** | 49.5 s → **12.8 s** | 221 → 850 | ∞ |
| 76 (R+3) | 8 | worldBoss | 1 | 225 s → **142 s** | 23.5 s → **5.5 s** | 480 (cast 768) → 2,281 (cast 3,650) | 22.6 s |
| 108 (R+3) | 9 | normal | 1 | 1.5 s → **6.8 s** | 52.2 s → **12.3 s** | 313 → 1,333 | ∞ |
| 108 (R+3) | 9 | worldBoss | 1 | 172 s → **149 s** | 24.8 s → **5.3 s** | 682 (cast 1,091) → 3,574 (cast 5,719) | 32.9 s |
| 140 (R+3) | 10 | normal | 1 | 1.2 s → **7.0 s** | 53.6 s → **11.8 s** | 417 → 1,892 | ∞ |
| 140 (R+3) | 10 | worldBoss | 1 | 142 s → **156 s** | 25.5 s → **5.1 s** | 908 (cast 1,453) → 5,074 (cast 8,119) | 159 s |
| 300 (R+3) | 15 | normal | 1 | 1.0 s → **7.6 s** | 61.8 s → **10.3 s** | 905 → 5,422 | ∞ |
| 300 (R+3) | 15 | worldBoss | 1 | 113 s → **187 s** | 29.4 s → **4.5 s** | 1,968 (cast 3,149) → 14,542 (cast 23,268) | ∞ |
| 620 (R+3) | 25 | normal | 1 | 1.0 s → **8.7 s** | 62.8 s → **8.6 s** | 1,990 → 14,482 | ∞ |
| 620 (R+3) | 25 | worldBoss | 1 | 116 s → **212 s** | 29.9 s → **3.7 s** | 4,329 (cast 6,927) → 38,843 (cast 62,148) | ∞ |
| 1420 (R+3) | 50 | normal | 1 | 2.0 s → **10.6 s** | 36.4 s → **6.6 s** | 6,952 → 38,563 | ∞ |
| 1420 (R+3) | 50 | worldBoss | 1 | 230 s → **261 s** | 17.3 s → **2.8 s** | 15,125 (cast 24,200) → 103,429 (cast 165,487) | ∞ |
| 3020 (R+3) | 100 | normal | 1 | 4.4 s → **13.8 s** | 20.2 s → **4.8 s** | 23,167 → 98,394 | ∞ |
| 3020 (R+3) | 100 | worldBoss | 1 | 520 s → **338 s** | 9.6 s → **2.1 s** | 50,401 (cast 80,642) → 263,906 (cast 422,249) | 11.3 s |
| 6220 (R+3) | 200 | normal | 1 | 9.9 s → **18.8 s** | 12.1 s → **3.3 s** | 71,770 → 261,171 | ∞ |
| 6220 (R+3) | 200 | worldBoss | 1 | 1160 s → **461 s** | 5.7 s → **1.4 s** | 156,143 (cast 249,829) → 700,492 (cast 1,120,787) | 2.9 s |
| 9420 (R+3) | 300 | normal | 1 | 15.5 s → **23.1 s** | 9.2 s → **2.6 s** | 135,174 → 474,063 | 21.2 s |
| 9420 (R+3) | 300 | worldBoss | 1 | 1821 s → **565 s** | 4.4 s → **1.1 s** | 294,086 (cast 470,537) → 1,271,493 (cast 2,034,389) | 1.8 s |

## Remaining concerns and suggestions (not implemented)

- **Second Wind** (rank 5) heals 60% of maximum health every 5.5 s for 20 MP. That is about 11% of maximum health per second,
  more than one on-level normal monster, Alpha or (solo) boss deals; most "TTD with heals" values are therefore ∞.
  Danger now comes from packs, Alphas in packs, undodged boss attacks and late phases. If the game should feel harder still,
  this skill is the first lever (for example 35% at rank 5, or a longer cooldown).
- The reference is Rare +3. Heroes with Legendary/Mythic +7–9 gear are roughly twice as strong, which is intended (gear progression
  should be felt), but deep worlds (World Tier 100+) assume that gear: a Rare +3 hero there takes 14–23 s per normal monster.
- Generated maps have no regional bosses (only the World Boss), as before.
- Region modifiers (`armored-elites`, `raging-alphas`, …) are listed per region but still have no combat effect.
- AoE skills (Whirlwind, Nova, Multishot) are not in the single-target TTK, so packs die faster than the table shows.
- These are model numbers; tune `ENEMY_SCALING` after playtesting (e.g. `normalTimeToKill.full`, `normalHitsToKill.full`, `world.*PerDepth`).
