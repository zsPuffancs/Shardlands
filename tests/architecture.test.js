'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inventory } = require('../scripts/module-map');
const manifest = require('../docs/module-domains.json');
const root = path.resolve(__dirname, '..');

test('backend implementations are canonical and retired root module paths are absent', () => {
  for (const [domain, names] of Object.entries(manifest.domains)) {
    for (const name of names) {
      assert.equal(fs.existsSync(path.join(root, name + '.js')), false, name);
      assert.ok(require('../src/' + domain + '/' + name), name);
    }
  }
  for (const entry of ['server.js', 'local-server.js']) assert.ok(fs.existsSync(path.join(root, entry)), entry);
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
  assert.ok(first.edges.some(edge => edge.from === 'public/resource-bars.js' && edge.kind === 'generated-from' && edge.to === 'src/shared/typed/resources.ts'));
});
