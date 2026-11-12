'use strict';
// Wrap the dependency-free TS CommonJS output for the existing global-script client.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const [source, output, globalName] of [['resources', 'resource-bars.js', 'SharedResources'], ['forge', 'forge-math.js', 'ForgeMath']]) {
  const implementation = fs.readFileSync(path.join(root, 'src/shared/generated/' + source + '.js'), 'utf8');
  if (/\brequire\s*\(/.test(implementation)) throw new Error('Browser shared artifacts must remain dependency-free');
  const artifact = '// GENERATED from src/shared/typed/' + source + '.ts by npm run build. Do not edit.\n' +
    '(function(root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.' + globalName + ' = factory(); })(typeof globalThis === "object" ? globalThis : this, function() {\nconst exports = {};\n' + implementation + '\nreturn exports;\n});\n';
  const file = path.join(root, 'public', output);
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== artifact) throw new Error('Shared browser artifact is stale: run npm run build (' + output + ')');
  } else fs.writeFileSync(file, artifact);
}
