'use strict';
// Icon registry (public/ds/icons.js): every registered icon has its file, every emoji alias points at a registered
// icon, and every item / slot / legacy name used by the game resolves.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
function load() { const ctx = { window: {}, document: undefined }; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/ds/icons.js'), 'utf8'), ctx); return ctx.window.Icons; }
test('every registered icon exists as a 128 px PNG', () => {
  const I = load();
  for (const cat in I.LIB) for (const n of I.LIB[cat]) { const f = path.join(ROOT, 'public', I.url(cat + '/' + n)); assert.ok(fs.existsSync(f), f);
    const b = fs.readFileSync(f); assert.equal(b.readUInt32BE(16), 128, f + ' width'); assert.equal(b.readUInt32BE(20), 128, f + ' height'); }
});
test('emoji aliases, passives, items and legacy names resolve to registered icons', () => {
  const I = load();
  for (const [e, n] of Object.entries(I.EMOJI)) assert.ok(I.url(n), e + ' -> ' + n);
  for (const n of Object.values(I.PASSIVE)) assert.ok(I.url(n), n);
  for (const f of fs.readdirSync(path.join(ROOT, 'public/ui/icons'))) { const n = I.legacy(f.replace('.png', '')); assert.ok(n && I.url(n), f + ' has a replacement'); }
  assert.match(I.item({ slot: 'weapon', fam: 'bow' }), /gear\/bow\.png/); assert.match(I.item({ slot: 'ring' }), /gear\/ring\.png/);
});
test('the design system is loaded by the game page', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  for (const f of ['ds/tokens.css', 'ds/components.css', 'ds/game.css', 'ds/icons.js', 'ds/ui.js']) assert.ok(html.includes(f), f);
  for (const f of fs.readFileSync(path.join(ROOT, 'public/ds/tokens.css'), 'utf8').match(/url\(([^)]+)\)/g)) assert.ok(fs.existsSync(path.join(ROOT, 'public/ds', f.slice(4, -1))), f);
});
