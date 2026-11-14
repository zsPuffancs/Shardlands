'use strict';
// Basic enemies: sculpted, rigged models (scripts/boss-forge -> assets/enemies) drawn by the engine's hero path at an
// ordinary-enemy budget. Purely visual: a normal monster draws variant 'n', an Alpha draws variant 'a' (the existing
// Alpha flag, nothing new); the model is scaled to the height of the primitive model it replaces, so nameplates, hit
// circles and hitboxes are unchanged. Only enemies near the camera (and at most MAX_NEAR of them) use the sculpted
// model; farther ones keep the cheap primitive stand-in. A dying enemy plays its Death clip where it fell.
(function () {
  const BOSSES = {
    skeleton: { file: 'skeleton', height: 83, rim: [[.06, .08, .08], [.05, .12, .12]], fx: [[.35, 1, 1], [.3, 1, .9]] },
  };
  const DEF = { atk: 'Attack', skill: 'Attack2', idle: ['Idle'], run: ['Run'] };
  const MODELS = new Map(), seen = new Map(), ghosts = [];
  const ok = () => typeof GL !== 'undefined' && GL.heroOK && GL.heroOK() && GL.pose;
  const MAX_NEAR = 40, NEAR = 420; let drawn = 0, frameAt = 0;

  function load(file) {
    const have = MODELS.get(file); if (have !== undefined) return typeof have === 'object' ? have : null;
    if (!ok()) { MODELS.set(file, 'failed'); return null; }
    MODELS.set(file, 'loading');
    Promise.all([GL.loadGLB('assets/enemies/' + file + '.glb'), GL.loadGLB('assets/enemies/' + file + '-far.glb').catch(() => null)]).then(([md, far]) => {
      md.def = DEF; md.pick = list => list.find(a => md.anims[a]) || Object.keys(md.anims)[0]; MODELS.set(file, { md, far });
    }).catch(err => { console.warn('Region Boss model ' + file + ' not loaded', err); MODELS.set(file, 'failed'); });
    return null;
  }
  // the scale that gives the new model the old model's height
  const scaleFor = (def, o) => ((o.top || 60) * (o.sc || 1) * .9) / def.height;

  // draw a living Region Boss; false = not premium / not loaded (the caller draws the primitive model)
  function draw(e, t, m, o) {
    // a World Boss with its own dedicated look (m.wl) keeps it; a boss type that is also this universe's World Boss
    // but has no dedicated look gets the sculpted model too (scaled like its primitive model)
    const def = BOSSES[m.ty]; if (!def || t.boss || t.st || m.wl || typeof animChar !== 'function') return false;
    const now = performance.now(); if (now !== frameAt) { frameAt = now; drawn = 0; }
    if (drawn >= MAX_NEAR || (typeof cam !== 'undefined' && Math.hypot(e.rx - cam.x, e.ry - cam.z) > NEAR)) return false;
    const v = m.al ? 1 : 0, hm = load(def.file + '-' + 'na'[v]); if (!hm) return false; drawn++;
    const sc = scaleFor(def, o) * (m.al ? 1.3 : 1);
    animChar(e, hm.md, { dead: false }, now);
    const far = hm.far && typeof cam !== 'undefined' && Math.hypot(e.rx - cam.x, e.ry - cam.z) > 640;
    GL.drawHero(far ? hm.far : hm.md, e.nodes, e.rx, 0, e.ry, e.yaw, sc, { rim: def.rim[v], emc: e.flash > now - 110 ? [.4, .4, .4] : null, shadow: hm.far || undefined });
    seen.set(m.id, { x: e.rx, z: e.ry, yaw: e.yaw, ty: m.ty, v, sc, t: now });
    if (!far && typeof burst === 'function' && now - e.atkT < 120 && !e.fxAt) { e.fxAt = 1; const c = Math.cos(e.yaw), s = Math.sin(e.yaw); burst(e.rx + s * 30 * sc, 30 * sc, e.ry + c * 30 * sc, 14, def.fx[v], 120, .5, 1.6, 1, 200); }
    if (now - e.atkT >= 120) e.fxAt = 0;
    return true;
  }
  // a Region Boss died at x, z: its Death clip plays where it fell, then it sinks away
  function died(x, z, ty) {
    const def = BOSSES[ty]; if (!def) return false;
    let hit = null; for (const [id, s] of seen) if (s.ty === ty && Math.hypot(s.x - x, s.z - z) < 60) { hit = s; seen.delete(id); break; }
    if (!hit) return false; const hm = load(def.file + '-' + 'na'[hit.v]); if (!hm) return false;
    ghosts.push({ md: hm.md, x: hit.x, z: hit.z, yaw: hit.yaw, sc: hit.sc, v: hit.v, def, t0: performance.now(), nodes: new Float32Array(hm.md.N * 16) });
    return true;
  }
  function frame() {
    const now = performance.now();
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i], s = (now - g.t0) / 1000, dur = (g.md.anims.Death && g.md.anims.Death.dur) || 1.8; if (s > dur + 1.4) { ghosts.splice(i, 1); continue; }
      GL.pose(g.md, 'Death', Math.min(s, dur - .001), null, 0, 1, g.nodes);
      const sink = Math.max(0, s - dur - .4) * 30 * g.sc;
      GL.drawHero(g.md, g.nodes, g.x, -sink, g.z, g.yaw, g.sc, { rim: g.def.rim[g.v] });
      if (s > dur - .2 && !g.dust && typeof burst === 'function') { g.dust = 1; burst(g.x, 6, g.z, 40, [.4, .37, .32], 140, 1.2, 3, 0, 200); }
    }
    if (seen.size > 300) for (const [k, s] of seen) if (now - s.t > 15000) seen.delete(k);
  }
  window.EnemyModels = { ENEMIES: BOSSES, draw, died, frame, scaleFor, MAX_NEAR, NEAR };
})();
