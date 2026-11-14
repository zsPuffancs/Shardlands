'use strict';
// Builds the Metin Stone models: node scripts/boss-forge/build-metin.js [meadows ...] (all when none given).
// Writes public/assets/metin/<id>.glb (full detail, with the Intact/Damaged/Near/Break clips) and <id>-far.glb
// (distance and shadow model). Deterministic; never hand-edit the output.
const fs = require('fs'), path = require('path'), F = require('./forge'), M = require('./metin');
const OUT = path.join(__dirname, '../../public/assets/metin');
fs.mkdirSync(OUT, { recursive: true });
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(M.DESIGNS);
for (const id of ids) for (const lod of [0, 1]) {
  const r = M.build(id, { lod }), file = id + (lod ? '-far' : '') + '.glb', buf = F.writeGLB(r.parts, r.bones, r.clips);
  fs.writeFileSync(path.join(OUT, file), buf); console.log(file, (buf.length / 1048576).toFixed(2) + ' MB', r.log.join(' | '));
}
