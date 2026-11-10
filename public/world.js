// Shardlands: nature assets (Quaternius, CC0), animated characters (Quaternius RPG pack, CC0) and combat effects.
let NAT = null; const CHARS = {}; const DECOR = new Map();

// ---------------- nature pack ----------------
async function loadNature() {
  try {
    const [js, bin] = await Promise.all([fetch('assets/nature.json').then(r => r.json()), fetch('assets/nature.bin').then(r => r.arrayBuffer())]);
    const dv = new DataView(bin), st = js.stride, out = {};
    for (const name in js.models) {
      const m = js.models[name], parts = [];
      for (const p of m.parts) {
        const a = new Float32Array(p.count * 6);
        for (let i = 0; i < p.count; i++) { const o = (p.start + i) * st; for (let c = 0; c < 3; c++) { a[i * 6 + c] = (dv.getInt16(o + c * 2, true) + 32767) * m.sc[c] + m.min[c]; a[i * 6 + 3 + c] = dv.getInt8(o + 6 + c) / 127; } }
        parts.push({ mesh: GL.meshFromArray(a), col: p.col });
      }
      out[name] = { parts, h: m.max[1] - m.min[1], w: Math.max(m.max[0] - m.min[0], m.max[2] - m.min[2]), minY: m.min[1], radius: Math.hypot(Math.max(Math.abs(m.min[0]), Math.abs(m.max[0])), Math.max(Math.abs(m.min[2]), Math.abs(m.max[2]))) };
    }
    NAT = out;
  } catch (e) { console.warn('nature pack not loaded - using simple trees', e); NAT = null; }
}
// precomputed instance groups per world chunk; cat 0 = trees, 1 = bushes/rocks/logs, 2 = grass/flowers
function natPlace(name, x, z, size, yaw, tint, cat, bySize) {
  const m = NAT && NAT[name]; if (!m) return false;
  const k = size / (bySize ? Math.max(m.h, m.w) : m.h), CH = GL.CH, kx = Math.floor(x / CH), kz = Math.floor(z / CH), key = kx + ',' + kz;
  let cell = DECOR.get(key); if (!cell) { cell = { cx: (kx + .5) * CH, cz: (kz + .5) * CH, g: new Map(),
    bounds: [Infinity, -2, Infinity, -Infinity, 0, -Infinity] }; DECOR.set(key, cell); }
  const r = m.radius * k, bounds = cell.bounds;
  bounds[0] = Math.min(bounds[0], x - r);
  bounds[2] = Math.min(bounds[2], z - r);
  bounds[3] = Math.max(bounds[3], x + r);
  bounds[4] = Math.max(bounds[4], m.h * k);
  bounds[5] = Math.max(bounds[5], z + r);
  for (const p of m.parts) {
    const gk = p.mesh; let g = cell.g.get(gk); if (!g) { g = [null, null, null]; cell.g.set(gk, g); }
    let q = g[cat]; if (!q) q = g[cat] = { arr: new Float32Array(GL.STRIDE * 16), n: 0, mesh: p.mesh };
    if ((q.n + 1) * GL.STRIDE > q.arr.length) { const na = new Float32Array(q.arr.length * 2); na.set(q.arr); q.arr = na; }
    const c = tint ? [p.col[0] * tint[0], p.col[1] * tint[1], p.col[2] * tint[2]] : p.col;
    GL.instWrite(q.arr, q.n * GL.STRIDE, x, -m.minY * k - 1, z, k, k, k, yaw, c, 0); q.n++;
  }
  return true;
}
const rng = (b, n, s) => Array.from({ length: n }, (_, i) => b + '_' + (i + (s || 1)));
// per zone: [models, weight, size range, tint]
const ZDEC = [
  { big: [[rng('CommonTree', 5), 5, [115, 170]], [rng('BirchTree', 5), 2.5, [120, 165]], [rng('q1_Tree', 10), 2, [100, 145]]],
    mid: [[['Bush_1', 'Bush_2'], 3, [26, 38]], [['BushBerries_1', 'BushBerries_2'], 2, [26, 36]], [rng('Rock_Moss', 7), 2.5, [16, 42], null, 1], [['TreeStump'], 1, [14, 18]], [['WoodLog'], 1, [40, 56], null, 1], [rng('Plant', 5), 2, [14, 22]]],
    small: [[['Grass', 'Grass_2', 'Grass_Short'], 8, [9, 15]], [['Flowers'], 2, [10, 14]]] },
  { big: [[rng('PineTree', 5), 4, [150, 220]], [rng('q1_Pine', 5), 3, [140, 200]], [rng('Willow', 5), 1.8, [125, 160]], [rng('CommonTree_Autumn', 5), 1.2, [120, 160]]],
    mid: [[rng('Rock_Moss', 7), 3, [18, 46], null, 1], [['TreeStump_Moss'], 1.5, [14, 19]], [['WoodLog_Moss'], 1.5, [44, 60], null, 1], [['Bush_1', 'Bush_2'], 2, [26, 40], [.75, .85, .8]], [rng('Plant', 5), 1.5, [14, 22], [.8, .9, .85]]],
    small: [[['Grass_Short', 'Grass'], 6, [9, 15], [.72, .82, .78]]] },
  { big: [[rng('CommonTree_Dead', 5), 3, [110, 160]], [rng('Willow_Dead', 5), 2, [110, 145]], [rng('BirchTree_Dead', 5), 1.4, [110, 150]], [rng('q1_DeadTree', 10), 3, [95, 140], [.85, .8, .78]]],
    mid: [[rng('Rock', 7), 4, [18, 50], [.9, .85, .8], 1], [['TreeStump'], 1, [14, 18], [.8, .75, .7]], [['WoodLog'], 1, [40, 56], [.75, .7, .65], 1]],
    small: [[['Grass_Short'], 3, [8, 12], [1.25, 1.05, .6]]] },
  { big: [[rng('q1_DeadTree', 10), 3, [90, 135], [.32, .22, .2]], [rng('q1_DeadBirch', 10), 1.5, [90, 130], [.3, .2, .18]]],
    mid: [[rng('Rock', 7), 4, [20, 55], [.62, .38, .3], 1]], small: [] },
  { big: [[rng('PineTree_Snow', 5), 4, [150, 215]], [rng('CommonTree_Snow', 5), 2, [115, 165]], [rng('BirchTree_Snow', 5), 1.5, [120, 160]], [rng('CommonTree_Dead_Snow', 5), 1.2, [110, 150]], [rng('Willow_Dead_Snow', 5), 1, [110, 145]]],
    mid: [[rng('Rock_Snow', 7), 4, [18, 52], null, 1], [['Bush_Snow_1', 'Bush_Snow_2'], 2, [26, 38]], [['TreeStump_Snow'], 1, [14, 18]], [['WoodLog_Snow'], 1, [42, 58], null, 1]], small: [] },
  { big: [[rng('Willow_Dead', 5), 2, [115, 150], [.5, .32, .66]], [rng('CommonTree_Dead', 5), 2, [110, 155], [.45, .3, .6]], [rng('q1_DeadBirch', 10), 1, [95, 130], [.5, .36, .7]]],
    mid: [[rng('Rock', 7), 3, [20, 50], [.48, .36, .66], 1]], small: [[['Grass_Short'], 3, [9, 14], [.9, .5, 1.2]]] },
  { big: [[rng('q1_DeadTree', 10), 2, [95, 140], [.24, .12, .12]], [rng('Willow_Dead', 5), 1, [110, 150], [.25, .12, .14]]],
    mid: [[rng('Rock', 7), 3, [22, 56], [.35, .22, .22], 1]], small: [] },
];
const FARC = [[.2, .5, .22], [.12, .32, .22], [.26, .22, .2], [.12, .08, .08], [.85, .9, .95], [.22, .14, .3], [.1, .05, .05]];
function pickW(list, r) { let t = 0; for (const e of list) t += e[1]; let k = r * t; for (const e of list) { k -= e[1]; if (k <= 0) return e; } return list[list.length - 1]; }
function bakeDecor(onRoad, zoneOf, R) {
  DECOR.clear(); if (!NAT) return false;
  const { W, H, CX, CY, V } = WORLD, area = W * H / 25e6;
  const put = (cat, x, z, zn) => { const L = ZDEC[Math.min(zn, ZDEC.length - 1)][cat === 0 ? 'big' : cat === 1 ? 'mid' : 'small']; if (!L || !L.length) return; const e = pickW(L, R()), name = e[0][Math.floor(R() * e[0].length)], size = e[2][0] + R() * (e[2][1] - e[2][0]), yaw = R() * 6.283;
    if (natPlace(name, x, z, size, yaw, e[3], cat, e[4]) && cat === 0) { // cheap stand-in shown beyond the detail radius
      const c = FARC[Math.min(zn, 6)], s = size / 150, dead = zn === 2 || zn === 3 || zn >= 5;
      GL.bakeAdd(M.trunk, x, 0, z, 4 * s, (dead ? 120 : 55) * s, 4 * s, yaw, 0, [.3, .22, .15], 0, 0, true);
      if (!dead) { GL.bakeAdd(M.cone6, x, 35 * s, z, 42 * s, 90 * s, 42 * s, yaw, 0, c, 0, 0, true); GL.bakeAdd(M.cone6, x, 85 * s, z, 28 * s, 60 * s, 28 * s, yaw, 0, [c[0] * 1.15, c[1] * 1.15, c[2] * 1.15], 0, 0, true); } } };
  const pass = (n, cat, minD, skipRoadW) => { for (let i = 0; i < n; i++) { const x = R() * W, z = R() * H, d = Math.hypot(x - CX, z - CY); if (d < minD || onRoad(x, z, skipRoadW)) { R(); R(); R(); R(); continue; } const zn = zoneOf(x, z); if (zn < 0) { R(); R(); R(); R(); continue; } if (zn === 3 && R() < .5) { R(); R(); R(); continue; } if (zn === 6 && R() < .35) { R(); R(); R(); continue; } put(cat, x, z, zn); } };
  pass(Math.round(3000 * area), 0, V + 110, 52); pass(Math.round(2600 * area), 1, V + 70, 40); pass(Math.round(9000 * area), 2, V + 30, 26);
  // farmland just outside the village fence
  for (let i = 0; i < 520; i++) { const a = (i % 2 ? .45 : 3.6) + R() * 1.1, d = V + 40 + R() * 130, x = CX + Math.cos(a) * d, z = CY + Math.sin(a) * d; if (onRoad(x, z, 50)) continue; natPlace(R() < .6 ? 'Wheat' : (R() < .5 ? 'Corn_1' : 'Corn_2'), x, z, 22 + R() * 10, R() * 6.28, null, 1); }
  return true;
}
let decorStats = 0;
function drawDecor() {
  if (!DECOR.size) return; const q = GL.Q, lo = q.mode === 'low', md = q.mode === 'medium' || q.scale < .8;
  const R0 = lo ? 850 : md ? 1150 : 1450, R1 = lo ? 550 : md ? 800 : 1000, R2 = lo ? 0 : md ? 420 : 620, SHR = 900; GL.setDetail(R0);
  const ex = cam.x, ez = cam.z, shadows = GL.shadowsOn(); let n = 0;
  for (const c of DECOR.values()) {
    const dx = c.cx - ex, dz = c.cz - ez, d = Math.hypot(dx, dz); if (d > R0) continue;
    const visible = GL.boundsVisible(c.bounds), sh = shadows && d < SHR;
    if (!visible && !sh) continue;
    for (const g of c.g.values()) {
      if (g[0] && d < R0) { GL.pushInst(g[0].mesh, g[0].arr, g[0].n, !sh); n += g[0].n; }
      if (g[1] && d < R1 && (visible || (sh && d <= 600))) { GL.pushInst(g[1].mesh, g[1].arr, g[1].n, !sh || d > 600); n += g[1].n; }
      if (g[2] && d < R2 && visible) { GL.pushInst(g[2].mesh, g[2].arr, g[2].n, true); n += g[2].n; }
    }
  }
  decorStats = n;
}

// ---------------- animated characters ----------------
const CHARDEF = {
  Warrior: { atk: 'Sword_Attack', skill: 'Sword_Attack2', idle: ['Idle_Weapon', 'Idle'], run: ['Run_Weapon', 'Run'] },
  Ranger: { atk: 'Bow_Shoot', skill: 'Bow_Shoot', idle: ['Idle_Weapon', 'Idle'], run: ['Run_Holding', 'Run'] },
  Wizard: { atk: 'Staff_Attack', skill: 'Spell2', idle: ['Idle_Weapon', 'Idle'], run: ['Run_Weapon', 'Run'] },
  Rogue: { atk: 'Dagger_Attack', skill: 'Dagger_Attack2', idle: ['Attacking_Idle', 'Idle'], run: ['Run'] },
  Cleric: { atk: 'Staff_Attack', skill: 'Spell1', idle: ['Idle_Weapon', 'Idle'], run: ['Run'] },
  Monk: { atk: 'Attack', skill: 'Attack2', idle: ['Idle_Attacking', 'Idle'], run: ['Run'] },
};
const CLASSMODEL = { blade: 'Warrior', archer: 'Ranger', mage: 'Wizard' }, FAMMODEL = { sword: 'Warrior', bow: 'Ranger', staff: 'Wizard' };
const MOBCHAR = { bandit: { m: 'Rogue', sc: 1.05, tint: [1, .72, .68] }, goblin: { m: 'Rogue', sc: .8, tint: [.55, .95, .42] }, orc: { m: 'Monk', sc: 1.18, tint: [.6, .92, .48] }, voidknight: { m: 'Warrior', sc: 1.25, tint: [.52, .38, .8], emc: [.07, .01, .12] } };
if (window.Shardlands) { Shardlands.charModel = (mobType, def) => { MOBCHAR[mobType] = def; }; Shardlands.CHARS = CHARS; }
async function loadChars() { if (!GL.skinOK()) return; await Promise.all(Object.keys(CHARDEF).map(async n => { try { const md = await GL.loadGLB('assets/chars/' + n + '.glb'); md.def = CHARDEF[n]; md.pick = l => l.find(a => md.anims[a]) || Object.keys(md.anims)[0]; CHARS[n] = md; } catch (e) { console.warn('character ' + n + ' not loaded', e); } })); }
function classModel(cls) { const c = I && I.classes[cls]; const n = (c && c.model) || CLASSMODEL[cls] || FAMMODEL[c && c.fam] || 'Warrior'; return CHARS[n] ? n : null; }
// pick + advance an animation for entity e on character model md; o = { dead, skill, hitT }
function animChar(e, md, o, now) {
  const a = e.an || (e.an = { name: '', t: 0, prev: '', pt: 0, fade: 1, atkT: -1, sp: 1, loop: true });
  const def = md.def; let want, loop = true, speed = 1, restart = false;
  if (o.dead) { want = 'Death'; loop = false; }
  else if (now - e.atkT < 650) { want = e.skill ? def.skill : def.atk; loop = false; if (a.atkT !== e.atkT) { a.atkT = e.atkT; restart = true; } const d = md.anims[want] ? md.anims[want].dur : 1; speed = Math.max(1, d / .62); }
  else if (e.flash > now - 300 && e.mv < .2 && md.anims.RecieveHit) { want = 'RecieveHit'; loop = false; speed = 1.6; }
  else if (e.mv > .14) { want = md.pick(def.run); speed = .55 + .75 * e.mv; }
  else want = md.pick(def.idle);
  if (!md.anims[want]) want = md.pick(def.idle);
  if (want !== a.name || restart) { a.prev = a.name; a.pt = a.t; a.name = want; a.t = 0; a.fade = a.prev ? 0 : 1; }
  const an = md.anims[a.name], dur = an ? an.dur : 1, dtt = dt * speed;
  a.t += dtt; if (loop) a.t = dur > 0 ? a.t % dur : 0; else a.t = Math.min(a.t, dur - 0.001);
  const pa = md.anims[a.prev]; if (pa) { a.pt += dt; if (pa.dur > 0) a.pt %= pa.dur; } a.fade = Math.min(1, a.fade + dt / .14);
  if (!e.nodes || e.nodes.length !== md.N * 16 || e.nodesMd !== md) { e.nodes = new Float32Array(md.N * 16); e.nodesMd = md; }
  GL.pose(md, a.name, a.t, a.prev, a.pt, a.fade, e.nodes);
}
// draw a character; returns false if the model is not loaded (caller then uses the built-in model)
function drawChar(e, name, o, now) {
  const md = CHARS[name]; if (!md) return false; animChar(e, md, o, now);
  const sc = (o.h || 64) / md.height, fl = e.flash > now - 110;
  GL.drawSkinned(md, e.nodes, e.rx, -md.minY * sc, e.ry, e.yaw, sc, o.tint, fl ? [.45, .45, .45] : o.rage ? [.22, .03, 0] : o.emc, o.alpha, o.wemc);
  if (!GL.shadowsOn()) D(M.disc, e.rx, 1, e.ry, 16 * (o.h || 64) / 64, 1, 16 * (o.h || 64) / 64, 0, 0, [0, 0, 0], 0, .3);
  return true;
}

// ---------------- combat effects ----------------
const CLR = { blade: [1, .97, .88], archer: [1, .9, .55], mage: [.78, .5, 1], heal: [.4, 1, .6], lvl: [1, .9, .3], rage: [1, .3, .2], buff: [.5, .8, 1], summon: [.75, .35, 1], monster: [1, .25, .2] };
const BREATHC = { elderdrake: [1, .45, .1], frostwyrm: [.6, .9, 1], abyssalwyrm: [.75, .25, 1] };
function fxPush(o) { o.t0 = performance.now(); fxs.push(o); return o; }
function isMelee(cls) { return cls === 'blade' || !(['archer', 'mage'].includes(cls)) && ((I.classes[cls] || {}).range || 40) < 100; }
function fxAttack(f, E) { // basic attacks: sword slash / arrow / magic bolt
  const yaw = Math.atan2(f.tx - f.x, f.ty - f.y);
  if (isMelee(f.s)) { const col = f.s === 'blade' ? CLR.blade : [1, .45, .35]; fxPush({ k: 'slash', x: f.tx - Math.sin(yaw) * 10, z: f.ty - Math.cos(yaw) * 10, yaw, col, dur: 230, r: 36, roll: (Math.random() - .5) * 1.4 }); burst(f.tx, 28, f.ty, 6, col, 150, .35, 1.5, 1); sfx('hit', f.tx, f.ty); }
  else if (f.s === 'archer') { fxPush({ k: 'arrow', x: f.x, z: f.y, x1: f.tx, z1: f.ty, dur: 190, h: 44 }); sfx('shot', f.x, f.y); }
  else { fxPush({ k: 'bolt', x: f.x, z: f.y, x1: f.tx, z1: f.ty, dur: 240, h: 50, col: CLR.mage }); sfx('magic', f.x, f.y); }
}
function fxSkill(f, E) {
  const c = CLR[f.s] || [1, 1, 1], yaw = E ? E.yaw : 0;
  if (f.s === 'blade' || (isMelee(f.s) && I.classes[f.s] && !['heal', 'lvl', 'rage', 'buff', 'summon'].includes(f.s))) { fxPush({ k: 'whirl', x: f.x, z: f.y, r: f.v, dur: 520, col: f.s === 'blade' ? CLR.blade : [1, .45, .35] }); addRing(f.x, f.y, f.v * .3, f.v, [.85, .8, .7], 420, 3, .2); burst(f.x, 8, f.y, 24, [.7, .65, .55], 220, .6, 2.4, .1, 500); sfx('skill', f.x, f.y); return; }
  if (f.s === 'archer') { for (let i = 0; i < 9; i++) { const a = yaw + (i - 4) * .2; fxPush({ k: 'arrow', x: f.x, z: f.y, x1: f.x + Math.sin(a) * f.v, z1: f.y + Math.cos(a) * f.v, dur: 260 + i * 12, h: 44 }); } sfx('shot', f.x, f.y); sfx('shot', f.x, f.y); return; }
  if (f.s === 'mage') { fxPush({ k: 'nova', x: f.x, z: f.y, r: f.v, dur: 560, col: CLR.mage }); burst(f.x, 30, f.y, 40, CLR.mage, 300, .7, 2.4, 1, 0); sfx('magic', f.x, f.y); sfx('skill', f.x, f.y); return; }
  if (f.s === 'heal') { addRing(f.x, f.y, 8, f.v, c, 600, 3); for (let i = 0; i < 18; i++) fxPush({ k: 'rise', x: f.x + (Math.random() - .5) * 40, z: f.y + (Math.random() - .5) * 40, dur: 900 + Math.random() * 400, col: c, h0: Math.random() * 20 }); sfx('heal', f.x, f.y); return; }
  if (f.s === 'rage') { addRing(f.x, f.y, 10, f.v * 1.2, c, 500, 3); burst(f.x, 20, f.y, 40, [1, .35, .1], 200, .8, 2.6, 1, -120); sfx('skill', f.x, f.y); return; }
  if (f.s === 'lvl') { fxPush({ k: 'pillar', x: f.x, z: f.y, dur: 1300, col: c }); addRing(f.x, f.y, 10, f.v, c, 1100, 3); burst(f.x, 20, f.y, 50, c, 260, 1.2, 2.4, 1, 280); sfx('lvl'); return; }
  if (f.s === 'summon') { fxPush({ k: 'portal', x: f.x, z: f.y, r: f.v, dur: 900, col: c }); burst(f.x, 10, f.y, 30, c, 160, 1, 2, 1, -150); return; }
  addRing(f.x, f.y, f.v * .25, f.v, c, 550, 3); burst(f.x, 20, f.y, 14, c, 140, .9, 3, .9, 260); sfx('heal', f.x, f.y);
}
function fxClaw(x, z, yaw) { for (let i = -1; i <= 1; i++) fxPush({ k: 'slash', x: x + Math.cos(yaw) * i * 7, z: z - Math.sin(yaw) * i * 7, yaw: yaw + Math.PI, col: [1, .2, .15], dur: 200, r: 18, roll: 1.2, thin: 1 }); }
function fxWarn(f) {
  const s = f.s || 'slam', dur = s === 'meteor' ? 1450 : s === 'pulse' ? 1300 : 1150;
  if (s === 'breath') fxPush({ k: 'tcone', x: f.x, z: f.y, r: f.v, ang: f.ang, dur });
  else if (s === 'charge') fxPush({ k: 'tline', x: f.x, z: f.y, x1: f.tx, z1: f.ty, r: f.v, dur });
  else if (s === 'meteor') for (const p of f.pts || []) fxPush({ k: 'tele', x: p[0], z: p[1], r: f.v, dur });
  else if (s === 'summon') fxPush({ k: 'portal', x: f.x, z: f.y, r: 120, dur, col: CLR.summon });
  else fxPush({ k: 'tele', x: f.x, z: f.y, r: f.v, dur, col: s === 'pulse' ? null : null });
  sfx('warn', f.x, f.y);
}
function fxSlam(f) {
  const s = f.s || 'slam', near = Math.hypot(S.rx - f.x, S.ry - f.y) < (f.v || 100) + 350;
  if (s === 'breath') { const c = BREATHC[f.ty] || [1, .5, .1]; for (let i = 0; i < 90; i++) { const a = f.ang + (Math.random() * 2 - 1) * (f.half || .55), sp = 250 + Math.random() * 380; parts.push({ x: f.x + Math.sin(f.ang) * 30, y: 40, z: f.y + Math.cos(f.ang) * 30, vx: Math.sin(a) * sp, vy: 30 * Math.random(), vz: Math.cos(a) * sp, t0: performance.now(), life: .55 + Math.random() * .4, col: Math.random() < .5 ? c : mix(c, [1, 1, .8], .5), size: 5 + Math.random() * 6, emis: 1, g: -20 }); } sfx('slam', f.x, f.y); if (near) cam.shake = 5; return; }
  if (s === 'charge') { const L = Math.hypot(f.x - f.x0, f.y - f.y0); for (let i = 0; i < 24; i++) { const k = i / 24; burst(f.x0 + (f.x - f.x0) * k, 6, f.y0 + (f.y - f.y0) * k, 1, [.6, .5, .4], 80, .8, 3, .05, 200); } addRing(f.x, f.y, 10, 110, [1, .7, .4], 420, 3); sfx('slam', f.x, f.y); if (near) cam.shake = 7; return; }
  if (s === 'meteor') { for (const p of f.pts || []) fxPush({ k: 'meteor', x: p[0], z: p[1], r: f.v, dur: 320, col: f.ty === 'voidlord' || f.ty === 'deathlord' ? [.6, .2, 1] : [1, .45, .1] }); return; }
  if (s === 'summon') { fxPush({ k: 'portal', x: f.x, z: f.y, r: 140, dur: 700, col: CLR.summon }); burst(f.x, 10, f.y, 40, CLR.summon, 220, 1, 2.4, 1, -120); return; }
  if (s === 'pulse') { const c = [.4, .85, 1]; addRing(f.x, f.y, 20, f.v, c, 500, 4); addRing(f.x, f.y, 10, f.v * .7, [1, 1, 1], 380, 12); burst(f.x, 30, f.y, 40, c, 300, .7, 2.4, 1, 0); sfx('slam', f.x, f.y); if (near) cam.shake = 4; return; }
  addRing(f.x, f.y, 10, f.v, [1, .35, .15], 600, 3); addRing(f.x, f.y, 10, f.v * .7, [1, .8, .4], 450, 10); burst(f.x, 8, f.y, 40, [.55, .45, .35], 260, 1, 3, .1, 700); sfx('slam', f.x, f.y); if (near) cam.shake = 9;
}
// draw one effect; return true if handled
function drawFx2(f, a, now) {
  switch (f.k) {
    case 'slash': { const r = f.r * (.6 + a * .6); D(M.arc, f.x, 30, f.z, r, 1, r * (f.thin ? .5 : 1), f.yaw + (a - .5) * 1.6, -.9, f.col, 1, (1 - a) * .9, f.roll); return true; }
    case 'whirl': { for (let i = 0; i < 3; i++) { const ang = now / 70 + i * 2.094; D(M.arc, f.x, 24 + i * 6, f.z, f.r * .75, 1, f.r * .75, ang, 0, f.col, 1, (1 - a) * .85); } return true; }
    case 'arrow': { const x = f.x + (f.x1 - f.x) * a, z = f.z + (f.z1 - f.z) * a, yaw = Math.atan2(f.x1 - f.x, f.z1 - f.z), y = f.h + Math.sin(a * Math.PI) * 14, pit = -Math.cos(a * Math.PI) * .35;
      D(M.box, x, y, z, 1.3, 1.3, 26, yaw, pit, [.55, .4, .25]); D(M.cone, x + Math.sin(yaw) * 13, y, z + Math.cos(yaw) * 13, 1.6, 5, 1.6, yaw, 1.5708 + pit, [.85, .85, .9], .3); D(M.box, x - Math.sin(yaw) * 11, y, z - Math.cos(yaw) * 11, .4, 3.2, 5, yaw, pit, [1, .95, .8], .4);
      if (Math.random() < .5) parts.push({ x, y, z, vx: 0, vy: 0, vz: 0, t0: now, life: .25, col: [1, .95, .7], size: 1.2, emis: 1, g: 0 }); if (a > .97 && !f.hit) { f.hit = 1; burst(f.x1, f.h, f.z1, 6, [1, .9, .6], 120, .35, 1.4, 1); } return true; }
    case 'bolt': { const x = f.x + (f.x1 - f.x) * a, z = f.z + (f.z1 - f.z) * a, y = f.h + Math.sin(a * Math.PI) * 18; D(M.ball, x, y, z, 5.5, 5.5, 5.5, 0, 0, f.col, 1); D(M.ball, x, y, z, 9, 9, 9, 0, 0, f.col, 1, .25);
      for (let i = 0; i < 2; i++) { const t = now / 60 + i * 3.14; D(M.ball, x + Math.cos(t) * 8, y + Math.sin(t) * 8, z, 1.8, 1.8, 1.8, 0, 0, [1, .85, 1], 1); }
      parts.push({ x, y, z, vx: (Math.random() - .5) * 30, vy: (Math.random() - .5) * 30, vz: (Math.random() - .5) * 30, t0: now, life: .4, col: f.col, size: 2, emis: 1, g: 0 });
      if (a > .97 && !f.hit) { f.hit = 1; addRing(f.x1, f.z1, 6, 34, f.col, 300, 30); burst(f.x1, f.h, f.z1, 14, f.col, 170, .45, 1.8, 1, 0); } return true; }
    case 'nova': { const r = f.r * Math.min(1, a * 1.5); D(M.ball, f.x, 10, f.z, r, r * .55, r, 0, 0, f.col, 1, (1 - a) * .35); D(M.ring, f.x, 2.5, f.z, f.r * .55, 1, f.r * .55, now / 400, 0, f.col, 1, (1 - a) * .9);
      for (let i = 0; i < 6; i++) { const ang = now / 500 + i * 1.047; D(M.octa, f.x + Math.cos(ang) * f.r * .55, 6, f.z + Math.sin(ang) * f.r * .55, 3, 6, 3, ang, 0, [1, .85, 1], 1, 1 - a); } return true; }
    case 'rise': { D(M.octa, f.x, (f.h0 || 0) + a * 70, f.z, 2.2, 3, 2.2, a * 8, 0, f.col, 1, 1 - a); return true; }
    case 'pillar': { D(M.cyl, f.x, 0, f.z, 16 + a * 10, 220, 16 + a * 10, 0, 0, f.col, 1, (1 - a) * .35); return true; }
    case 'portal': { const pu = .85 + Math.sin(now / 90) * .15; D(M.ring, f.x, 2, f.z, f.r * pu, 1, f.r * pu, now / 300, 0, f.col, 1, (1 - a) * .9); D(M.disc, f.x, 1.5, f.z, f.r * .9, 1, f.r * .9, 0, 0, [.15, .03, .25], .4, (1 - a) * .55); if (Math.random() < .5) burst(f.x + (Math.random() - .5) * f.r, 4, f.z + (Math.random() - .5) * f.r, 1, f.col, 40, 1, 1.6, 1, -90); return true; }
    case 'tele': { D(M.disc, f.x, 1.6, f.z, f.r * a, 1, f.r * a, 0, 0, [1, .12, .08], .8, .22 + .25 * a); D(M.ring, f.x, 1.9, f.z, f.r, 1, f.r, now / 300, 0, [1, .2, .1], 1, .5 + .4 * Math.sin(now / 60)); return true; }
    case 'tcone': { const k = f.r * (.3 + .7 * a); D(M.fan, f.x, 1.7, f.z, k, 1, k, f.ang, 0, [1, .15, .08], .8, .2 + .3 * a); D(M.fan, f.x, 1.5, f.z, f.r, 1, f.r, f.ang, 0, [1, .2, .1], 1, .18 + .1 * Math.sin(now / 60)); return true; }
    case 'tline': {
      const length = Math.hypot(f.x1 - f.x, f.z1 - f.z);
      const yaw = Math.atan2(f.x1 - f.x, f.z1 - f.z);
      const color = [1, .15, .08], opacity = .25 + .25 * a;
      D(M.disc, f.x, 1.6, f.z, f.r, 1, f.r, 0, 0, color, .8, opacity);
      if (length > 0) {
        D(M.box, (f.x + f.x1) / 2, 1.6, (f.z + f.z1) / 2, 2 * f.r, 1, length, yaw, 0, color, .8, opacity);
        D(M.disc, f.x1, 1.6, f.z1, f.r, 1, f.r, 0, 0, color, .8, opacity);
        for (let i = 1; i < 4; i++) {
          const fraction = i / 4;
          D(M.cone, f.x + (f.x1 - f.x) * fraction, 2.5, f.z + (f.z1 - f.z) * fraction, 10, 1, 16, yaw, 1.5708, [1, .3, .15], 1, .5);
        }
      }
      return true;
    }
    case 'meteor': { const y = 600 * (1 - a); D(M.rock, f.x, y + 10, f.z, 16, 16, 16, now / 200, 0, f.col, .9); if (Math.random() < .8) parts.push({ x: f.x + (Math.random() - .5) * 10, y: y + 20, z: f.z, vx: 0, vy: 60, vz: 0, t0: now, life: .5, col: f.col, size: 4, emis: 1, g: 0 });
      if (a > .96 && !f.hit) { f.hit = 1; addRing(f.x, f.z, 10, f.r * 1.2, f.col, 500, 3); burst(f.x, 10, f.z, 36, f.col, 280, .8, 3, 1, 500); burst(f.x, 10, f.z, 16, [.35, .3, .28], 200, 1, 3, .05, 600); sfx('slam', f.x, f.z); if (Math.hypot(S.rx - f.x, S.ry - f.z) < 300) cam.shake = 6; } return true; }
  }
  return false;
}
