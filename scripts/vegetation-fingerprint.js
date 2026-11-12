#!/usr/bin/env node
'use strict';
// Fingerprints of the vegetation bake per biome look (founding map rings and generated regions), and of the random
// stream position after it (the zone specials and lava pools that follow use the same stream). Used by the tests to
// prove that biomes not yet moved to the new distribution are unchanged. Usage: node scripts/vegetation-fingerprint.js [out.json]
const crypto = require('crypto'), fs = require('fs');
const { bake, TIERS } = require('../tests/helpers/vegetation-sim');
function fingerprint() {
  const out = {}, h = list => crypto.createHash('md5').update(JSON.stringify(list.map(p => [p.name, +p.x.toFixed(2), +p.z.toFixed(2), +p.size.toFixed(2), +p.yaw.toFixed(3), p.cat]))).digest('hex');
  const f = bake({ kind: 'founding' });
  for (let z = 0; z < TIERS.length; z++) out['founding:' + z] = h(f.placed.filter(p => f.zoneOf(p.x, p.z) === z));
  out['founding:village-farm'] = h(f.placed.filter(p => f.zoneOf(p.x, p.z) < 0));
  out['founding:streamAfter'] = f.seedAfter;
  for (let look = 0; look < 7; look++) { const r = bake({ kind: 'region', look }, 1337, 3); out['region:' + look] = h(r.placed); out['region:' + look + ':streamAfter'] = r.seedAfter; }
  return out;
}
module.exports = { fingerprint };
if (require.main === module) { const fp = fingerprint(); const file = process.argv[2]; if (file) fs.writeFileSync(file, JSON.stringify(fp, null, 1) + '\n'); else console.log(fp); }
