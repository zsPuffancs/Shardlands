#!/usr/bin/env node
'use strict';
// Equipment fit report: worst penetration into the body and worst gap per piece, over every animation of the model.
// Usage: node scripts/gear-report.js [set] [samplesPerAnim]
const path = require('path');
const { loadRig, pose } = require('../tests/helpers/glb-rig');
const { checkVariant, frames } = require('../tests/helpers/gear-check');
const Kit = require('../public/equipment-kit');
const setKey = process.argv[2] || 'bandit', n = +(process.argv[3] || 9), set = Kit.SETS[setKey];
const rig = loadRig(path.join(__dirname, '../public/assets/chars', set.model + '.glb'));
const R = { names: rig.names, parent: Array.from(rig.parent), joints: rig.joints, ibm: rig.ibm, prims: rig.prims, rest: pose(rig, null, 0) };
// ANIMS=Run,Death limits the check to some animations
const ANIMS = process.env.ANIMS ? process.env.ANIMS.split(',') : null, fr = frames(rig, n, ANIMS);
for (const v of Object.keys(set.variants)) {
  const b = Kit.bake(R, setKey, v, false);
  const res = checkVariant(rig, b, b.parts.map((p, i) => ({ name: i + ':' + p.piece + (p.mirrored ? '(R)' : ''), range: p.range, weapon: p.weapon })), fr);
  console.log(`\n${v}  (${b.tris} tris)`);
  for (const [k, r] of Object.entries(res)) console.log(`  ${k.padEnd(20)} pen ${r.pen.toFixed(3)} ${r.penAt.padEnd(22)} into ${(r.penBone || '-').padEnd(11)} ${JSON.stringify(r.penP || '')}  gap ${r.gap.toFixed(3)} ${r.gapAt}`);
}

// baseline: the model's own props measured the same way (what the original art already does)
const { propAsGear } = require('../tests/helpers/gear-check');
console.log('\nbaseline (the model\'s own props, each checked against the body)');
for (const p of rig.prims.filter(q => !q.skinned)) {
  const d = propAsGear(rig, R.rest, p.nodeName, Kit.inv), r = checkVariant(rig, d, [Object.assign({ weapon: /Dagger/.test(p.nodeName) }, d.part)], fr)[d.part.name];
  console.log(`  ${d.part.name.padEnd(20)} pen ${r.pen.toFixed(3)} ${r.penAt.padEnd(22)} gap ${r.gap.toFixed(3)}`);
}
