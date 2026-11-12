'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inventory } = require('../scripts/module-map');
const manifest = require('../docs/module-domains.json');
const root = path.resolve(__dirname, '..');

test('legacy backend imports expose the same singleton exports as domain implementations', () => {
  for (const [domain, names] of Object.entries(manifest.domains)) {
    for (const name of names) assert.strictEqual(require('../' + name), require('../src/' + domain + '/' + name), name);
  }
});

test('source-only dependency inventory is reproducible and audit groups resolve to real implementations', () => {
  const first = inventory();
  assert.deepEqual(first, inventory());
  assert.ok(first.nodes.includes('server.js'));
  assert.equal(Object.keys(first.inspectTogether).length, 5);
  for (const files of Object.values(first.inspectTogether)) {
    for (const file of files) assert.ok(fs.existsSync(path.join(root, file)), file);
  }
  for (const edge of first.edges.filter(edge => edge.from.startsWith('src/') && edge.kind === 'local')) {
    assert.ok(edge.to.startsWith('src/') || edge.to.startsWith('public/'), JSON.stringify(edge));
  }
  assert.ok(first.edges.some(edge => edge.from === 'public/index.html' && edge.kind === 'browser-script' && edge.to === 'public/forge-math.js'));
});
