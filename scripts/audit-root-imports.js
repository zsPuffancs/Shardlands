'use strict';
// Development-only AST audit. Never import application modules or inspect save/config contents.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const manifest = require('../docs/module-domains.json');
const ROOT = path.resolve(__dirname, '..');
const slash = value => value.split(path.sep).join('/');
const legacyMap = Object.fromEntries(Object.entries(manifest.domains).flatMap(([domain, names]) => names.map(name => [name + '.js', 'src/' + domain + '/' + name + '.js'])));
function legacyTarget(file, request) {
  if (!request.startsWith('.') && !path.isAbsolute(request)) return null;
  let relative = slash(path.relative(ROOT, path.resolve(ROOT, path.dirname(file), request)));
  if (!relative.endsWith('.js')) relative += '.js';
  return Object.hasOwn(legacyMap, relative) ? { legacy: relative, implementation: legacyMap[relative] } : null;
}
function analyzeSource(source, file) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  const legacyImports = [], dynamicImports = [];
  function inspect(node, argument) {
    const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
    if (argument && ts.isStringLiteralLike(argument)) {
      const match = legacyTarget(file, argument.text);
      if (match) legacyImports.push({ file, line, request: argument.text, start: argument.getStart(tree), end: argument.end, ...match });
    } else dynamicImports.push({ file, line, expression: node.getText(tree).slice(0, 200) });
  }
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const call = node.expression.getText(tree);
      if (['require', 'require.resolve', 'module.require', 'import'].includes(call)) inspect(node, node.arguments[0]);
    } else if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) inspect(node, node.moduleSpecifier);
    } else if (ts.isExternalModuleReference(node)) inspect(node, node.expression);
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) inspect(node, node.argument.literal);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return { legacyImports, dynamicImports };
}
function wrapperInventory() {
  return Object.entries(legacyMap).map(([legacy, implementation]) => {
    const file = path.join(ROOT, legacy), exists = fs.existsSync(file);
    if (!exists) return { legacy, implementation, exists, pureWrapper: false };
    const source = fs.readFileSync(file, 'utf8');
    const expected = "'use strict';\n// Compatibility entry point. Implementation: " + implementation + "\nmodule.exports = require('./" + implementation + "');\n";
    return { legacy, implementation, exists, pureWrapper: source.replace(/\r\n/g, '\n') === expected, implementationExists: fs.existsSync(path.join(ROOT, implementation)), sha256: crypto.createHash('sha256').update(source).digest('hex') };
  });
}
function audit() {
  const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean))].sort();
  const legacyImports = [], dynamicImports = [];
  let sourceCount = 0;
  for (const file of files) {
    if (!/\.(?:[cm]?js|ts)$/.test(file) || !fs.existsSync(path.join(ROOT, file)) || /^(?:art|tools|node_modules|reports)\//.test(file)) continue;
    const analysis = analyzeSource(fs.readFileSync(path.join(ROOT, file), 'utf8'), file);
    legacyImports.push(...analysis.legacyImports); dynamicImports.push(...analysis.dynamicImports); sourceCount++;
  }
  return { schemaVersion: 1, sourceCount, wrappers: wrapperInventory(), legacyImports, dynamicImports,
    limitations: ['Static literal import analysis plus a manual-review list for dynamic calls; not an execution trace.', 'Historical virtual filenames, pinned Git paths, documentation and runtime plugin entry loading require separate review.', 'External installations and untracked/ignored third-party plugins cannot be proven absent.'] };
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--out')) throw Error('Usage: node scripts/audit-root-imports.js [--out file.json]');
  const report = audit(), json = JSON.stringify(report, null, 2) + '\n';
  if (args.length) fs.writeFileSync(path.resolve(args[1]), json);
  else process.stdout.write(json);
}
module.exports = { analyzeSource, audit, wrapperInventory, legacyMap };
