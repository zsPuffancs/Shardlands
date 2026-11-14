'use strict';
// Region Bosses: sculpted, rigged models (scripts/boss-forge -> assets/region-bosses) drawn by the engine's hero path,
// three visual variants each. Purely visual: the variant follows the monster's id (the same on every client), the
// model is scaled to the height of the primitive model it replaces (nameplate, hit circle and hitbox are unchanged),
// and animations follow the state every client already sees (moving, attacking, hit, special attacks). When a boss
// dies its Death clip plays where it fell. Until a model has loaded, or without the hero renderer, the original
// primitive model is drawn.
(function () {
  const BOSSES = {
    // type: { file, height: the GLB's standing height in model units, fx: effect colour per variant, rim per variant }
    warlord: { file: 'warlord', height: 88, rim: [[.06, .1, .04], [.16, .03, .02], [.05, .14, .08]], fx: [[1, .6, .2], [1, .25, .1], [.35, 1, .55]] },
    boneking: { file: 'boneking', height: 86, rim: [[.12, .08, .04], [.05, .14, .07], [.05, .14, .1]], fx: [[1, .8, .4], [.4, 1, .55], [.45, 1, .75]] },
    ogrechief: { file: 'ogrechief', height: 78, rim: [[.1, .06, .14], [.16, .06, .03], [.05, .1, .18]], fx: [[.9, .7, .4], [1, .45, .2], [.4, .8, 1]] },
    yetiking: { file: 'yetiking', height: 88, rim: [[.08, .12, .18], [.06, .12, .2], [.06, .16, .14]], fx: [[.8, .92, 1], [.5, .85, 1], [.45, 1, .8]] },
    voidlord: { file: 'voidlord', height: 96, rim: [[.12, .04, .18], [.16, .04, .2], [.1, .08, .2]], fx: [[.85, .35, 1], [1, .3, 1], [.7, .65, 1]] },
    deathlord: { file: 'deathlord', height: 87, rim: [[.05, .12, .07], [.05, .14, .08], [.07, .1, .16]], fx: [[.35, 1, .55], [.3, 1, .6], [.55, .85, 1]] },
    alphawolf: { file: 'alphawolf', height: 49, rim: [[.08, .08, .1], [.16, .05, .03], [.06, .12, .18]], fx: [[.85, .85, .9], [1, .35, .15], [.45, .85, 1]] },
    kingslime: { file: 'kingslime', height: 47, rim: [[.06, .16, .06], [.08, .14, .02], [.18, .12, .02]], fx: [[.6, 1, .5], [.65, 1, .2], [1, .85, .45]] },
    broodmother: { file: 'broodmother', height: 36, rim: [[.12, .04, .14], [.06, .14, .04], [.12, .08, .2]], fx: [[1, .35, .3], [.55, 1, .2], [.75, .55, 1]] },
  };
  const DEF = { atk: 'Attack', skill: 'Attack2', idle: ['Idle'], run: ['Run'] };
  const MODELS = new Map(), seen = new Map(), ghosts = [];
  const ok = () => typeof GL !== 'undefined' && GL.heroOK && GL.heroOK() && GL.pose;
  const variantOf = id => ((id || 0) % 3 + 3) % 3;

  function load(file) {
    const have = MODELS.get(file); if (have !== undefined) return typeof have === 'object' ? have : null;
    if (!ok()) { MODELS.set(file, 'failed'); return null; }
    MODELS.set(file, 'loading');
    Promise.all([GL.loadGLB('assets/region-bosses/' + file + '.glb'), GL.loadGLB('assets/region-bosses/' + file + '-far.glb').catch(() => null)]).then(([md, far]) => {
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
    const def = BOSSES[m.ty]; if (!def || m.wl || typeof animChar !== 'function') return false;
    const v = variantOf(m.id), hm = load(def.file + '-' + 'abc'[v]); if (!hm) return false;
    const now = performance.now(), sc = scaleFor(def, o);
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
    if (!hit) return false; const hm = load(def.file + '-' + 'abc'[hit.v]); if (!hm) return false;
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
  window.RegionBossModels = { BOSSES, draw, died, frame, variantOf, scaleFor };
})();
