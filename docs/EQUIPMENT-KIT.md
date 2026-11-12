# Equipment kit (Stage 1: Bandit proof of concept)

`public/equipment-kit.js` puts low-poly armour, helmets and weapons on animated (skinned) characters without
touching the model files. Only the Bandit (Rogue.glb) uses it so far.

## How it works

- **Pieces** are built in code with the same flat-shaded, seeded style as the village kit (`loft`, `band`, `dome`,
  `box`, `slab`). They are built once and cached.
- **Attachments** name a piece and a **bone** (a skin joint, e.g. `Head`, `Torso`, `UpperArm.L`, `Fist.L`,
  `Weapon.R`). Placement is written in the model's default pose (standing, arms down, facing +z), or in the frame of
  a model node (`frame: 'Rogue_Dagger'` is the dagger's own grip, so new weapons are held exactly like it;
  `mirrorFrame: true` mirrors that grip into the left hand). `mirror: true` repeats a piece on the other side's bone.
- **Baking.** Every piece vertex is moved into the skin's bind pose (a T-pose for this model) and rigidly weighted
  to its bone: `v_bind = inverse(ibm_j) * inverse(rest_j) * v_rest`. The engine's skinning (`node_j * ibm_j`) then
  keeps it on the bone in every animation. No animation, skeleton or hitbox changes.
- **One draw per character.** All the gear of one character is one mesh; colours come from a 32-swatch palette
  texture. Swatches with alpha below 255 glow (the elite ember edge). `GL.drawSkinned(..., gear)` takes
  `{ hide, mesh }`: `hide` skips built-in props of the model (its dagger, pouch, bracer), and `mesh` is drawn once more
  with the same bone matrices, in the colour pass and the shadow pass.
- **Variants** are `EquipKit.pick(set, monsterId)`: a hash of the server's monster id. Every client shows the same
  look with no network data, and a monster keeps its look when it leaves view and comes back.
  Elites (`m.al`) keep their variant, with blackened metal, darker leather and a glowing blade edge.
- **Errors are loud.** A missing bone, frame node, prop or piece throws in `bake()`. The client logs it
  (`[equipment] ...`, also in `Shardlands.gearErrors`) and draws the plain model. Gear is never put on a guessed bone.

## The Bandit set

| Variant | Hides | Adds |
|---|---|---|
| Cutthroat | dagger | face scarf over the hood, short ragged cape, cross-belt with sheathed knives, knife in each hand (`Weapon.R`, `Fist.L`) |
| Brigand | dagger, pouch, bracer | wide-brim kettle hat with a feather, studded jerkin, broad belt, thigh flaps, left shoulder pad, hand axe, buckler on the left forearm |
| Marauder | dagger, bracer | pointed nasal helm with cheek plates, fur mantle, chest strap, iron pauldrons on both arms, broad falchion |

The model's own hood (its `Face` mesh) stays: under a helmet it reads as a coif. Hiding it shows a featureless head.
Bandit world bosses and bosses are not equipped (they keep their current look for the myth stage). Bandit-archetype
monsters of the frontier tiers are bandits and do get the gear.

## Cost

Measured in `gearlab.html` (26 animated bandits, the game's limit for animated enemies):

| | 1 bandit | 26 bandits |
|---|---|---|
| Shadows on, plain | 18 | 418 |
| Shadows on, equipped | 18 | 372 |
| Shadows off, plain | 10 | 210 |
| Shadows off, equipped | 10 | 187 |

The gear adds one draw (plus one shadow draw) per character, and the hidden props save one to three, so the
equipped bandits are cheaper than the plain ones. A variant is about 800-1,450 triangles, baked once per variant.

## Tools

- `gearlab.html` (served with the game, not linked from it): all variants side by side. Query parameters:
  `anim=Run&t=0.3` (freeze a frame), `cam=front|three|side|back|top`, `only=<slot>`, `zoom=0.4`, `shadows=0`,
  `gear=0`, `crowd=26` (draw-call measurement).
- `node scripts/gear-report.js bandit 9`: worst penetration into the body and worst gap per piece over every
  animation, with the model's own props as the baseline. `ANIMS=Run,Death` limits the animations.
- `tests/equipment-attach.test.js`: bones and props exist (including `Fist.L`), missing names throw, hiding is exact,
  gear is rigid on its bone in every game animation, the left knife stays in the hand, nothing sinks into the body
  deeper than the model's own dagger (weapons) or 0.18 units (armour), and nothing floats more than 0.12 units.
  It also checks that variants are deterministic and spread across the set, and that elites only change swatches.

## Adding another enemy (later stages)

1. Inspect the model's bones and props (the report and `tests/helpers/glb-rig.js` read any GLB).
2. Add a set to `EquipKit.SETS` with `model`, `variants` and optionally `elite`. Add pieces to `PIECES` and weapon
   pieces to `PIECE_KIND.weapon`.
3. Set `gear: '<set>'` on the enemy's `MOBCHAR` entry in `public/world.js`.
4. Check it in `gearlab.html?set=<set>` and with `scripts/gear-report.js`, then add its test.
