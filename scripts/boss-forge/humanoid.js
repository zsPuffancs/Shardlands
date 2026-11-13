'use strict';
// A humanoid skeleton and clips for the biped World Bosses (Oni Warlord, Frostbound Jarl, Ossuary King).
// 27 bones: pelvis, spine, chest, neck, head, jaw; clavicle, upper arm, forearm and hand per side; a weapon bone in
// the right hand; thigh, shin and foot per side; four armour-skirt bones; a back bone (banner, cape) and a hair bone.
// Positions are passed in by each boss (bonesFrom); the rest pose has the arms hanging, so all clip rotations are
// about the model's own axes (x: pitch forward/back, y: twist, z: roll sideways).
const { qAxis, qMul } = require('./forge');

const NAMES = ['root', 'spine', 'chest', 'neck', 'head', 'jaw', 'clavL', 'uarmL', 'farmL', 'handL', 'clavR', 'uarmR', 'farmR', 'handR', 'weapon',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR', 'skirtF', 'skirtB', 'skirtL', 'skirtR', 'back', 'hair'];
const PARENT = { root: null, spine: 'root', chest: 'spine', neck: 'chest', head: 'neck', jaw: 'head', clavL: 'chest', uarmL: 'clavL', farmL: 'uarmL', handL: 'farmL',
  clavR: 'chest', uarmR: 'clavR', farmR: 'uarmR', handR: 'farmR', weapon: 'handR', thighL: 'root', shinL: 'thighL', footL: 'shinL', thighR: 'root', shinR: 'thighR', footR: 'shinR',
  skirtF: 'root', skirtB: 'root', skirtL: 'root', skirtR: 'root', back: 'chest', hair: 'head' };
const B = Object.fromEntries(NAMES.map((n, i) => [n, i]));
const bonesFrom = pos => NAMES.map(name => ({ name, parent: PARENT[name] === null ? -1 : B[PARENT[name]], pos: pos[name] }));

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const E = (x = 0, y = 0, z = 0) => qMul(qMul(qAxis([0, 1, 0], y), qAxis([1, 0, 0], x)), qAxis([0, 0, 1], z));
const TAU = Math.PI * 2;

// opts: { weight: heavier gait 0..1, grip: right-hand weapon rest angle, banner: sway the back bone, hairSway }
function clips(opts = {}) {
  const heavy = opts.weight === undefined ? .6 : opts.weight, grip = opts.grip || 0;
  const arms = (rot, l, r) => { rot[B.uarmL] = E(l[0], 0, l[1] || 0); rot[B.farmL] = E(l[2] || 0); rot[B.uarmR] = E(r[0], 0, -(r[1] || 0)); rot[B.farmR] = E(r[2] || 0); };
  const back = (rot, t) => { rot[B.back] = E(Math.sin(t) * .05 * (opts.banner ? 1 : .3), 0, Math.sin(t * .7) * .04 * (opts.banner ? 1 : .3)); rot[B.hair] = E(Math.sin(t + 1) * .06, 0, Math.sin(t * .8) * .04); };
  const skirt = (rot, l, r, t) => { rot[B.skirtF] = E(Math.min(l, r) * -.55 + Math.sin(t) * .02); rot[B.skirtB] = E(Math.max(l, r) * .35); rot[B.skirtL] = E(0, 0, Math.sin(t) * .03); rot[B.skirtR] = E(0, 0, -Math.sin(t) * .03); };
  const legs = (rot, ph, amp, lift) => {
    const sL = Math.sin(ph), sR = Math.sin(ph + Math.PI);
    rot[B.thighL] = E(-sL * amp); rot[B.shinL] = E(Math.max(0, Math.cos(ph)) * lift); rot[B.footL] = E(sL * amp * .4);
    rot[B.thighR] = E(-sR * amp); rot[B.shinR] = E(Math.max(0, Math.cos(ph + Math.PI)) * lift); rot[B.footR] = E(sR * amp * .4);
    return [-sL * amp, -sR * amp];
  };
  return {
    Idle: { dur: 4, track: t => { const ph = t / 4 * TAU, br = Math.sin(ph * 2), rot = {}, st = opts.stance || 0;
      // a combat stance: feet planted wide, knees bent, leaning into it
      rot[B.thighL] = E(-.22 * st, 0, .1 * st); rot[B.shinL] = E(.4 * st); rot[B.footL] = E(-.18 * st, 0, -.1 * st);
      rot[B.thighR] = E(-.12 * st, 0, -.1 * st); rot[B.shinR] = E(.3 * st); rot[B.footR] = E(-.18 * st, 0, .1 * st);
      rot[B.spine] = E(.08 * st - br * .01);
      rot[B.chest] = E(br * .02 + .05 * st, Math.sin(ph) * .04); rot[B.neck] = E(Math.sin(ph * 2 + 1) * .03); rot[B.head] = E(-br * .02, Math.sin(ph) * .16); rot[B.jaw] = E(Math.max(0, Math.sin(ph * 2 + 2)) * .05);
      arms(rot, [br * .03 + .05, .08 + .1 * st, -.15 - .3 * st], [grip + br * .02, .1 + .08 * st, -.25]); back(rot, ph); skirt(rot, -.2 * st, -.1 * st, ph); return { rot, root: [0, br * .2 - 1.6 * st + (opts.hover ? Math.sin(ph) * 1.8 : 0), 0] }; } },
    Walk: { dur: 1.2, track: t => { const ph = t / 1.2 * TAU, rot = {}, [l, r] = legs(rot, ph, .42, .7);
      rot[B.root] = E(0, Math.sin(ph) * .06, Math.sin(ph) * .03 * heavy); rot[B.chest] = E(.04, -Math.sin(ph) * .1); rot[B.head] = E(0, Math.sin(ph) * .05);
      arms(rot, [-l * .7 + .05, .1, -.25], [grip - r * .25, .1, -.3]); back(rot, ph * 2); skirt(rot, l, r, ph); return { rot, root: [0, -Math.abs(Math.cos(ph)) * 1.2 * heavy + .6, 0] }; } },
    Run: { dur: .8, track: t => { const ph = t / .8 * TAU, rot = {}, [l, r] = legs(rot, ph, .7, 1.2);
      rot[B.root] = E(.12, Math.sin(ph) * .08); rot[B.chest] = E(.1, -Math.sin(ph) * .16); rot[B.head] = E(-.12);
      arms(rot, [-l * 1.1 + .1, .15, -.9], [grip - r * .4 - .1, .12, -.7]); back(rot, ph * 2); skirt(rot, l, r, ph); return { rot, root: [0, -Math.abs(Math.cos(ph)) * 2 + 1, 0] }; } },
    // overhead smash with the weapon arm, stepping into it
    Attack: { dur: .62, track: t => { const u = t / .62, rot = {}, wind = smooth(0, .4, u) * (1 - smooth(.4, .55, u)), hit = smooth(.4, .55, u) * (1 - smooth(.7, 1, u));
      rot[B.chest] = E(-wind * .22 + hit * .3, wind * .35 - hit * .25); rot[B.spine] = E(-wind * .1 + hit * .12); rot[B.head] = E(wind * .1 - hit * .1); rot[B.jaw] = E(hit * .25);
      arms(rot, [-.4 * wind + .2 * hit, .3, -.4], [grip - 2.9 * wind - .9 * hit, .15, -.8 * wind - .2 * hit]);
      rot[B.thighL] = E(-.45 * (wind + hit)); rot[B.shinL] = E(.3 * wind); rot[B.thighR] = E(.25 * hit); skirt(rot, -.45 * (wind + hit), 0, u); back(rot, u * 4);
      return { rot, root: [0, -hit * 2, hit * 5 - wind * 1] }; } },
    // war cry: arms flung wide, chest thrown back, jaw open
    Attack2: { dur: 1.1, track: t => { const u = t / 1.1, rot = {}, h = smooth(0, .25, u) * (1 - smooth(.8, 1, u));
      rot[B.chest] = E(-h * .25); rot[B.neck] = E(-h * .3); rot[B.head] = E(-h * .2); rot[B.jaw] = E(h * .55 + Math.sin(u * 40) * .03 * h);
      arms(rot, [-h * .5, h * 1.1, -h * .3], [grip - h * .6, h * .9, -h * .4]); back(rot, u * 6); skirt(rot, 0, 0, u);
      return { rot, root: [0, -h * 1.5, -h * 1] }; } },
    RecieveHit: { dur: .4, track: t => { const u = t / .4, k = Math.sin(u * Math.PI) * (1 - u * .4), rot = {};
      rot[B.chest] = E(-k * .18, k * .1); rot[B.head] = E(-k * .2, -k * .15); rot[B.jaw] = E(k * .2); arms(rot, [k * .3, .2, -.4], [grip + k * .2, .2, -.4]); return { rot, root: [0, 0, -k * 2.5] }; } },
    // collapses to the knees, then falls forward onto the ground
    Death: { dur: 1.8, track: t => { const u = t / 1.8, kneel = smooth(0, .35, u), fall = smooth(.35, .85, u), rot = {};
      rot[B.root] = E(-fall * 1.35); rot[B.thighL] = E(-kneel * 1.5 - fall * -.9); rot[B.shinL] = E(kneel * 2.2 - fall * 1.4); rot[B.thighR] = E(-kneel * 1.3 + fall * .9); rot[B.shinR] = E(kneel * 2.1 - fall * 1.3);
      rot[B.chest] = E(kneel * .3); rot[B.head] = E(-fall * .4); rot[B.jaw] = E(.2 * u); arms(rot, [-kneel * .4 - fall * .6, .4, -.2], [grip - kneel * .5 - fall * .8, .4, -.2]);
      return { rot, root: [0, -kneel * (opts.kneelDrop || 16) - fall * (opts.fallDrop || 14), fall * 8] }; } },
  };
}

module.exports = { NAMES, B, bonesFrom, clips, E };
