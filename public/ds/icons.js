'use strict';
// Shardlands icon registry: the one place that knows where every UI icon lives.
//   Icons.url('gear/sword')            -> 'icons/gear/sword.png'
//   Icons.img('stat/crit', 'cls')      -> '<img class="sl-ico cls" ...>'
//   Icons.item(item)                   -> icon for a piece of equipment (rarity comes from the slot, not the art)
// Adding an icon: draw it in art/icons/<category>.js, run `node art/icons/render.js <category>`, add the name below.
(function () {
  const LIB = {
    gear: ['sword', 'bow', 'staff', 'helm', 'armor', 'boots', 'ring', 'amulet'],
    item: ['hp', 'hp2', 'mp', 'atk', 'def', 'spd', 'xp', 'ret', 'reset'],
    currency: ['gold', 'souls'],
    menu: ['inventory', 'character', 'skills', 'team', 'world', 'chronicle', 'settings', 'journal', 'trade', 'sound', 'graphics', 'keys', 'log'],
    stat: ['damage', 'crit', 'critdmg', 'hp', 'defense', 'mana', 'speed', 'lifesteal', 'movespeed', 'level', 'xp', 'bag', 'locked'],
    skill: ['blade', 'archer', 'mage', 'berserker', 'mend', 'frenzy'],
    npc: ['merchant', 'smith', 'mystic', 'portal', 'camp', 'board'],
    boss: ['region', 'alpha', 'stagger'],
    quest: ['contract', 'bestiary', 'reward'],
    ui: ['check', 'cross', 'star', 'star-empty', 'warning', 'merge', 'compass', 'crown', 'search', 'info'],
    gm: ['badge', 'vault', 'account', 'teleport'],
  };
  const KNOWN = new Set(); for (const c in LIB) for (const n of LIB[c]) KNOWN.add(c + '/' + n);
  const url = name => KNOWN.has(name) ? 'icons/' + name + '.png' : null;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function img(name, cls, alt) { const u = url(name); if (!u) return ''; return '<img class="sl-ico' + (cls ? ' ' + cls : '') + '" src="' + u + '" alt="' + esc(alt || '') + '" draggable="false">'; }
  // equipment: weapons by family, everything else by slot
  const item = (it, cls) => img('gear/' + (it.slot === 'weapon' ? (LIB.gear.includes(it.fam) ? it.fam : 'sword') : it.slot), cls);
  const slot = (s, cls) => img(SLOT[s] || 'gear/' + s, cls);

  // The previous icon file names (ui/icons/*.png) -> registry names. Anything not listed keeps its old file until its
  // replacement exists, so nothing ever renders blank.
  function legacy(file) {
    let m;
    if ((m = /^gear-(\w+)-\w+$/.exec(file))) return 'gear/' + m[1];
    if ((m = /^slot-empty-(\w+)$/.exec(file))) return 'gear/' + (m[1] === 'weapon' ? 'sword' : m[1]);
    if (file === 'item-souls') return 'currency/souls';
    if ((m = /^item-(\w+)$/.exec(file))) return 'item/' + m[1];
    if ((m = /^skill-(\w+)$/.exec(file))) return KNOWN.has('skill/' + m[1]) ? 'skill/' + m[1] : PASSIVE[m[1]] || null;
    return null;
  }
  const PASSIVE = { vit: 'stat/hp', might: 'stat/damage', swift: 'stat/movespeed', crit: 'stat/crit', critdmg: 'stat/critdmg', lifesteal: 'stat/lifesteal', guard: 'stat/defense', haste: 'stat/speed', focus: 'stat/mana', fortune: 'currency/gold' };

  // Data tables the UI components read. A new currency, rarity or equipment slot is one entry here (plus a colour token
  // in tokens.css); the HUD, inventory, tooltips and windows pick it up without other changes.
  const CURRENCY = { gold: { icon: 'currency/gold' }, souls: { icon: 'currency/souls' }, bag: { icon: 'stat/bag' } };
  const RARITY = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];      // index = item.rar; colour = --sl-r<index>
  const SLOT = { weapon: 'gear/sword', helm: 'gear/helm', armor: 'gear/armor', boots: 'gear/boots', ring: 'gear/ring', amulet: 'gear/amulet' };
  const currency = (key, value) => '<span class="sl-currency is-' + key + '">' + img((CURRENCY[key] || {}).icon || 'ui/info') + '<span>' + value + '</span></span>';
  window.Icons = { LIB, url, img, item, slot, legacy, PASSIVE, CURRENCY, RARITY, SLOT, currency };
})();
