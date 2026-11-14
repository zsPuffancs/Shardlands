'use strict';
// Builds the sculpted basic-enemy models: node scripts/boss-forge/build-enemies.js [skeleton ...] (all when none given).
// Writes public/assets/enemies/<id>-n.glb (normal) and <id>-a.glb (Alpha), each with a -far distance/shadow model.
// Deterministic; never hand-edit the output.
const fs = require('fs'), path = require('path'), F = require('./forge');
const OUT = path.join(__dirname, '../../public/assets/enemies'), C = require('./canines'), M = require('./critters');
const ENEMIES = { skeleton: require('./skeleton'), wolf: C.make('wolf'), frostwolf: C.make('frostwolf'), hellhound: C.make('hellhound'), frostfang: C.make('frostfang'), slime: M.slime, boar: M.boar, shroom: M.shroom, goblin: require('./goblin'), orc: require('./gloom').orc, spider: require('./gloom').spider };
Object.assign(ENEMIES, require('./lateenemies'));
for (const look of require('./bandit').LOOKS) ENEMIES['bandit-' + look] = require('./bandit').make(look);
fs.mkdirSync(OUT, { recursive: true });
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ENEMIES);
for (const id of ids) for (const v of [0, 1]) for (const lod of [0, 1]) {
  const r = ENEMIES[id].build(v, { lod }), file = id + '-' + 'na'[v] + (lod ? '-far' : '') + '.glb', buf = F.writeGLB(r.parts, r.bones, r.clips);
  fs.writeFileSync(path.join(OUT, file), buf); console.log(file, (buf.length / 1024 | 0) + ' KB', r.log.join(' | '));
}
