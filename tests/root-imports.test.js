'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { audit, analyzeSource, legacyMap } = require('../scripts/audit-root-imports');
const { createHistoricalRequire } = require('../scripts/historical-imports');
const ROOT = path.resolve(__dirname, '..');

test('all legacy root wrappers are retired, canonical targets remain and source imports do not use old paths', () => {
  const report = audit();
  assert.equal(report.wrappers.length, 44);
  assert.deepEqual(report.legacyImports, []);
  assert.deepEqual(fs.readdirSync(ROOT).filter(file => file.endsWith('.js')).sort(), ['local-server.js', 'server.js']);
  for (const [legacy, target] of Object.entries(legacyMap)) {
    assert.equal(fs.existsSync(path.join(ROOT, legacy)), false, legacy);
    assert.equal(fs.existsSync(path.join(ROOT, target)), true, target);
  }
});

test('AST audit distinguishes real imports from examples and reports dynamic calls for manual review', () => {
  const example = fs.readFileSync(path.join(__dirname, 'fixtures/root-import-examples.txt'), 'utf8');
  const result = analyzeSource(example, 'tests/example.js');
  assert.deepEqual(result.legacyImports.map(row => row.implementation), ['src/combat/monsters.js', 'src/economy/equipment.js', 'src/progression/xp-economy.js']);
  assert.equal(result.dynamicImports.length, 1);
});

test('historical Git modules resolve retired relative imports locally without changing normal require', () => {
  const historical = new Module(path.join(ROOT, 'retired-historical-module.js'));
  historical.filename = path.join(ROOT, 'retired-historical-module.js');
  historical.paths = Module._nodeModulePaths(ROOT);
  const pinned = { historical: true };
  historical.require = createHistoricalRequire(historical, { './monsters': () => pinned });
  historical._compile(fs.readFileSync(path.join(__dirname, 'fixtures/historical-imports.txt'), 'utf8'), historical.filename);
  assert.strictEqual(historical.exports.pinned, pinned);
  assert.strictEqual(historical.exports.current, require('../src/player/characters'));
  assert.strictEqual(historical.exports.shared, require('../public/forge-math'));
  assert.strictEqual(historical.exports.path, path);
  const plain = new Module(path.join(ROOT, 'ordinary-module.js'));
  plain.filename = path.join(ROOT, 'ordinary-module.js'); plain.paths = Module._nodeModulePaths(ROOT);
  const retiredPath = './characters.js';
  assert.throws(() => plain.require(retiredPath), { code: 'MODULE_NOT_FOUND' });
});
