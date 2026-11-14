'use strict';
// Icon registry (public/ds/icons.js): every registered icon has its file, every emoji alias points at a registered
// icon, and every item / slot / legacy name used by the game resolves.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
// every key the game code passes to uiImg (gear-<type>-<rarity>, slot-empty-<slot>, item-<id>, skill-<id>)
const LEGACY = ['gear-amulet-common', 'gear-amulet-epic', 'gear-amulet-legendary', 'gear-amulet-mythic', 'gear-amulet-rare', 'gear-amulet-uncommon', 'gear-armor-common', 'gear-armor-epic', 'gear-armor-legendary', 'gear-armor-mythic', 'gear-armor-rare', 'gear-armor-uncommon', 'gear-boots-common', 'gear-boots-epic', 'gear-boots-legendary', 'gear-boots-mythic', 'gear-boots-rare', 'gear-boots-uncommon', 'gear-bow-common', 'gear-bow-epic', 'gear-bow-legendary', 'gear-bow-mythic', 'gear-bow-rare', 'gear-bow-uncommon', 'gear-helm-common', 'gear-helm-epic', 'gear-helm-legendary', 'gear-helm-mythic', 'gear-helm-rare', 'gear-helm-uncommon', 'gear-ring-common', 'gear-ring-epic', 'gear-ring-legendary', 'gear-ring-mythic', 'gear-ring-rare', 'gear-ring-uncommon', 'gear-staff-common', 'gear-staff-epic', 'gear-staff-legendary', 'gear-staff-mythic', 'gear-staff-rare', 'gear-staff-uncommon', 'gear-sword-common', 'gear-sword-epic', 'gear-sword-legendary', 'gear-sword-mythic', 'gear-sword-rare', 'gear-sword-uncommon', 'item-atk', 'item-def', 'item-hp', 'item-hp2', 'item-mp', 'item-reset', 'item-ret', 'item-souls', 'item-spd', 'item-xp', 'skill-archer', 'skill-blade', 'skill-crit', 'skill-critdmg', 'skill-focus', 'skill-fortune', 'skill-frenzy', 'skill-guard', 'skill-haste', 'skill-lifesteal', 'skill-mage', 'skill-mend', 'skill-might', 'skill-swift', 'skill-vit', 'slot-empty-amulet', 'slot-empty-armor', 'slot-empty-boots', 'slot-empty-helm', 'slot-empty-ring', 'slot-empty-weapon'];
function load() { const ctx = { window: {}, document: undefined }; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/ds/icons.js'), 'utf8'), ctx); return ctx.window.Icons; }
test('every registered icon exists as a 128 px PNG', () => {
  const I = load();
  for (const cat in I.LIB) for (const n of I.LIB[cat]) { const f = path.join(ROOT, 'public', I.url(cat + '/' + n)); assert.ok(fs.existsSync(f), f);
    const b = fs.readFileSync(f); assert.equal(b.readUInt32BE(16), 128, f + ' width'); assert.equal(b.readUInt32BE(20), 128, f + ' height'); }
});
test('passives, items and legacy names resolve to registered icons', () => {
  const I = load();
  for (const n of Object.values(I.PASSIVE)) assert.ok(I.url(n), n);
  for (const f of LEGACY) { const n = I.legacy(f); assert.ok(n && I.url(n), f + ' has a replacement'); }
  assert.match(I.item({ slot: 'weapon', fam: 'bow' }), /gear\/bow\.png/); assert.match(I.item({ slot: 'ring' }), /gear\/ring\.png/);
});
test('the design system is loaded by the game page', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  for (const f of ['ds/tokens.css', 'ds/components.css', 'ds/game.css', 'ds/icons.js', 'ds/ui.js']) assert.ok(html.includes(f), f);
  for (const f of fs.readFileSync(path.join(ROOT, 'public/ds/tokens.css'), 'utf8').match(/url\(([^)]+)\)/g)) assert.ok(fs.existsSync(path.join(ROOT, 'public/ds', f.slice(4, -1))), f);
});
test('no emoji or symbol placeholders remain in the client, locales or server messages', () => {
  const pat = /[\u2600-\u27BF\u25A0-\u25FF\u22EF\u2B00-\u2BFF]|[\u{1F000}-\u{1FAFF}]/u, bad = [];
  const files = ['public/index.html', ...fs.readdirSync(path.join(ROOT, 'public')).filter(f => f.endsWith('.js')).map(f => 'public/' + f), 'public/locales/hu.js', 'src/world/universe.js', 'src/economy/inventory.js'];
  for (const f of files) fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').forEach((l, i) => { if (!/^\s*\/\//.test(l) && pat.test(l)) bad.push(f + ':' + (i + 1)); });
  assert.deepEqual(bad, []);
});
