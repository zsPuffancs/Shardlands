#!/usr/bin/env node
'use strict';
// Rendering load of the vegetation around points in a biome, by the same rules as drawDecor (public/world.js) at high
// quality: instances inside the draw radii (trees 1450, mid layer 1000, ground cover 620), their vertex count, and the
// trees casting shadows (within 900). Compares the look's new distribution with the uniform scatter for that look.
// Usage: node scripts/vegetation-load.js [look=1]
const fs = require('fs'), path = require('path');
const { bake } = require('../tests/helpers/vegetation-sim');
const look = +(process.argv[2] || 1), nat = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/assets/nature.json'), 'utf8')).models;
const verts = name => nat[name].parts.reduce((s, p) => s + p.count, 0);
function load(run) {
  const pts = []; for (let x = 200; x < run.W; x += 400) for (let z = 200; z < run.H; z += 400) if (run.zoneOf(x, z) === look) pts.push([x, z]);
  const acc = { trees: 0, mid: 0, ground: 0, treeVerts: 0, allVerts: 0, shadowTrees: 0 };
  for (const [x, z] of pts) for (const p of run.placed) {
    const d = Math.hypot(p.x - x, p.z - z), R = p.cat === 0 ? 1450 : p.cat === 1 ? 1000 : 620; if (d > R) continue;
    const v = verts(p.name); acc.allVerts += v;
    if (p.cat === 0) { acc.trees++; acc.treeVerts += v; if (d < 900) acc.shadowTrees++; } else if (p.cat === 1) acc.mid++; else acc.ground++;
  }
  for (const k in acc) acc[k] = Math.round(acc[k] / pts.length);
  return { points: pts.length, ...acc, farStandIns: run.far.length };
}
const others = () => require('../public/vegetation').LOOKS.filter(l => l !== look); // before = this look on the uniform scatter, the others as they are now
const t = (label, map) => { const before = load(bake(map, 1337, 3, { looks: others() })), after = load(bake(map, 1337, 3)); console.log(label); for (const k of Object.keys(after)) console.log('  ' + k.padEnd(12) + String(before[k]).padStart(10) + String(after[k]).padStart(10) + (k !== 'points' ? ('   ' + ((after[k] / before[k] - 1) * 100).toFixed(0) + '%').padStart(8) : '')); };
console.log('average per camera position (before = uniform scatter, after = vegetation.js)       before     after');
t('Founding map, look ' + look + ' ring', { kind: 'founding' });
if (look !== 0) t('Generated region of look ' + look, { kind: 'region', look });
