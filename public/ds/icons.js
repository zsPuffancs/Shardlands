'use strict';
// Shardlands icon registry: the one place that knows where every UI icon lives.
//   Icons.url('gear/sword')            -> 'icons/gear/sword.png'
//   Icons.img('stat/crit', 'cls')      -> '<img class="sl-ico cls" ...>'
//   Icons.item(item)                   -> icon for a piece of equipment (rarity comes from the slot, not the art)
//   Icons.decorate(root)               -> swaps the emoji still used inside localised strings for registry icons
// Adding an icon: draw it in art/icons/<category>.js, run `node art/icons/render.js <category>`, add the name below.
(function () {
  const LIB = {
    gear: ['sword', 'bow', 'staff', 'helm', 'armor', 'boots', 'ring', 'amulet'],
    item: ['hp', 'hp2', 'mp', 'atk', 'def', 'spd', 'xp', 'ret', 'reset'],
    currency: ['gold', 'souls'],
    menu: ['inventory', 'character', 'skills', 'team', 'world', 'chronicle', 'settings', 'journal', 'trade', 'crafting', 'sound', 'graphics', 'keys', 'log'],
    stat: ['damage', 'crit', 'critdmg', 'hp', 'defense', 'mana', 'speed', 'lifesteal', 'movespeed', 'level', 'xp', 'bag', 'locked'],
    skill: ['blade', 'archer', 'mage', 'mend', 'frenzy'],
  };
  const KNOWN = new Set(); for (const c in LIB) for (const n of LIB[c]) KNOWN.add(c + '/' + n);
  const url = name => KNOWN.has(name) ? 'icons/' + name + '.png' : null;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function img(name, cls, alt) { const u = url(name); if (!u) return ''; return '<img class="sl-ico' + (cls ? ' ' + cls : '') + '" src="' + u + '" alt="' + esc(alt || '') + '" draggable="false">'; }
  // equipment: weapons by family, everything else by slot
  const item = (it, cls) => img('gear/' + (it.slot === 'weapon' ? (LIB.gear.includes(it.fam) ? it.fam : 'sword') : it.slot), cls);
  const slot = (s, cls) => img('gear/' + (s === 'weapon' ? 'sword' : s), cls);

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

  // Emoji that are still part of localised strings -> icons. Decorate() replaces them in the HUD and windows so the
  // interface shows one icon family while the strings are migrated (see docs/ui/DESIGN.md).
  const EMOJI = {
    '🎒': 'menu/inventory', '📜': 'menu/skills', '👥': 'menu/team', '🗺': 'menu/world', '🏛': 'menu/chronicle', '⚙': 'menu/settings', '📖': 'menu/journal',
    '🤝': 'menu/trade', '⚗': 'menu/crafting', '⚒': 'menu/crafting', '💰': 'currency/gold', '🔮': 'currency/souls',
    '⚔': 'stat/damage', '🎯': 'stat/crit', '💥': 'stat/critdmg', '❤': 'stat/hp', '🛡': 'stat/defense', '💧': 'stat/mana', '⚡': 'stat/speed', '🩸': 'stat/lifesteal',
    '💨': 'stat/movespeed', '🔒': 'stat/locked', '🔊': 'menu/sound', '🖥': 'menu/graphics', '⌨': 'menu/keys', '🧪': 'item/hp', '★': 'stat/xp', '🔥': 'skill/frenzy',
  };
  const RE = new RegExp('(' + Object.keys(EMOJI).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\uFE0F?\\s?', 'gu');
  function decorateNode(t) {
    const s = t.nodeValue; RE.lastIndex = 0; if (!RE.test(s)) return; RE.lastIndex = 0;
    const f = document.createDocumentFragment(); let last = 0, m;
    while ((m = RE.exec(s))) { if (m.index > last) f.appendChild(document.createTextNode(s.slice(last, m.index)));
      const i = document.createElement('img'); i.className = 'sl-ico sl-ico-inline'; i.src = url(EMOJI[m[1]]); i.alt = ''; i.draggable = false; f.appendChild(i); last = m.index + m[0].length; }
    if (last < s.length) f.appendChild(document.createTextNode(s.slice(last)));
    t.parentNode.replaceChild(f, t);
  }
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'OPTION', 'SELECT', 'CODE']);
  function decorate(root) {
    if (!root || !document.createTreeWalker) return; const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentNode && !SKIP.has(n.parentNode.nodeName) && !n.parentNode.closest('#log,[data-raw-text]') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    const list = []; while (w.nextNode()) list.push(w.currentNode); for (const t of list) decorateNode(t);
  }
  // watch the HUD and the windows; batched to one pass per frame
  let pending = new Set(), raf = 0;
  function watch(roots) {
    if (typeof MutationObserver === 'undefined') return;
    const flush = () => { raf = 0; const p = pending; pending = new Set(); for (const n of p) if (n.isConnected) n.nodeType === 3 ? decorateNode(n) : decorate(n); };
    const mo = new MutationObserver(recs => { for (const r of recs) { if (r.type === 'characterData') pending.add(r.target); else for (const n of r.addedNodes) if (n.nodeType === 1 || n.nodeType === 3) pending.add(n); } if (!raf) raf = requestAnimationFrame(flush); });
    for (const r of roots) if (r) { decorate(r); mo.observe(r, { childList: true, subtree: true, characterData: true }); }
  }
  window.Icons = { LIB, url, img, item, slot, legacy, decorate, watch, EMOJI, PASSIVE };
  const start = () => watch(['hud', 'game-windows', 'tip', 'toasts', 'tutorial', 'castwarn'].map(id => document.getElementById(id)));
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start(); }
})();
