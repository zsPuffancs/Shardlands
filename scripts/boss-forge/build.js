'use strict';
// Builds the premium World Boss models into public/assets/bosses/ (generated files: rebuild, never hand-edit).
//   node scripts/boss-forge/build.js [boss ...]     e.g. node scripts/boss-forge/build.js varcolac
// Each boss module exports build(variant, { lod }) -> { parts, bones, clips, log }. Two files per variant:
// <id>-<a|b|c>.glb (full detail, skeleton and clips) and <id>-<a|b|c>-far.glb (distance and shadow mesh, same skeleton).
const fs = require('fs'), path = require('path'), F = require('./forge');
const OUT = path.join(__dirname, '../../public/assets/bosses'), BOSSES = { varcolac: require('./varcolac'), devourer: require('./devourer'), oni: require('./oni'), jarl: require('./jarl'), ossuary: require('./ossuary'), reaper: require('./reaper'), sovereign: require('./sovereign') };
fs.mkdirSync(OUT, { recursive: true });
for (const id of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(BOSSES)) for (let v = 0; v < 3; v++) for (const lod of [0, 1]) {
  const t = Date.now(), r = BOSSES[id].build(v, { lod }), glb = F.writeGLB(r.parts, r.bones, lod ? null : r.clips), file = id + '-' + 'abc'[v] + (lod ? '-far' : '') + '.glb';
  fs.writeFileSync(path.join(OUT, file), glb);
  console.log(file, (glb.length / 1048576).toFixed(2) + ' MB', r.log.join(' | '), (Date.now() - t) + ' ms');
}
