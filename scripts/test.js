'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const groups = {
  unit: ['architecture', 'root-imports', 'balance-registry', 'balance-simulation', 'resources', 'entities'],
  integration: ['architecture-startup', 'balance-config'],
  balance: ['balance-registry', 'balance-simulation', 'resources', 'entities', 'enemy-scaling', 'item-soft-cap', 'xp-region-levels'],
  determinism: ['world-generation', 'danger-atlas'],
};
const group = process.argv[2] || 'all';
if (group !== 'all' && !Object.hasOwn(groups, group)) throw new Error('Unknown test group: ' + group);
const files = group === 'all' ? fs.readdirSync(path.join(root, 'tests')).filter(file => file.endsWith('.test.js')).sort() : groups[group].map(name => name + '.test.js');
const result = spawnSync(process.execPath, ['--test', ...files.map(file => path.join(root, 'tests', file))], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
