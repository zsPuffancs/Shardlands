#!/usr/bin/env node
'use strict';
// Vegetation report: what the client's bake places per biome look (big trees, mid layer, ground cover), how far apart
// the trees stand, how much ground is open, and how long the bake takes. Usage: node scripts/vegetation-report.js
const { bake, stats, TIERS } = require('../tests/helpers/vegetation-sim');
const NAMES = ['Meadows', 'Gloomwood/wildwood', 'Ashen/warfields', 'Ember/volcanic', 'Frostfang/glacier', 'Voidreach/voidscar', 'Death/necropolis'];
const row = (label, s, ms) => console.log(label.padEnd(30) + [s.km2, s.trees, s.perKm2, s.mid, s.small, s.nnMean, s.nnMin, Math.round(s.closeShare * 100) + '%', Math.round(s.open150 * 100) + '%', Math.round(s.open250 * 100) + '%', s.models].map(v => String(v).padStart(8)).join('') + (ms ? '   bake ' + ms.toFixed(0) + ' ms' : ''));
const head = () => console.log(''.padEnd(30) + ['km2', 'trees', '/km2', 'mid', 'ground', 'NN avg', 'NN min', '<60', 'open150', 'open250', 'kinds'].map(v => v.padStart(8)).join(''));
const runs = +(process.argv[2] || 3);
let best = 1e9, f; for (let i = 0; i < runs; i++) { const r = bake({ kind: 'founding' }); if (r.ms < best) { best = r.ms; f = r; } }
console.log(`Founding map (10600 x 10600), seed 1337. Bake (bakeDecor only, Node, best of ${runs}): ${best.toFixed(0)} ms; ${f.placed.length} pieces, ${f.far.length} far stand-ins`); head();
for (let z = 0; z < TIERS.length; z++) { const s = stats(f, z); if (s) row(TIERS[z].name, s); }
console.log('\nGenerated regions (5000 x 5000), one look each'); head();
for (let look = 0; look < 7; look++) { const r = bake({ kind: 'region', look }, 1337, 3); row(NAMES[look], stats(r, look), r.ms); }
