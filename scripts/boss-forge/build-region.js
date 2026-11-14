'use strict';
// Builds the Region Boss models: node scripts/boss-forge/build-region.js [warlord ...] (all when none given).
// Writes public/assets/region-bosses/<id>-<a|b|c>.glb (full detail with clips) and <id>-<v>-far.glb (distance and
// shadow model). Deterministic; never hand-edit the output.
const fs = require('fs'), path = require('path'), F = require('./forge');
const OUT = path.join(__dirname, '../../public/assets/region-bosses'), BOSSES = { warlord: require('./warlord'), boneking: require('./boneking'), ogrechief: require('./ogrechief'), yetiking: require('./yetiking'), voidlord: require('./voidlord'), deathlord: require('./deathlord'), alphawolf: require('./alphawolf'), kingslime: require('./kingslime'), broodmother: require('./broodmother') };
fs.mkdirSync(OUT, { recursive: true });
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(BOSSES);
for (const id of ids) for (const v of [0, 1, 2]) for (const lod of [0, 1]) {
  const r = BOSSES[id].build(v, { lod }), file = id + '-' + 'abc'[v] + (lod ? '-far' : '') + '.glb', buf = F.writeGLB(r.parts, r.bones, r.clips);
  fs.writeFileSync(path.join(OUT, file), buf); console.log(file, (buf.length / 1048576).toFixed(2) + ' MB', r.log.join(' | '));
}
