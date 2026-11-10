// Shardlands 3D client UI: HUD, windows (inventory, skills, merchant, blacksmith, settings), tooltips, sound, toasts.
let BAG = [], EQ = {}, GS = {}, sig = '', cdMax = [2000, 8000, 25000], mergeMode = false, mergeSel = [], smSel = null;
const RC = ['#d8d8d8', '#4ee26a', '#4da3ff', '#b25cff', '#ff9d2e'];
const SLOTICON = { weapon: '⚔️', helm: '⛑️', armor: '🛡️', boots: '🥾', ring: '💍', amulet: '📿', sword: '⚔️', bow: '🏹', staff: '🪄' };
const SLOTNAME = { weapon: 'Weapon', helm: 'Helm', armor: 'Armor', boots: 'Boots', ring: 'Ring', amulet: 'Amulet' };
const STATORDER = ['dmg', 'hp', 'mp', 'def', 'crit', 'spd', 'gf', 'xpb'];
const BUFFN = { atk: '⚔ Fury', def: '🛡 Iron', spd: '💨 Swift', xp: '📖 Wisdom', rage: '🔥 Rage' };
const SK = ['s1', 'mend', 'frenzy', 'vit', 'might', 'swift'];
const CLSICON = { blade: '⚔️', archer: '🏹', mage: '🔮' }, S1ICON = { blade: '🌀', archer: '🎯', mage: '✴️' };
const ITEMICON = { hp: '❤️', hp2: '💖', mp: '💧', atk: '⚔️', def: '🛡️', spd: '💨', xp: '📖', ret: '🏠', reset: '♻️' };
const RNAME = ['common', 'uncommon', 'rare', 'epic', 'legendary'], CONS_ICON = { hp: 1, mp: 1, hp2: 1, atk: 1, def: 1, spd: 1, xp: 1, ret: 1, reset: 1 };
const uiImg = (f, cls) => '<img class="ui-ico' + (cls ? ' ' + cls : '') + '" src="ui/icons/' + f + '.png" alt="" draggable="false">';
const iconOf = it => uiImg('gear-' + (it.slot === 'weapon' ? ({ sword: 1, bow: 1, staff: 1 }[it.fam] ? it.fam : 'sword') : it.slot) + '-' + (RNAME[it.rar] || 'common'));
const slotIcon = s => uiImg('slot-empty-' + s), consIcon = k => uiImg('item-' + (CONS_ICON[k] ? k : 'hp'));
const clsKey = cls => ['blade', 'archer', 'mage'].includes(cls) ? cls : ({ sword: 'blade', bow: 'archer', staff: 'mage' }[I && I.classes[cls] && I.classes[cls].fam] || 'blade');
const skillIcon = k => uiImg('skill-' + (k === 's1' ? clsKey(I.cls) : k));
const sellValue = it => Math.round((3 * it.ilvl + 5) * (1 + (it.rar * it.rar) * 0.6) * (1 + (it.plus || 0) * 0.5));
const upCost = it => Math.round(100 * (it.plus + 1) * (it.plus + 1) * (1 + it.ilvl / 12) * (it.slot === 'weapon' ? 1 : 0.8));
const plusMul = (it, k) => 1 + (it.plus || 0) * (it.slot === 'weapon' && k === 'dmg' ? 0.15 : 0.1);
const eff = (it, k, plus) => it.stats[k] * (1 + (plus === undefined ? it.plus || 0 : plus) * (it.slot === 'weapon' && k === 'dmg' ? 0.15 : 0.1));
const fmtS = (k, v) => (I.stat[k].pct ? v.toFixed(1) : Math.round(v));

// ---------- sound (tiny WebAudio synth, no files) ----------
let AC = null, master = null, muted = false, volume = 0.8, volC = 1, volU = 1, curVol = 1;
try { muted = localStorage.getItem('sl_mute') === '1'; const v = localStorage.getItem('sl_vol'); if (v !== null) volume = +v; const c = localStorage.getItem('sl_volc'); if (c !== null) volC = +c; const w = localStorage.getItem('sl_volu'); if (w !== null) volU = +w; } catch (e) {}
function audio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = volume; master.connect(AC.destination); } catch (e) {} } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
function tone(f, dur, type, vol, slide, delay) {
  const a = audio(); if (!a || muted) return; const t = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
  vol *= curVol; if (vol < 0.0003) return; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03);
}
let sfxBudget = 0, sfxT = 0;
function noise(dur, vol, cutoff) {
  const a = audio(); if (!a || muted) return; const n = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); f.type = 'lowpass'; f.frequency.value = cutoff || 1800; g.gain.value = vol * curVol; s.buffer = b; s.connect(f); f.connect(g); g.connect(master); s.start();
}
function sfx(name, x, z, r) {
  const now = performance.now(); if (now - sfxT > 100) { sfxT = now; sfxBudget = 0; } if (++sfxBudget > 6) return; // never more than ~60 sounds/second
  curVol = ['click', 'coin', 'loot', 'lvl', 'equip', 'sell', 'fail', 'anvil'].includes(name) ? volU : volC;
  let k = 1; if (x !== undefined && typeof cam !== 'undefined') { k = Math.max(0, 1 - Math.hypot(x - cam.x, z - cam.z) / 1100); if (k < 0.05) return; }
  switch (name) {
    case 'hit': noise(.08, .2 * k); tone(190, .08, 'square', .04 * k, 90); break;
    case 'crit': noise(.12, .28 * k, 3000); tone(520, .14, 'sawtooth', .06 * k, 200); tone(980, .08, 'triangle', .05 * k, 600, .05); break;
    case 'hurt': tone(150, .22, 'sawtooth', .1 * k, 60); noise(.1, .12 * k, 900); break;
    case 'coin': tone(988, .07, 'square', .04 * k); tone(1319, .13, 'square', .04 * k, 0, .06); break;
    case 'loot': { const base = [523, 587, 659, 784, 1046][r || 0]; tone(base, .1, 'triangle', .08 * k); tone(base * 1.5, .15, 'triangle', .08 * k, 0, .08); if (r >= 2) tone(base * 2, .25, 'sine', .08 * k, 0, .16); if (r >= 4) tone(base * 3, .4, 'sine', .08 * k, 0, .24); break; }
    case 'lvl': [523, 659, 784, 1046].forEach((f, i) => tone(f, .25, 'triangle', .09, 0, i * .09)); break;
    case 'heal': tone(520, .3, 'sine', .07 * k, 900); tone(780, .3, 'sine', .05 * k, 1200, .1); break;
    case 'die': noise(.28, .22 * k, 1200); tone(130, .3, 'sawtooth', .08 * k, 40); break;
    case 'skill': noise(.22, .16 * k, 2500); tone(280, .28, 'sawtooth', .06 * k, 720); break;
    case 'shot': tone(720, .1, 'triangle', .05 * k, 280); break;
    case 'magic': tone(420, .2, 'sine', .06 * k, 940); break;
    case 'click': tone(640, .04, 'square', .03); break;
    case 'equip': noise(.06, .14, 1500); tone(320, .07, 'square', .04); break;
    case 'sell': tone(880, .06, 'square', .04); tone(1175, .1, 'square', .04, 0, .05); break;
    case 'boss': tone(98, .8, 'sawtooth', .12 * k, 60); tone(73, .9, 'square', .06 * k, 50, .1); break;
    case 'warn': tone(220, .5, 'sawtooth', .08 * k, 110); break;
    case 'slam': noise(.5, .35 * k, 500); tone(70, .5, 'square', .12 * k, 35); break;
    case 'anvil': [1, 2, 3].forEach(i => { noise(.05, .2, 4000); tone(1800 + i * 90, .12, 'square', .03, 0, i * .18); }); break;
    case 'fail': tone(300, .4, 'sawtooth', .08, 90); break;
  }
}
function toggleMute() { muted = !muted; try { localStorage.setItem('sl_mute', muted ? '1' : '0'); } catch (e) {} toast(muted ? text("sound.off", "Sound off") : text("sound.on", "Sound on")); if (!muted) sfx('click'); if (isOpen('setw')) $('mutechk').checked = muted; }

// ---------- chat / banner / toasts ----------
const CHAT_HISTORY_LIMIT = 100;
const CHAT_VISIBLE_LIMIT = 10;
const COMBAT_HISTORY_LIMIT = 30;
const COMBAT_HISTORY_TTL = 120000;
const chatHistory = [];
let combatHistory = [], combatExpiryTimer;
const chatFilters = [...document.querySelectorAll('[data-chat-filter]')];
const logOptions = { damageDealt: true, damageTaken: true, healing: true, loot: true, system: true };
let chatFilter = 'all';
try {
  const savedOptions = JSON.parse(localStorage.getItem('sl_log_options') || '{}');
  for (const option of Object.keys(logOptions)) logOptions[option] = savedOptions?.[option] !== false;
} catch {}

function matchesChatFilter(entry) {
  return chatFilter === 'all' || entry.channel === chatFilter;
}

function createChatLine({ name, message, channel }) {
  const line = document.createElement('div');
  if (channel === 'player') {
    const speaker = document.createElement('b');
    speaker.style.color = '#9fd0ff';
    speaker.textContent = name + ': ';
    line.appendChild(speaker);
  }
  const body = document.createElement('span');
  GameText.present(body, { message, color: channel === 'loot' ? '#a9e39b' : channel === 'system' ? '#e8bf55' : undefined });
  line.appendChild(body);
  return line;
}

function renderChatHistory(scrollToLatest = false) {
  const logBox = $('log');
  const isCombat = chatFilter === 'combat';
  const wasAtBottom = logBox.scrollHeight - logBox.scrollTop - logBox.clientHeight < 4;
  const scrollTop = logBox.scrollTop;
  const visibleEntries = isCombat ? combatHistory : chatHistory.filter(matchesChatFilter).slice(-CHAT_VISIBLE_LIMIT);
  logBox.classList.toggle('combat-log', isCombat);
  logBox.replaceChildren(...visibleEntries.map(createChatLine));
  if (isCombat) logBox.scrollTop = scrollToLatest || wasAtBottom ? logBox.scrollHeight : scrollTop;
}

function appendChatLine(entry) {
  const logBox = $('log');
  logBox.appendChild(createChatLine(entry));
  if (logBox.children.length > CHAT_VISIBLE_LIMIT) logBox.removeChild(logBox.firstChild);
}

function log(name, message, channel) {
  const category = channel === 'loot' ? 'loot' : !name || name === '*' ? 'system' : 'player';
  if (logOptions[category] === false) return;
  const entry = { name, message, channel: category };
  chatHistory.push(entry);
  const expiredEntry = chatHistory.length > CHAT_HISTORY_LIMIT ? chatHistory.shift() : null;
  if (chatFilter === 'combat') return;
  if (matchesChatFilter(entry)) appendChatLine(entry);
  else if (expiredEntry && matchesChatFilter(expiredEntry)) renderChatHistory();
}

function scheduleCombatExpiry() {
  clearTimeout(combatExpiryTimer);
  if (!combatHistory.length) return;
  combatExpiryTimer = setTimeout(() => {
    const now = Date.now();
    combatHistory = combatHistory.filter(entry => entry.expiresAt > now);
    if (chatFilter === 'combat') renderChatHistory();
    scheduleCombatExpiry();
  }, Math.max(0, combatHistory[0].expiresAt - Date.now()));
}

function logCombatEvent(event) {
  let category, message;
  const monster = { key: 'monster.' + event.monsterType, fallback: I.types[event.monsterType]?.n || 'Monster' };
  if (event.k === 'dmg') {
    category = 'damageDealt';
    message = {
      key: event.c ? 'combat.criticalDamage' : 'combat.damageDealt',
      fallback: event.c ? 'Critical: {damage} damage to {monster}' : '{damage} damage to {monster}',
      values: { damage: event.v, monster },
    };
  } else if (event.k === 'hurt') {
    category = 'damageTaken';
    message = { key: 'combat.damageTaken', fallback: '{monster} hit you for {damage}', values: { damage: event.v, monster } };
  } else if (event.k === 'heal' && event.restoredHealth > 0) {
    category = 'healing';
    message = { key: 'combat.healing', fallback: 'Restored {health} HP', values: { health: event.restoredHealth } };
  }
  if (!category || !logOptions[category]) return;

  const now = Date.now();
  const previousCount = combatHistory.length;
  combatHistory = combatHistory.filter(entry => entry.expiresAt > now);
  const expiredCount = previousCount - combatHistory.length;
  const entry = { message, channel: 'combat', category, expiresAt: now + COMBAT_HISTORY_TTL };
  combatHistory.push(entry);
  const removedOldest = combatHistory.length > COMBAT_HISTORY_LIMIT;
  if (removedOldest) combatHistory.shift();
  if (chatFilter === 'combat') {
    const logBox = $('log');
    const wasAtBottom = logBox.scrollHeight - logBox.scrollTop - logBox.clientHeight < 4;
    const removedCount = expiredCount + Number(removedOldest);
    for (let index = 0; index < removedCount; index++) logBox.removeChild(logBox.firstChild);
    logBox.appendChild(createChatLine(entry));
    if (wasAtBottom) logBox.scrollTop = logBox.scrollHeight;
  }
  scheduleCombatExpiry();
}

for (const button of chatFilters) {
  button.addEventListener('click', () => {
    chatFilter = button.dataset.chatFilter;
    for (const filter of chatFilters) {
      filter.setAttribute('aria-pressed', String(filter === button));
    }
    renderChatHistory(true);
  });
}

for (const checkbox of document.querySelectorAll('[data-log-option]')) {
  const option = checkbox.dataset.logOption;
  checkbox.checked = logOptions[option];
  checkbox.addEventListener('change', () => {
    logOptions[option] = checkbox.checked;
    try { localStorage.setItem('sl_log_options', JSON.stringify(logOptions)); } catch {}
    if (!checkbox.checked) {
      for (let index = chatHistory.length - 1; index >= 0; index--) {
        if (chatHistory[index].channel === option) chatHistory.splice(index, 1);
      }
      combatHistory = combatHistory.filter(entry => entry.category !== option);
      scheduleCombatExpiry();
      renderChatHistory();
    }
  });
}

let bannerT = 0;
function banner(title, sub, danger) { const z = $('zone'); z.querySelector('b').textContent = title; z.querySelector('span').textContent = sub || ''; z.classList.toggle('danger', !!danger); z.style.opacity = 1; clearTimeout(bannerT); bannerT = setTimeout(() => z.style.opacity = 0, 3400); }
function toast(m, c) { const t = document.createElement('div'); t.className = 'toast'; GameText.present(t, { message: m, color: c }); if (c) { t.style.color = c; t.style.borderColor = c; } const box = $('toasts'); box.appendChild(t); while (box.children.length > 4) box.removeChild(box.firstChild); setTimeout(() => t.style.opacity = 0, 3200); setTimeout(() => t.remove(), 3800); }
let flashT = 0;
function hurtFlash(strong) { const h = $('hurtfx'); if (!h.classList.contains('low')) h.style.opacity = strong ? 0.9 : 0.55; clearTimeout(flashT); flashT = setTimeout(() => { if (!h.classList.contains('low')) h.style.opacity = 0; }, 160); }

// ---------- windows ----------
let zTop = 20;
const isOpen = id => $(id).style.display === 'flex';
function openWin(id) { const w = $(id); w.style.display = 'flex'; w.style.zIndex = ++zTop; if (id === 'invp') buildInv(); if (id === 'skillp') buildSkills(); if (id === 'shopw') buildShop(); if (id === 'smithw') buildSmith(); if (id === 'setw') buildSettings(); tip.style.display = 'none'; }
function closeWin(id) { $(id).style.display = 'none'; if (id === 'invp') { mergeMode = false; mergeSel = []; } tip.style.display = 'none'; }
function togglePanel(id) { if (isOpen(id)) closeWin(id); else openWin(id); }
function closeAll() { for (const id of ['invp', 'skillp', 'shopw', 'smithw', 'setw']) closeWin(id); }
document.querySelectorAll('.win').forEach(w => {
  const h = w.querySelector('.win-h'); w.addEventListener('mousedown', () => { w.style.zIndex = ++zTop; });
  h.addEventListener('mousedown', e => { if (e.target.closest('button')) return; const r = w.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
    const mv = ev => { w.style.left = Math.max(0, Math.min(innerWidth - 60, ev.clientX - ox)) + 'px'; w.style.top = Math.max(0, Math.min(innerHeight - 40, ev.clientY - oy)) + 'px'; w.style.right = 'auto'; w.style.marginLeft = 0; };
    const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); }; addEventListener('mousemove', mv); addEventListener('mouseup', up); e.preventDefault(); });
});
// NPCs: open the window that belongs to the NPC (game.js calls this when you reach them)
function openNpc(k) { closeWin(k === 'merchant' ? 'smithw' : 'shopw'); openWin(k === 'merchant' ? 'shopw' : 'smithw'); if (!isOpen('invp')) openWin('invp'); sfx('click'); }

// ---------- inventory ----------
function slotHtml(it, attrs, extra) {
  return '<div class="slot r' + it.rar + (extra || '') + '" ' + attrs + '>' + iconOf(it) + '<sup>' + it.ilvl + '</sup>' + (it.plus ? '<sub>+' + it.plus + '</sub>' : '') + '</div>';
}
function onInv(m) { BAG = m.bag; EQ = m.eq; GS = m.gs; mergeSel = mergeSel.filter(u => BAG.some(i => i.uid === u)); if (isOpen('invp')) buildInv(); if (isOpen('smithw')) buildSmith(); }
let bagPage = 0;

function renderBagPage() {
  const pageSize = I.bagPageSize || 30;
  const pageCount = Math.ceil(I.bagMax / pageSize);
  bagPage = Math.max(0, Math.min(bagPage, pageCount - 1));

  const pageBar = $('bag-pages');
  const tabCount = pageCount > 1 ? pageCount : 0;
  if (pageBar.children.length !== tabCount) {
    const tabs = Array.from({ length: tabCount }, (_, page) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.dataset.bagPage = page;
      tab.textContent = page + 1;
      tab.setAttribute('aria-controls', 'bag');
      return tab;
    });
    pageBar.replaceChildren(...tabs);
  }
  for (const tab of pageBar.children) {
    const page = Number(tab.dataset.bagPage);
    const isActive = page === bagPage;
    tab.classList.toggle('on', isActive);
    tab.setAttribute('aria-pressed', String(isActive));
    tab.setAttribute('aria-label', text('inventory.bagPage', 'Bag page {page}', { page: page + 1 }));
  }

  const start = bagPage * pageSize;
  const end = Math.min(start + pageSize, I.bagMax);
  const cells = [];
  for (let index = start; index < end; index++) {
    const item = BAG[index];
    cells.push(item
      ? slotHtml(item, 'data-tip="bag:' + item.uid + '" data-bag="' + item.uid + '"', mergeSel.includes(item.uid) ? ' sel' : '')
      : '<div class="slot empty"></div>');
  }
  $('bag').innerHTML = cells.join('');
}

function buildInv() {
  if (!I || !me) return;
  $('gld').textContent = '💰 ' + GameText.number(me.g);
  $('eqwrap').innerHTML = I.slots.map(s => EQ[s] ? slotHtml(EQ[s], 'data-tip="eq:' + s + '" data-eq="' + s + '"') : '<div class="slot empty" title="' + esc(text('slot.' + s, SLOTNAME[s])) + '">' + slotIcon(s) + '</div>').join('');
  const line = (n, v) => '<div>' + esc(text('inventory.metric.' + n, n)) + '<b>' + v + '</b></div>';
  $('gst').innerHTML = line('⚔ Damage', GS._dmg || 0) + line('🎯 Crit', (GS._crit || 12) + '%') + line('❤ Max HP', GS._hp || 0) + line('🛡 Reduction', (GS._dr || 0) + '%') + line('💧 Max MP', GS._mp || 0) + line('💨 Speed', '+' + Math.min(60, GS.spd || 0).toFixed(1) + '%') + line('📖 XP bonus', '+' + (GS.xpb || 0).toFixed(1) + '%') + line('💥 Crit damage', (GS._cdmg || 180) + '%') + line('🩸 Lifesteal', (GS._ls || 0) + '%') + line('⚡ Attack speed', '+' + (GS._haste || 0) + '%') + line('💰 Total gold find', '+' + (GS._gf || 0) + '%');
  renderBagPage();
  $('bagc').textContent = BAG.length + ' / ' + I.bagMax; $('bagfull').textContent = BAG.length >= I.bagMax ? text("inventory.full", "Bag full - merge or sell items.") : '';
  $('mergeBtn').classList.toggle('on', mergeMode); $('mergebar').style.display = mergeMode ? 'flex' : 'none';
  if (mergeMode) { const it = mergeSel.map(u => BAG.find(i => i.uid === u)).filter(Boolean), r = it.length ? it[0].rar : -1, lo = Math.max(1, Math.round(me.l * .8)), hi = Math.round(me.l * 1.2);
    $('mergeinfo').innerHTML = !it.length ? esc(text("inventory.mergePrompt", "Pick 3 bag items of the same colour (any slot, any level).")) : it.length + '/3 <b style="color:' + RC[r] + '">' + esc(text('rarity.' + (r), I.rarity[r])) + '</b> → <b style="color:' + RC[Math.min(4, r + 1)] + '">' + esc(text('rarity.' + (Math.min(4, r + 1)), I.rarity[Math.min(4, r + 1)])) + ' ' + esc(text('slot.' + it[0].slot, SLOTNAME[it[0].slot])) + '</b> · ' + esc(text('inventory.itemLevelShort', 'iLvl')) + ' ' + lo + '-' + hi;
    $('mergeGo').disabled = it.length !== 3; }
  const list = Object.keys(I.items).filter(k => me.inv[k] > 0);
  $('inl').innerHTML = list.length ? list.map(k => '<div class="chip" data-use="' + k + '" data-tip="cons:' + k + '">' + consIcon(k) + esc(itemName(k, I.items[k].n)) + ' ×' + me.inv[k] + '</div>').join('') : '<span class="mu" style="font-size:0.75rem">' + esc(text("inventory.noConsumables", "Nothing yet. Monsters drop potions and scrolls.")) + '</span>';
}
function tipItem(it, cmp, plusOverride) {
  const pl = plusOverride === undefined ? it.plus || 0 : plusOverride;
  let h = '<b class="nm" style="color:' + RC[it.rar] + '">' + esc(gearName(it.name)) + (pl ? ' +' + pl : '') + '</b><div class="mu">' + esc(text('rarity.' + (it.rar), I.rarity[it.rar])) + ' ' + (it.slot === 'weapon' ? esc(text('weapon.' + it.fam, { sword: 'Sword', bow: 'Bow', staff: 'Staff' }[it.fam] || 'Weapon')) : esc(text('slot.' + it.slot, SLOTNAME[it.slot]))) + ' · ' + esc(text('inventory.itemLevelShort', 'iLvl')) + ' ' + it.ilvl + '</div><div style="margin:5px 0">';
  for (const k of STATORDER) if (k in it.stats) { const v = eff(it, k, pl); let d = ''; if (cmp && cmp.uid !== it.uid) { const df = v - (k in cmp.stats ? eff(cmp, k) : 0); if (Math.abs(df) > 0.049) d = '<span class="' + (df > 0 ? 'up' : 'dn') + '">' + (df > 0 ? '▲' : '▼') + fmtS(k, Math.abs(df)) + '</span>'; } h += '<div class="ln"><span>+' + fmtS(k, v) + ' ' + esc(text('stat.' + k, I.stat[k].n)) + '</span>' + d + '</div>'; }
  if (cmp && cmp.uid !== it.uid) for (const k of STATORDER) if (k in cmp.stats && !(k in it.stats)) h += '<div class="ln dn"><span>-' + fmtS(k, eff(cmp, k)) + ' ' + esc(text('stat.' + k, I.stat[k].n)) + '</span><span>▼</span></div>';
  h += '</div><div class="' + (me.l < it.req ? 'dn' : 'mu') + '">' + esc(text('inventory.requiresLevel', 'Requires level {level}', { level: it.req })) + '</div>';
  if (isOpen('shopw')) h += '<div class="mu">' + esc(text('shop.sellPrice', 'Merchant pays {gold}g', { gold: sellValue(it) })) + '</div>';
  return h;
}
const tip = $('tip');
document.addEventListener('mouseover', e => {
  const el = e.target.closest && e.target.closest('[data-tip]'); if (!el || !I || !me) { tip.style.display = 'none'; return; }
  const [kind, id] = el.dataset.tip.split(':'); let h = '';
  if (kind === 'bag') { const it = BAG.find(x => x.uid === id); if (it) h = tipItem(it, EQ[it.slot]) + '<div class="mu" style="margin-top:4px">' + (mergeMode ? text("inventory.selectForMerge", "Click: select for merging") : text("inventory.clickEquip", "Click: equip") + (isOpen('shopw') ? text("inventory.shiftSell", " · Shift/right-click: sell") : '')) + '</div>'; }
  else if (kind === 'eq') { const it = EQ[id]; if (it) h = tipItem(it) + '<div class="mu" style="margin-top:4px">' + esc(text("inventory.clickUnequip", "Click: unequip")) + '</div>'; }
  else if (kind === 'sm') { const it = findItem(id); if (it) h = tipItem(it); }
  else if (kind === 'cons') { const it = I.items[id]; h = '<b class="nm" style="color:' + (it.color || '#fff') + '">' + esc(itemName(id, it.n)) + '</b><div>' + esc(itemDescription(id, it.d)) + '</div><div class="mu">' + esc(text('shop.buyPrice', 'Merchant price {gold}g', { gold: it.price })) + '</div>'; }
  if (!h) { tip.style.display = 'none'; return; } tip.innerHTML = h; tip.style.display = 'block';
});
document.addEventListener('mousemove', e => { if (tip.style.display === 'block') { const w = tip.offsetWidth, hh = tip.offsetHeight; tip.style.left = Math.min(innerWidth - w - 8, e.clientX + 16) + 'px'; tip.style.top = Math.min(innerHeight - hh - 8, e.clientY + 12) + 'px'; } });
document.addEventListener('mouseout', e => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('[data-tip]')) tip.style.display = 'none'; });
const findItem = uid => BAG.find(i => i.uid === uid) || Object.values(EQ).find(i => i && i.uid === uid);
document.addEventListener('click', e => {
  const t = e.target.closest('button,[data-bag],[data-eq],[data-use],[data-sm]'); if (!t) return; sfx('click');
  if (t.dataset.close !== undefined) { closeWin(t.closest('.win').id); return; }
  if (t.dataset.open) { togglePanel(t.dataset.open); return; }
  if (t.dataset.bagPage !== undefined) {
    bagPage = Number(t.dataset.bagPage);
    tip.style.display = 'none';
    renderBagPage();
    return;
  }
  if (t.dataset.sm) { smSel = t.dataset.sm; buildSmith(); return; }
  if (t.dataset.bag && mergeMode) { const id = t.dataset.bag, it = BAG.find(i => i.uid === id), k = mergeSel.indexOf(id); if (!it) return;
    if (k >= 0) mergeSel.splice(k, 1); else { const f = BAG.find(i => i.uid === mergeSel[0]); if (f && f.rar !== it.rar) mergeSel = []; if (mergeSel.length < 3) mergeSel.push(id); } buildInv(); return; }
  if (t.id === 'mergeBtn') { mergeMode = !mergeMode; mergeSel = []; buildInv(); return; }
  if (t.id === 'mergeGo') { if (mergeSel.length === 3) { send({ t: 'merge', uids: mergeSel }); mergeSel = []; sfx('equip'); } return; }
  if (t.id === 'autoMerge') { send({ t: 'automerge', max: 1 }); return; }
  if (t.id === 'autoMerge2') { send({ t: 'automerge', max: 2 }); return; }
  if (t.id === 'autoMerge3') { send({ t: 'automerge', max: 3 }); return; }
  if (t.id === 'junk') { send({ t: 'sellall', rar: 1 }); sfx('sell'); return; }
  if (t.id === 'junk2') { send({ t: 'sellall', rar: 2 }); sfx('sell'); return; }
  if (t.id === 'smgo') { if (smSel) { send({ t: 'upgrade', uid: smSel }); $('smres').textContent = '…'; $('smres').style.color = '#ccc'; sfx('click'); } return; }
  if (t.dataset.bag) { if (e.shiftKey && isOpen('shopw')) { send({ t: 'sell', uid: t.dataset.bag }); sfx('sell'); } else { send({ t: 'equip', uid: t.dataset.bag }); sfx('equip'); } tip.style.display = 'none'; return; }
  if (t.dataset.eq) { send({ t: 'unequip', slot: t.dataset.eq }); sfx('equip'); tip.style.display = 'none'; return; }
  if (t.dataset.use) { send({ t: 'use', i: t.dataset.use }); return; }
  if (t.dataset.learn) send({ t: 'learn', k: t.dataset.learn }); if (t.dataset.buy) send({ t: 'buy', i: t.dataset.buy, n: +t.dataset.n });
});
document.addEventListener('contextmenu', e => { const t = e.target.closest && e.target.closest('[data-bag]'); if (t) { e.preventDefault(); if (isOpen('shopw')) { send({ t: 'sell', uid: t.dataset.bag }); sfx('sell'); } else toast(text("inventory.sellAtMerchant", "Talk to the Merchant to sell items")); tip.style.display = 'none'; } });
document.querySelectorAll('#hotbar .sk').forEach(el => el.onclick = () => el.dataset.sk ? send({ t: 'skill', n: +el.dataset.sk }) : send({ t: 'use', i: el.dataset.it }));

// ---------- merchant / blacksmith ----------
function buildShop() {
  if (!I) return;
  $('shl').innerHTML = Object.keys(I.items).map(k => { const it = I.items[k]; return '<div class="row"><div class="ico">' + consIcon(k) + '</div><div class="t"><b style="color:' + (it.color || '#fff') + '">' + esc(itemName(k, it.n)) + '</b><small>' + esc(itemDescription(k, it.d)) + '</small></div><button data-buy="' + k + '" data-n="1">' + it.price + 'g</button><button data-buy="' + k + '" data-n="10">×10</button></div>'; }).join('');
}
function buildSmith() {
  if (!I || !me) return;
  const all = I.slots.map(s => EQ[s]).filter(Boolean);
  if (smSel && !findItem(smSel)) smSel = null; if (!smSel && EQ.weapon) smSel = EQ.weapon.uid;
  $('smpick').innerHTML = all.map((it, i) => slotHtml(it, 'data-sm="' + it.uid + '" data-tip="sm:' + it.uid + '"', (smSel === it.uid ? ' pick' : '')) + (i === I.slots.filter(s => EQ[s]).length - 1 && BAG.length ? '' : '')).join('');
  const it = smSel && findItem(smSel);
  if (!it) { $('smcard').innerHTML = '<div class="mu">' + esc(text("smith.noEquipment", "No equipment.")) + '</div>'; $('smgo').disabled = true; return; }
  const worn = true;
  if (it.plus >= 9) { $('smcard').innerHTML = '<div class="itemcard">' + tipItem(it) + '<div class="up" style="margin-top:6px">' + esc(text("smith.maxUpgrade", "Maximum level reached (+9).")) + '</div></div>'; $('smgo').disabled = true; return; }
  const c = upCost(it), ch = Math.round(I.upRate[it.plus] * 100);
  let rows = ''; for (const k of STATORDER) if (k in it.stats) rows += '<div class="ln"><span>' + esc(text('stat.' + k, I.stat[k].n)) + '</span><span>' + fmtS(k, eff(it, k)) + ' → <b class="up">' + fmtS(k, eff(it, k, it.plus + 1)) + '</b></span></div>';
  $('smcard').innerHTML = '<div class="itemcard"><b class="nm" style="color:' + RC[it.rar] + '">' + esc(gearName(it.name)) + ' +' + it.plus + ' → +' + (it.plus + 1) + '</b><div class="mu">' + (worn ? text("inventory.equipped", "Equipped") : text("inventory.inBag", "In bag")) + ' · ' + esc(text('inventory.itemLevelShort', 'iLvl')) + ' ' + it.ilvl + '</div><div style="margin:6px 0">' + rows + '</div>' +
    '<div class="ln"><span>' + esc(text("smith.cost", "Cost")) + '</span><b style="color:' + (me.g >= c ? '#ffd77a' : '#ff7a6a') + '">' + GameText.number(c) + 'g</b></div><div class="ln"><span>' + esc(text("smith.chance", "Success chance")) + '</span><b style="color:' + (ch >= 70 ? '#6fe39a' : ch >= 40 ? '#ffd24a' : '#ff7a6a') + '">' + ch + '%</b></div>' +
    (it.plus >= 5 ? '<div class="dn" style="margin-top:4px">' + esc(text('smith.failureLevel', '⚠ Failure drops the item to +{level}', { level: it.plus - 1 })) + '</div>' : '<div class="mu" style="margin-top:4px">' + esc(text("smith.goldOnly", "Failure only costs gold.")) + '</div>') + '</div>';
  $('smgo').disabled = me.g < c; $('smgo').textContent = text("smith.upgradeFor", "Upgrade for {cost}g", { cost: GameText.number(c) });
}
function onForge(m) {
  const r = $('smres'); r.textContent = m.ok ? text("smith.success", "✔ Success! Now +{level}", { level: m.plus }) : (m.drop ? text("smith.dropped", "✖ Failed - dropped to +{level}", { level: m.plus }) : text("smith.failed", "✖ Failed")); r.style.color = m.ok ? '#6fe39a' : '#ff7a6a';
  sfx(m.ok ? 'lvl' : 'fail'); if (m.ok && m.plus >= 7) toast(text("smith.forged", "Forged +{level}!", { level: m.plus }), '#ffd24a');
}

// ---------- skills ----------
const SK_ACT = ['s1', 'mend', 'frenzy'], SK_PAS = ['vit', 'might', 'swift', 'crit', 'critdmg', 'lifesteal', 'guard', 'haste', 'focus', 'fortune']; let skTab = 'act';
const PAS = { vit: ['Vitality', '❤️', 'max HP', 5, '%'], might: ['Might', '💪', 'damage', 5, '%'], swift: ['Swiftness', '💨', 'move speed', 4, '%'], crit: ['Precision', '🎯', 'critical hit chance', 1.5, '%'], critdmg: ['Brutality', '💥', 'critical hit damage', 12, '%'], lifesteal: ['Bloodthirst', '🩸', 'of damage dealt healed (lifesteal)', 0.8, '%'], guard: ['Iron Skin', '🛡️', 'less damage taken', 2.5, '%'], haste: ['Haste', '⚡', 'attack speed', 3.5, '%'], focus: ['Focus', '🔷', 'max MP and +10% MP regen per rank', 5, '%'], fortune: ['Fortune', '💰', 'gold find', 6, '%'] };
function skillInfo(k) {
  const c = I.classes[I.cls], r = me.sk[k] || 0, n = r || 1;
  switch (k) {
    case 's1': return [text('class.' + I.cls + '.s1', c.s1), '1', skillIcon('s1'),
      text('skill.attackDescription', '×{damage} damage · {mana} MP · {targets}', {
        damage: (c.s1m * (1 + .18 * (n - 1))).toFixed(2), mana: Math.round(c.s1c * (1 + .05 * (n - 1))),
        targets: I.cls === 'archer' ? text('skill.hitTargets', 'hits {count} targets', { count: 3 + (n >= 3 ? 2 : 0) + (n >= 5 ? 2 : 0) }) :
          text('skill.areaAttack', 'area attack'),
      })];
    case 'mend': return [text('class.' + I.cls + '.s2', c.s2), '2', skillIcon('mend'),
      text('skill.healDescription', 'Heal {health}% HP · 20 MP · {seconds}s cooldown', { health: Math.round(20 + 8 * n), seconds: 8 - .5 * n })];
    case 'frenzy': return [text('class.' + I.cls + '.s3', c.s3), '3', skillIcon('frenzy'),
      text('skill.rageDescription', '+{damage}% damage & faster attacks for {seconds}s · 30 MP', { damage: Math.round(20 + 5 * n), seconds: 6 + 2 * n })];
  }
  const p = PAS[k]; return [text('passive.' + k, p[0]), '', skillIcon(k), (r ? '+' + Math.round(p[3] * r * 10) / 10 + '% ' + text('passive.' + k + '.effect', p[2]) + ' · ' : '') + text('skill.nextRank', 'next rank +{bonus}%', { bonus: p[3] })];
}
function buildSkills() {
  if (!I || !me) return; $('spn').textContent = me.sp ? text("skill.points", "★ Points: {count}", { count: me.sp }) : text("skill.noPoints", "no points"); $('spn').style.color = me.sp ? '#ffe97a' : '';
  const list = skTab === 'act' ? SK_ACT : SK_PAS, mx = k => SK_ACT.includes(k) ? I.maxRank : (I.pMax || 10);
  $('skl').innerHTML = '<div class="tabs"><button data-sktab="act" class="' + (skTab === 'act' ? 'on' : '') + '">' + esc(text("skills.active", "Active skills")) + '</button><button data-sktab="pas" class="' + (skTab === 'pas' ? 'on' : '') + '">' + esc(text("skills.passive", "Passive skills")) + '</button></div>' +
    list.map(k => { const [n, key, ic, d] = skillInfo(k), r = me.sk[k] || 0, M_ = mx(k); return '<div class="row"><div class="ico">' + ic + '</div><div class="t"><b>' + esc(n) + '</b>' + (key ? ' <kbd>' + (BINDS['skill' + key] || key).toUpperCase() + '</kbd>' : '') + ' <span class="mu" style="font-size:0.6875rem">' + r + '/' + M_ + '</span><span class="pips">' + Array.from({ length: M_ }, (_, i) => '<i class="' + (i < r ? 'on' : '') + '"' + (M_ > 5 ? ' style="width:6px"' : '') + '></i>').join('') + '</span><small>' + esc(r || k === 's1' || !key ? d : text("skill.notLearned", "Not learned")) + '</small></div><button data-learn="' + k + '"' + (me.sp > 0 && r < M_ ? '' : ' disabled') + '>+</button></div>'; }).join('') +
    '<div class="mu" style="font-size:0.6875rem;margin-top:6px">' + esc(text('skill.summary', '1 point per level. Actives max {active}, passives max {passive}. A Skill Reset Scroll (Merchant) refunds everything.', { active: I.maxRank, passive: I.pMax || 10 })) + '</div>';
}
document.addEventListener('click', e => { const t = e.target.closest('[data-sktab]'); if (t) { skTab = t.dataset.sktab; buildSkills(); } });
// ---------- settings & key bindings ----------
const BIND_DEF = { skill1: '1', skill2: '2', skill3: '3', hp: 'q', mp: 'e', hp2: 'r', ret: 't', talk: 'f', inv: 'i', skills: 'k', settings: 'o', mute: 'm', gfx: 'g', fps: 'p', attack: ' ' };
const BIND_NAME = { skill1: 'Skill 1', skill2: 'Skill 2', skill3: 'Skill 3', hp: 'Health potion', mp: 'Mana potion', hp2: 'Greater health potion', ret: 'Return scroll', talk: 'Talk to NPC', inv: 'Inventory', skills: 'Skills window', settings: 'Settings', mute: 'Mute', gfx: 'Cycle graphics quality', fps: 'FPS counter', attack: 'Attack nearest monster' };
let BINDS = Object.assign({}, BIND_DEF); try { Object.assign(BINDS, JSON.parse(localStorage.getItem('sl_keys') || '{}')); } catch (e) {}
if (Object.keys(BIND_DEF).some(action => action !== 'attack' && BINDS[action] === BINDS.attack)) BINDS.attack = '';
let bindWait = null;
const keyName = k => ({ ' ': 'SPACE', control: 'CTRL', shift: 'SHIFT', alt: 'ALT', tab: 'TAB' })[k] || (k ? k.toUpperCase() : text("settings.unbound", "UNBOUND"));
function actionOf(k) { for (const a in BINDS) if (BINDS[a] === k) return a; return null; }
function saveBinds() { try { localStorage.setItem('sl_keys', JSON.stringify(BINDS)); } catch (e) {} applyBindLabels(); }
function applyBindLabels() { const map = { '1': 'skill1', '2': 'skill2', '3': 'skill3' }; document.querySelectorAll('#hotbar [data-sk]').forEach(el => el.querySelector('.key').textContent = keyName(BINDS['skill' + el.dataset.sk])); document.querySelectorAll('#hotbar [data-it]').forEach(el => el.querySelector('.key').textContent = keyName(BINDS[el.dataset.it])); }
function buildKeys() { $('kbl').innerHTML = Object.keys(BIND_DEF).map(a => '<span>'  + esc(text('binding.' + a, BIND_NAME[a])) + '</span><button data-bind="' + a + '" class="' + (bindWait === a ? 'wait' : '') + '">' + (bindWait === a ? text("settings.pressKey", "press…") : keyName(BINDS[a])) + '</button>').join(''); }
addEventListener('keydown', e => {
  if (!bindWait) return; e.preventDefault(); e.stopImmediatePropagation(); const k = e.key.toLowerCase();
  if (k !== 'escape') { if ('wasd'.includes(k) && k.length === 1 || k.startsWith('arrow') || k === 'enter') { toast(text("settings.reservedKey", "That key is reserved for movement / chat")); } else { const other = actionOf(k); if (other && other !== bindWait) BINDS[other] = BINDS[bindWait]; BINDS[bindWait] = k; saveBinds(); } }
  bindWait = null; buildKeys();
}, true);
document.addEventListener('click', e => { const b = e.target.closest('[data-bind]'); if (b) { bindWait = b.dataset.bind; buildKeys(); return; } const t = e.target.closest('[data-stab]'); if (t) { document.querySelectorAll('[data-stab]').forEach(x => x.classList.toggle('on', x === t)); document.querySelectorAll('[data-spage]').forEach(p => p.style.display = p.dataset.spage === t.dataset.stab ? 'block' : 'none'); } });
$('kbreset').onclick = () => { BINDS = Object.assign({}, BIND_DEF); saveBinds(); buildKeys(); toast(text("settings.keysReset", "Key bindings reset")); };
const textScaleInput = $('text-scale');
textScaleInput.value = Math.round(GameText.getScale() * 100);
$('text-scale-value').textContent = textScaleInput.value + '%';
textScaleInput.oninput = () => {
  GameText.setScale(textScaleInput.value / 100);
  $('text-scale-value').textContent = textScaleInput.value + '%';
};
document.addEventListener('game-language-change', () => {
  if (!I) return;
  hudInit();
  tip.style.display = 'none';
  if (me) {
    hud();
    if (isOpen('invp')) buildInv();
    if (isOpen('skillp')) buildSkills();
    if (isOpen('smithw')) buildSmith();
  }
  if (isOpen('setw')) buildSettings();
});
function volLabels() { $('volv').textContent = Math.round(volume * 100) + '%'; $('volcv').textContent = Math.round(volC * 100) + '%'; $('voluv').textContent = Math.round(volU * 100) + '%'; }
function buildSettings() { $('gfxsel').value = GL.Q.mode; $('fpschk').checked = $('perf').style.display === 'block'; $('vol').value = Math.round(volume * 100); $('volc').value = Math.round(volC * 100); $('volu').value = Math.round(volU * 100); $('mutechk').checked = muted; volLabels(); buildKeys(); }
$('gfxsel').onchange = e => { GL.setQuality(e.target.value); toast(text("settings.qualityChanged", "Graphics: {quality}", { quality: qualityName(e.target.value) })); };
$('fpschk').onchange = e => { $('perf').style.display = e.target.checked ? 'block' : 'none'; };
const store = (k, v) => { try { localStorage.setItem(k, v); } catch (x) {} };
$('vol').oninput = e => { volume = e.target.value / 100; if (master) master.gain.value = volume; store('sl_vol', volume); volLabels(); };
$('volc').oninput = e => { volC = e.target.value / 100; store('sl_volc', volC); volLabels(); };
$('volu').oninput = e => { volU = e.target.value / 100; store('sl_volu', volU); volLabels(); };
$('volc').onchange = () => sfx('hit'); $('volu').onchange = () => sfx('coin');
$('mutechk').onchange = e => { muted = e.target.checked; store('sl_mute', muted ? '1' : '0'); };
applyBindLabels();

// ---------- HUD (only touches the DOM when a value changed) ----------
const _hc = {}; let _hot = null;
function setT(id, v) { if (_hc[id] !== v) { _hc[id] = v; $(id).textContent = v; } }
function setH(id, v) { if (_hc[id] !== v) { _hc[id] = v; $(id).innerHTML = v; } }
function setD(id, v) { const k = 'd:' + id; if (_hc[k] !== v) { _hc[k] = v; $(id).style.display = v; } }
function setBar(id, v, mx, t) { const p = Math.round(Math.max(0, Math.min(100, v / mx * 100)) * 2) / 2, k = 'b:' + id; if (_hc[k] !== p) { _hc[k] = p; $(id).firstChild.style.width = p + '%'; } const k2 = 't:' + id; if (_hc[k2] !== t) { _hc[k2] = t; $(id).lastChild.textContent = t; } }
function hudInit() {
  const c = I.classes[I.cls]; $('who').innerHTML = esc(I.name) + ' <small>' + esc(className(I.cls, c.name)) + '</small>'; $('portrait').innerHTML = uiImg('skill-' + clsKey(I.cls));
  const sk = document.querySelectorAll('#hotbar [data-sk]'); ['s1', 'mend', 'frenzy'].forEach((k, i) => sk[i].querySelector('.ic').innerHTML = skillIcon(k));
  document.querySelectorAll('#hotbar [data-it]').forEach(el => el.querySelector('.ic').innerHTML = consIcon(el.dataset.it));
  [text('class.' + I.cls + '.s1', c.s1), c.s2, c.s3].forEach((n, i) => sk[i].querySelector('.nm').textContent = text('class.' + I.cls + '.s' + (i + 1), n)); buildShop();
}
function hud() {
  setT('plvl', me.l); setBar('hp', me.hp, me.mh, me.hp + ' / ' + me.mh); setBar('mp', me.mp, me.mm, me.mp + ' / ' + me.mm);
  setBar('xpbar', me.xp, me.xn, text("zone.levelShort", "Lv ") + me.l + ' · ' + Math.floor(me.xp / me.xn * 1000) / 10 + '%');
  setT('goldl', '💰 ' + GameText.number(me.g) + '   🎒 ' + me.bag + '/' + I.bagMax); setD('sppill', me.sp > 0 ? 'block' : 'none');
  setH('buffs', Object.keys(me.buf).map(k => '<span class="bf">'  + esc(text('buff.' + k, BUFFN[k] || k)) + ' ' + Math.ceil(me.buf[k] / 1000) + 's</span>').join(''));
  if (!_hot) _hot = { sk: [...document.querySelectorAll('#hotbar [data-sk]')].map(el => ({ el, rk: el.querySelector('.rk'), u: el.querySelector('u') })), it: [...document.querySelectorAll('#hotbar [data-it]')].map(el => ({ el, em: el.querySelector('em'), k: el.dataset.it })) };
  _hot.sk.forEach((h, i) => { const r = me.sk[['s1', 'mend', 'frenzy'][i]], c = [me.c1, me.c2, me.c3][i]; if (c > cdMax[i]) cdMax[i] = c; const cd = Math.round(Math.min(100, c / cdMax[i] * 100)); if (h.r !== r) { h.r = r; h.el.classList.toggle('lock', r < 1); h.rk.textContent = r ? 'R' + r : ''; } if (h.cd !== cd) { h.cd = cd; h.u.style.setProperty('--p', cd); } });
  _hot.it.forEach(h => { const n = me.inv[h.k] || 0; if (h.n !== n) { h.n = n; h.em.textContent = n; h.el.classList.toggle('lock', !n); } });
  setD('dead', me.dead ? 'flex' : 'none'); if (me.dead) setT('deadsec', text("hud.respawn", "Respawning in {seconds}s", { seconds: Math.ceil(me.dead / 1000) }));
  const low = me.hp / me.mh < 0.3 && !me.dead; if (_hc.low !== low) { _hc.low = low; $('hurtfx').classList.toggle('low', low); if (!low) $('hurtfx').style.opacity = 0; }
  const T = me.tg && mo.find(m => m.id === me.tg);
  if (T) { const t = I.types[T.ty]; setD('tgt', 'block'); setH('tgtn', (t.boss ? '<span style="color:#ffd24a">★ </span>' : '') + (T.al ? '<span style="color:#ffb04a">' + esc(text("mob.alpha", "Alpha ")) + '</span>' : '') + esc(mobName(T.ty, t.n)) + ' ' + monsterLevelLabel(T.l, me.l) + (t.boss ? '<span class="tag" style="background:#ffd24a;color:#000">' + esc(text("mob.bossTag", "BOSS")) + '</span>' : T.al ? '<span class="tag" style="background:#ffb04a;color:#000">' + esc(text("mob.alphaTag", "ALPHA")) + '</span>' : '')); const b = $('tgt').querySelector('.bar'), p = Math.round(Math.max(0, T.hp / T.mh * 100)); if (_hc.tp !== p) { _hc.tp = p; b.firstChild.style.width = p + '%'; } const tx = GameText.number(T.hp) + ' / ' + GameText.number(T.mh); if (_hc.tt !== tx) { _hc.tt = tx; b.lastChild.textContent = tx; } } else setD('tgt', 'none');
  const s = me.sp + '|' + me.g + '|' + me.l + '|' + JSON.stringify(me.sk) + JSON.stringify(me.inv);
  if (s !== sig) { sig = s; if (isOpen('skillp')) buildSkills(); if (isOpen('invp')) buildInv(); if (isOpen('smithw')) buildSmith(); }
}
