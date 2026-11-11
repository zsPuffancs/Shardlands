'use strict';
// Usability layer on top of ui.js and game.js: window fitting and saved positions, Escape handling,
// confirmations for costly actions, item locks, the first-session tutorial, the minimap legend,
// the world information panel and accessibility settings. Preferences live in this browser only.

const UX_KEY = 'sl_ux';
const uxPrefs = (() => {
  const defaults = { winpos: {}, tutorialDone: false, rarityMarks: true, reduceMotion: null, legend: false };
  try { return Object.assign(defaults, JSON.parse(localStorage.getItem(UX_KEY) || '{}')); } catch { return defaults; }
})();
function saveUxPrefs() { try { localStorage.setItem(UX_KEY, JSON.stringify(uxPrefs)); } catch {} }
const uxReduceMotion = () => uxPrefs.reduceMotion === null ? matchMedia('(prefers-reduced-motion: reduce)').matches : !!uxPrefs.reduceMotion;

// ---------- windows: stay on screen, clear of the player frame, remember where they were dragged ----------
function fitWindow(w) {
  if (!w || w.style.display === 'none') return;
  const margin = 8, frame = $('pframe') && $('pframe').getBoundingClientRect(), bar = $('actionbar') && $('actionbar').getBoundingClientRect();
  w.style.maxHeight = ''; let r = w.getBoundingClientRect(), top = r.top, left = r.left;
  left = Math.max(margin, Math.min(left, innerWidth - Math.min(r.width, innerWidth - 2 * margin) - margin));
  const across = box => box && box.height && left < box.right && left + r.width > box.left;
  // A window opening on top of the player frame moves just below it, unless the player put it there.
  const minTop = across(frame) && !uxPrefs.winpos[w.id] ? frame.bottom + margin : margin;
  if (top < minTop && !uxPrefs.winpos[w.id]) top = minTop;
  // The window ends above the action bar where it would run under it; it moves up first, then scrolls inside.
  const bottom = across(bar) ? bar.top - margin : innerHeight - margin;
  if (top + r.height > bottom) top = Math.max(Math.min(top, minTop), bottom - r.height);
  top = Math.max(margin, Math.min(top, innerHeight - 120));
  w.style.maxHeight = Math.max(160, bottom - top) + 'px';
  if (Math.round(top) !== Math.round(r.top) || Math.round(left) !== Math.round(r.left)) { w.style.top = top + 'px'; w.style.left = left + 'px'; w.style.right = 'auto'; w.style.marginLeft = 0; }
}
function restoreWindow(w) {
  const pos = uxPrefs.winpos[w.id]; if (!pos) return;
  w.style.left = Math.min(pos.left, innerWidth - 80) + 'px'; w.style.top = Math.min(pos.top, innerHeight - 80) + 'px'; w.style.right = 'auto'; w.style.marginLeft = 0;
}
const uxOpenWin = openWin;
openWin = function (id) { const w = $(id); const wasOpen = isOpen(id); uxOpenWin(id); if (!wasOpen) restoreWindow(w); fitWindow(w); };
addEventListener('resize', () => { for (const w of document.querySelectorAll('.win')) if (w.style.display !== 'none' && w.style.display) fitWindow(w); });
for (const w of document.querySelectorAll('.win')) {
  const head = w.querySelector('.win-h'); if (!head) continue;
  head.addEventListener('mousedown', e => {
    if (e.target.closest('button')) return;
    const done = () => { removeEventListener('mouseup', done); const r = w.getBoundingClientRect(); uxPrefs.winpos[w.id] = { left: Math.round(r.left), top: Math.round(r.top) }; saveUxPrefs(); fitWindow(w); };
    addEventListener('mouseup', done);
  });
}
function resetWindowPositions() { uxPrefs.winpos = {}; saveUxPrefs(); toast(text('ux.windowsReset', 'Window positions reset. They open in their default places again.'), '#8fd18f'); }

// ---------- Escape: close the topmost thing, never open anything ----------
function topWindow() {
  let best = null, z = -1;
  for (const w of document.querySelectorAll('.win')) if (w.style.display && w.style.display !== 'none') { const wz = +w.style.zIndex || 0; if (wz > z) { z = wz; best = w; } }
  return best;
}
function uxEscape() {
  if ($('uxconfirm').style.display === 'flex') { closeConfirm(); return; }
  if ($('askbar').style.display === 'flex') { hideAsk(); return; }
  if ($('tutorial').style.display === 'block') { closeTutorial(false); return; }
  if ($('maplegend').style.display === 'block') { toggleLegend(false); return; }
  const tipBox = $('tip'); if (tipBox.style.display === 'block') { tipBox.style.display = 'none'; return; }
  const w = topWindow(); if (w) closeWin(w.id);
}

// ---------- confirmations ----------
let confirmAction = null;
function uxConfirm(message, confirmLabel, onConfirm) {
  confirmAction = onConfirm; $('uxconfirm-msg').textContent = message; $('uxconfirm-yes').textContent = confirmLabel;
  $('uxconfirm').style.display = 'flex'; $('uxconfirm-yes').focus();
}
function closeConfirm() { confirmAction = null; $('uxconfirm').style.display = 'none'; }
$('uxconfirm-yes').addEventListener('click', () => { const action = confirmAction; closeConfirm(); if (action) action(); });
$('uxconfirm-no').addEventListener('click', closeConfirm);
const rarityName = r => text('rarity.' + r, I.rarity[r]);
// Merges and sales that use up Epic or better items ask first. Runs before ui.js's own click handler.
document.addEventListener('click', e => {
  if (!I || !me) return;
  const t = e.target.closest('button,[data-bag]'); if (!t) return;
  const stop = () => { e.stopImmediatePropagation(); e.preventDefault(); };
  if (t.dataset.bag && (e.ctrlKey || e.metaKey)) { stop(); send({ t: 'lock', uid: t.dataset.bag }); sfx('click'); return; }
  if (t.dataset.bag && e.shiftKey && isOpen('shopw')) {
    const it = BAG.find(i => i.uid === t.dataset.bag); if (!it) return;
    if (it.lk) { stop(); toast(text('ux.lockedHint', 'This item is locked. Ctrl+click it to unlock.'), '#ffb04a'); return; }
    if (it.rar >= 3 && !t.dataset.confirmed) { stop(); uxConfirm(text('ux.confirmSell', 'Sell {item} ({rarity}) for {gold} gold?', { item: gearName(it.name), rarity: rarityName(it.rar), gold: GameText.number(sellValue(it)) }), text('ux.sell', 'Sell'), () => send({ t: 'sell', uid: it.uid })); }
    return;
  }
  const autoMax = { autoMerge2: 2, autoMerge3: 3, autoMerge4: 4 }[t.id];
  if (autoMax >= 3 && !t.dataset.confirmed) {
    const counts = {}; for (let r = 3; r <= autoMax; r++) { const n = BAG.filter(i => i.rar === r && !i.lk).length; if (n >= MERGE_COST[r]) counts[r] = n - n % MERGE_COST[r]; }
    const parts = Object.keys(counts).map(r => counts[r] + ' ' + rarityName(+r)); if (!parts.length) return;
    stop(); uxConfirm(text('ux.confirmAutoMerge', 'Auto-merge will fuse {items}. Locked items are skipped. Continue?', { items: parts.join(', ') }), text('ux.merge', 'Merge'), () => send({ t: 'automerge', max: autoMax }));
    return;
  }
  if (t.id === 'mergeGo' && !t.disabled) {
    const picked = mergeSel.map(u => BAG.find(i => i.uid === u)).filter(Boolean);
    if (picked.some(i => i.lk)) { stop(); toast(text('ux.lockedInMerge', 'A locked item is selected. Unlock it first (Ctrl+click).'), '#ffb04a'); return; }
    if (picked.length && picked[0].rar >= 3 && !t.dataset.confirmed) { stop(); uxConfirm(text('ux.confirmMerge', 'Fuse these {count} {rarity} items into one item of the next colour?', { count: picked.length, rarity: rarityName(picked[0].rar) }), text('ux.merge', 'Merge'), () => { t.dataset.confirmed = '1'; t.click(); delete t.dataset.confirmed; }); }
    return;
  }
  if (t.id === 'mmgo' && !t.disabled && !t.dataset.confirmed) { stop(); uxConfirm(text('ux.confirmMythic', 'Melt these 3 Mythic items and pay {gold} gold for one random Mythic? This cannot be undone.', { gold: GameText.number(I.mythicMerge.gold) }), text('ux.fuse', 'Fuse'), () => { t.dataset.confirmed = '1'; t.click(); delete t.dataset.confirmed; }); }
}, true);

// ---------- first-session tutorial ----------
const TUTORIAL = [
  ['move', '🧭 Moving around', 'Click the ground or use WASD to walk. Right-drag (or the arrow keys) turns the camera, the mouse wheel zooms.'],
  ['attack', '⚔ Fighting', 'Click a monster to attack it, or press Space to hit the nearest one. Skills are on 1-3, potions on Q / E / R. Red areas on the ground are attacks about to land - step out of them.'],
  ['inventory', '🎒 Inventory and gear', 'Press I. Click gear to equip it. Hover an item to see its stats, hold Shift for the possible values and a comparison with what you wear. Ctrl+click locks an item so it cannot be sold or merged by mistake.'],
  ['skills', '📜 Skills', 'Press K. You get one point per level: active skills go to rank 5, passive skills to rank 99.'],
  ['merge', '⚗ Merging', 'Use Merge in the inventory to fuse items of one colour into one of the next: 2 Common, 3 Uncommon, 4 Rare, 5 Epic or 15 Legendary. The new item gets the average item level of what you used.'],
  ['souls', '🔮 Souls', 'Stones, Alphas and bosses drop souls. The Soul Mystic in the village spends them to reroll an item\'s stats or to add an affix.'],
  ['portal', '🌀 World Tiers and the World Portal', 'Each zone has a World Boss (👑). Defeating it raises the server\'s World Tier. After the seventh, a World Portal opens in the village and leads to new maps. The Chronicle (H) shows the server\'s history.'],
  ['team', '👥 Playing together', 'Press Y to form a team. Team members nearby share XP and gold, can trade with each other, and face tougher monsters.'],
];
let tutorialStep = 0;
function showTutorial(step) {
  tutorialStep = Math.max(0, Math.min(TUTORIAL.length - 1, step | 0));
  const [key, title, body] = TUTORIAL[tutorialStep];
  $('tut-title').textContent = text('tutorial.' + key + '.title', title);
  $('tut-body').textContent = text('tutorial.' + key + '.text', body);
  $('tut-count').textContent = (tutorialStep + 1) + ' / ' + TUTORIAL.length;
  $('tut-back').disabled = tutorialStep === 0;
  $('tut-next').textContent = tutorialStep === TUTORIAL.length - 1 ? text('tutorial.done', 'Start playing') : text('tutorial.next', 'Next');
  $('tutorial').style.display = 'block';
}
function closeTutorial(remember) { $('tutorial').style.display = 'none'; if (remember !== false || tutorialStep === TUTORIAL.length - 1) { uxPrefs.tutorialDone = true; saveUxPrefs(); } }
$('tut-next').addEventListener('click', () => { if (tutorialStep >= TUTORIAL.length - 1) closeTutorial(true); else showTutorial(tutorialStep + 1); });
$('tut-back').addEventListener('click', () => showTutorial(tutorialStep - 1));
$('tut-skip').addEventListener('click', () => closeTutorial(true));
// Shown once, the first time a hero is in the world on this browser.
const tutorialWatch = setInterval(() => { if (typeof me !== 'undefined' && me && I) { clearInterval(tutorialWatch); if (!uxPrefs.tutorialDone) showTutorial(0); } }, 1000);

// ---------- minimap legend ----------
function toggleLegend(open) { uxPrefs.legend = open === undefined ? !uxPrefs.legend : open; saveUxPrefs(); $('maplegend').style.display = uxPrefs.legend ? 'block' : 'none'; }
$('maplegend-btn').addEventListener('click', () => toggleLegend());
if (uxPrefs.legend) $('maplegend').style.display = 'block';

// ---------- world information ----------
function buildWorldInfo() {
  if (!WORLD || !I) return;
  const u = typeof UNI !== 'undefined' && UNI, mapIndex = WORLD.map || 0, zone = ZT && ZT[0];
  const tier = mapIndex ? mapIndex + 7 : null, region = u && tier ? (u.regions || []).find(r => r.tier === tier) : null;
  const here = mapIndex ? (region ? region.name : zoneName(zone.name)) : text('portal.founding', 'The Founding Lands');
  let h = '<div class="uni-head"><b>' + esc(here) + '</b><span>' + esc(mapIndex ? text('worldinfo.regionTier', 'World Tier {tier} region · Levels {min}-{max}', { tier, min: zone.lv[0], max: zone.lv[1] }) : text('worldinfo.founding', 'Seven zones around the village · Levels 1-60')) + '</span></div>';
  if (u) h += '<div class="itemcard"><div class="ln"><span>' + esc(text('universe.worldTier', 'World Tier')) + '</span><b>' + u.tier + '</b></div><div class="ln"><span>' + esc(text('universe.frontier', 'Frontier region')) + '</span><b>' + esc(regionName(u.frontier)) + '</b></div><div class="ln"><span>' + esc(text('universe.worldBoss', 'World Boss')) + '</span><b style="color:#ffd24a">👑 ' + esc(bossName(u.frontier.worldBoss)) + '</b></div></div>';
  h += '<div class="hd2" style="margin-top:8px">' + esc(text('worldinfo.active', 'Active here')) + '</div><ul class="wi-list">' +
    '<li>' + esc(text('worldinfo.activeLevels', 'Monsters are levels {min}-{max}.', { min: zone.lv[0], max: zone.lv[1] })) + '</li>' +
    '<li>' + esc(text('worldinfo.teamScaling', 'Each additional party member adds {hp}% normal-monster HP and {damage}% damage; bosses have separate health scaling.', { hp: Math.round((WORLD.scaling?.partyHp.normal || 0) * 100), damage: Math.round((WORLD.scaling?.partyDamage || 0) * 100) })) + '</li>' +
    '<li>' + esc(text('worldinfo.bossScaling', 'World Bosses: {size}× size and {min}–{max}× the level health budget, depending on World Tier.', { size: WORLD.scaling?.worldBossSize ?? '—', min: WORLD.scaling?.worldBossHp[0] ?? '—', max: WORLD.scaling?.worldBossHp[1] ?? '—' })) + '</li>' +
    '<li>' + esc(text('worldinfo.depthScaling', 'Current world-depth multipliers: {hp}× health / {damage}× damage.', { hp: (WORLD.scaling?.worldHp || 1).toFixed(2), damage: (WORLD.scaling?.worldDamage || 1).toFixed(2) })) + '</li></ul>';
  const mods = region && region.modifiers || [];
  h += '<div class="hd2" style="margin-top:8px">' + esc(text('worldinfo.modifiers', 'Region modifiers')) + ' <span class="badge-planned">' + esc(text('worldinfo.notActive', 'not active yet')) + '</span></div>';
  h += mods.length ? '<ul class="wi-list planned">' + mods.map(m => '<li>' + esc(text('modifier.' + m, m.replace(/-/g, ' '))) + '</li>').join('') + '</ul><div class="mu" style="font-size:0.6875rem">' + esc(text('worldinfo.modifiersHint', 'These are generated and recorded for this region, but have no effect on gameplay yet.')) + '</div>'
    : '<div class="mu" style="font-size:0.75rem">' + esc(mapIndex ? text('worldinfo.noModifiers', 'No modifiers recorded for this region.') : text('worldinfo.foundingModifiers', 'The founding lands have no modifiers.')) + '</div>';
  $('worldb').innerHTML = h;
}
const uxOnUniverse = onUniverse;
onUniverse = function (u) { uxOnUniverse(u); if (isOpen('worldw')) buildWorldInfo(); };
const uxOpenWinWorld = openWin;
openWin = function (id) { uxOpenWinWorld(id); if (id === 'worldw') { buildWorldInfo(); send({ t: 'universe' }); } };

// ---------- accessibility ----------
function applyAccessibility() {
  document.body.classList.toggle('rarity-marks', !!uxPrefs.rarityMarks);
  document.body.classList.toggle('reduce-motion', uxReduceMotion());
  $('rarity-marks').checked = !!uxPrefs.rarityMarks;
  $('reduce-motion').checked = uxReduceMotion();
}
$('rarity-marks').addEventListener('change', e => { uxPrefs.rarityMarks = e.target.checked; saveUxPrefs(); applyAccessibility(); if (isOpen('invp')) buildInv(); });
$('reduce-motion').addEventListener('change', e => { uxPrefs.reduceMotion = e.target.checked; saveUxPrefs(); applyAccessibility(); });
$('tutorial-again').addEventListener('click', () => { closeWin('setw'); showTutorial(0); });
$('windows-reset').addEventListener('click', resetWindowPositions);
applyAccessibility();

// ---------- boss cast warnings ----------
const ATTACK_NAME = { charge: 'Charge', breath: 'Breath', meteor: 'Meteor Rain', summon: 'Summon', slam: 'Ground Slam' };
let castTimer = 0;
let phaseNoticeTimer = 0;
// Telegraphed boss attacks already show on the ground; this names them under the target frame as well.
function castWarning(f) {
  if (!I || !me) return;
  const m = mo.find(x => x.id === f.a), t = m && I.types[m.ty];
  if (!t || !t.boss || (me.tg !== m.id && Math.hypot(m.x - me.x, m.y - me.y) > 700)) return;
  const el = $('castwarn');
  el.textContent = '⚠ ' + text('ux.castWarning', '{boss}: {attack}! Leave the red area.', { boss: mobName(m.ty, t.n), attack: text('attack.' + f.s, ATTACK_NAME[f.s] || f.s) });
  el.style.display = 'block'; clearTimeout(castTimer); castTimer = setTimeout(() => { el.style.display = 'none'; }, 2600);
}
// Boss phases (below 60% / 30% health) and the punish window after each telegraphed attack.
function bossPhaseNotice(f) {
  if (!I || !me) return;
  const m = mo.find(x => x.id === f.a), t = m && I.types[m.ty];
  if (!t || !t.boss || (me.tg !== m.id && Math.hypot(m.x - me.x, m.y - me.y) > 700)) return;
  const name = mobName(m.ty, t.n), el = $('bossnotice');
  const message = f.s === 'stagger'
    ? '✦ ' + text('ux.bossStagger', '{boss} is recovering: strike now for extra damage!', { boss: name })
    : '🔥 ' + (f.v >= 2 ? text('ux.bossFinalPhase', '{boss} is desperate: attacks come much faster and hit harder!', { boss: name }) : text('ux.bossEnraged', '{boss} is enraged: attacks come faster!', { boss: name }));
  el.textContent = message; el.style.display = 'block'; clearTimeout(phaseNoticeTimer); phaseNoticeTimer = setTimeout(() => { el.style.display = 'none'; }, f.s === 'stagger' ? 1300 : 3000);
}
