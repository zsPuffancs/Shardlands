'use strict';
// Source-only dependency inventory: never execute the modules being inspected.
const fs = require('node:fs');
const path = require('node:path');
const { builtinModules } = require('node:module');
const ROOT = path.resolve(__dirname, '..');
const manifest = require('../docs/module-domains.json');
const slash = value => value.split(path.sep).join('/');
const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, '')));
const excluded = new Set(['.git', 'node_modules', 'art', 'tools', 'dist', 'reports', 'coverage']);
function sourceFiles(directory = ROOT) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en')).flatMap(entry => {
    if (entry.name.startsWith('.') || excluded.has(entry.name)) return [];
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return entry.isFile() && /\.(?:[cm]?js|ts|html)$/.test(entry.name) ? [slash(path.relative(ROOT, file))] : [];
  });
}
function implementation(name) {
  if (name.includes('/')) return name;
  const domain = Object.keys(manifest.domains).find(key => manifest.domains[key].includes(name));
  const target = 'src/' + domain + '/' + name + '.js';
  if (!domain || !fs.existsSync(path.join(ROOT, target))) throw new Error('Missing canonical implementation: ' + name);
  return target;
}
function inventory() {
  const files = sourceFiles(), known = new Set(files), edges = [], diagnostics = [];
  const resolve = (from, request) => {
    const base = slash(path.normalize(path.join(path.dirname(from), request)));
    return [base, base + '.js', base + '.cjs', base + '.mjs', base + '.ts', base + '.d.ts', base + '/index.js', base + '/index.ts'].find(candidate => known.has(candidate))
      || (base.endsWith('.json') && !base.startsWith('../') && fs.existsSync(path.join(ROOT, base)) ? base : undefined);
  };
  for (const file of files) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    // Conservative lexical scan. Comment/string examples can produce extra edges.
    const literals = /\brequire\s*\(\s*(['"])([^'"\r\n]+)\1\s*\)|\b(?:import|export)\s+(?:[^;\r\n]*?\s+from\s+)?(['"])([^'"\r\n]+)\3|\bimport\s*\(\s*(['"])([^'"\r\n]+)\5\s*\)/g;
    for (const match of source.matchAll(literals)) {
      const request = match[2] || match[4] || match[6];
      const kind = request.startsWith('.') ? 'local' : builtins.has(request.replace(/^node:/, '')) ? 'builtin' : 'external';
      const target = kind === 'local' ? resolve(file, request) : request;
      edges.push({ from: file, to: target || request, kind: kind === 'local' && target?.endsWith('.json') ? 'local-data' : kind, line: source.slice(0, match.index).split('\n').length });
      if (!target) diagnostics.push({ file, request, message: 'Unresolved literal local import (may be a fixture or textual example)' });
    }
    if (file.endsWith('.html')) {
      let order = 0;
      for (const match of source.matchAll(/<script\b[^>]*\bsrc\s*=\s*['"]([^'"]+)['"]/gi)) {
        const request = match[1];
        if (/^(?:https?:)?\/\//.test(request)) continue;
        const target = resolve(file, request.startsWith('/') ? path.relative(path.dirname(file), 'public/' + request.slice(1)) : request);
        edges.push({ from: file, to: target || request, kind: 'browser-script', order: order++ });
      }
    }
    if (/\brequire\s*\(\s*[^'"\s]/.test(source)) diagnostics.push({ file, message: 'Dynamic require: inspect runtime plugin/fixture loading manually' });
  }
  for (const file of files.filter(file => /^src\/(?:balance|shared)\/typed\/[^/]+\.ts$/.test(file))) {
    const base = file.replace('/typed/', '/generated/').replace(/\.ts$/, '');
    for (const generated of [base + '.js', base + '.d.ts']) if (known.has(generated)) edges.push({ from: generated, to: file, kind: 'generated-from' });
  }
  if (known.has('public/resource-bars.js')) edges.push({ from: 'public/resource-bars.js', to: 'src/shared/typed/resources.ts', kind: 'generated-from' });
  if (known.has('public/forge-math.js')) edges.push({ from: 'public/forge-math.js', to: 'src/shared/typed/forge.ts', kind: 'generated-from' });
  const localEdges = edges.filter(edge => (edge.kind === 'local' || edge.kind === 'browser-script') && known.has(edge.to));
  // Strongly connected components report potential cycles, including deferred imports.
  const adjacency = new Map(files.map(file => [file, []]));
  for (const edge of localEdges) adjacency.get(edge.from).push(edge.to);
  let next = 0;
  const indices = new Map(), low = new Map(), stack = [], active = new Set(), cycles = [];
  function visit(file) {
    indices.set(file, next); low.set(file, next++); stack.push(file); active.add(file);
    for (const target of adjacency.get(file)) {
      if (!indices.has(target)) { visit(target); low.set(file, Math.min(low.get(file), low.get(target))); }
      else if (active.has(target)) low.set(file, Math.min(low.get(file), indices.get(target)));
    }
    if (low.get(file) !== indices.get(file)) return;
    const component = []; let item;
    do { item = stack.pop(); active.delete(item); component.push(item); } while (item !== file);
    if (component.length > 1 || adjacency.get(file).includes(file)) cycles.push(component.sort());
  }
  files.forEach(file => { if (!indices.has(file)) visit(file); });
  return {
    schemaVersion: 1,
    limitations: ['Lexical literal-import scan, not an AST or execution trace; comments may over-report.', 'Does not infer browser globals, injected callbacks, plugin hooks or dynamic import targets.', 'Potential cycles include lazy imports; inspect lifecycle before changing them.'],
    entryPoints: manifest.entryPoints,
    authoredBalanceModules: manifest.balanceModules,
    authoredSharedModules: manifest.typedShared,
    nodes: files,
    edges,
    cycles: cycles.sort((a, b) => a[0].localeCompare(b[0], 'en')),
    inspectTogether: Object.fromEntries(Object.entries(manifest.inspectTogether).map(([group, names]) => [group, names.map(implementation)])),
    relocationMap: Object.entries(manifest.domains).flatMap(([domain, names]) => names.map(name => ({ legacy: name + '.js', implementation: 'src/' + domain + '/' + name + '.js', legacyPathStatus: fs.existsSync(path.join(ROOT, name + '.js')) ? 'retained' : 'removed' }))),
    diagnostics,
  };
}
function main(args) {
  let output, group, focus;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!['--out', '--group', '--focus'].includes(flag) || !args[index + 1]) throw Error('Usage: node scripts/module-map.js [--out file.json] [--group name | --focus relative/path.js]');
    const value = args[++index];
    if (flag === '--out') output = value;
    if (flag === '--group') group = value;
    if (flag === '--focus') focus = value.replace(/\\/g, '/');
  }
  if (group && focus) throw Error('Choose --group or --focus');
  let result = inventory();
  if (group || focus) {
    const selected = group ? result.inspectTogether[group] : [focus];
    if (!selected || selected.some(file => !result.nodes.includes(file))) throw Error('Unknown group or source path');
    const selectedSet = new Set(selected);
    for (const edge of result.edges) if (edge.kind === 'generated-from' && selectedSet.has(edge.to)) selectedSet.add(edge.from);
    result = { schemaVersion: 1, limitations: result.limitations, selected: [...selectedSet], edges: result.edges.filter(edge => selectedSet.has(edge.from) || selectedSet.has(edge.to)), diagnostics: result.diagnostics.filter(row => selectedSet.has(row.file)) };
  }
  const json = JSON.stringify(result, null, 2) + '\n';
  if (output) fs.writeFileSync(path.resolve(output), json);
  else process.stdout.write(json);
}
if (require.main === module) main(process.argv.slice(2));
module.exports = { inventory, implementation };
