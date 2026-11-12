'use strict';
// Wrap the dependency-free TS CommonJS output for the existing global-script client.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const implementation = fs.readFileSync(path.join(root, 'src/shared/generated/resources.js'), 'utf8');
if (/\brequire\s*\(/.test(implementation)) throw new Error('Browser resource artifact must remain dependency-free');
const artifact = '// GENERATED from src/shared/typed/resources.ts by npm run build. Do not edit.\n' +
  '(function(root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.SharedResources = factory(); })(typeof globalThis === "object" ? globalThis : this, function() {\nconst exports = {};\n' + implementation + '\nreturn exports;\n});\n';
const file = path.join(root, 'public/resource-bars.js');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== artifact) throw new Error('Resource browser artifact is stale: run npm run build');
} else fs.writeFileSync(file, artifact);
