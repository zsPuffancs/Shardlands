// Shardlands 3D client UI: HUD, windows (inventory, skills, merchant, blacksmith, settings), tooltips, sound, toasts.
let BAG = [], EQ = {}, GS = {}, sig = '', cdMax = [2000, 8000, 25000], mergeMode = false, mergeSel = [], smSel = null;
const RC = ['#d8d8d8', '#4ee26a', '#4da3ff', '#b25cff', '#ff9d2e', '#ff4560'];
const MERGE_COST = [2, 3, 4, 5, 15], REROLL_COST = [1, 1, 2, 3, 5, 10], NPCWIN = { merchant: 'shopw', smith: 'smithw', mystic: 'mysticw', portal: 'portalw', camp: 'campw' };
let SKB = {}, SOULS = 0, mySel = null;
const SLOTICON = { weapon: '⚔️', helm: '⛑️', armor: '🛡️', boots: '🥾', ring: '💍', amulet: '📿', sword: '⚔️', bow: '🏹', staff: '🪄' };
const SLOTNAME = { weapon: 'Weapon', helm: 'Helm', armor: 'Armor', boots: 'Boots', ring: 'Ring', amulet: 'Amulet' };
const STATORDER = ['dmg', 'hp', 'mp', 'def', 'crit', 'spd'];
const BUFFN = { atk: '⚔ Fury', def: '🛡 Iron', spd: '💨 Swift', xp: '📖 Wisdom', rage: '🔥 Rage' };
const SK = ['s1', 'mend', 'frenzy', 'vit', 'might', 'swift'];
const CLSICON = { blade: '⚔️', archer: '🏹', mage: '🔮' }, S1ICON = { blade: '🌀', archer: '🎯', mage: '✴️' };
const ITEMICON = { hp: '❤️', hp2: '💖', mp: '💧', atk: '⚔️', def: '🛡️', spd: '💨', xp: '📖', ret: '🏠', reset: '♻️' };
const RNAME = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'], CONS_ICON = { hp: 1, mp: 1, hp2: 1, atk: 1, def: 1, spd: 1, xp: 1, ret: 1, reset: 1 };
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
function hurtFlash(strong) { if (document.body.classList.contains('reduce-motion')) strong = false; const h = $('hurtfx'); if (!h.classList.contains('low')) h.style.opacity = strong ? 0.9 : 0.55; clearTimeout(flashT); flashT = setTimeout(() => { if (!h.classList.contains('low')) h.style.opacity = 0; }, 160); }

// ---------- windows ----------
let zTop = 20;
const isOpen = id => $(id).style.display === 'flex';
function openWin(id) { const w = $(id); w.style.display = 'flex'; w.style.zIndex = ++zTop; if (id === 'invp') buildInv(); if (id === 'skillp') buildSkills(); if (id === 'shopw') buildShop(); if (id === 'smithw') buildSmith(); if (id === 'mysticw') buildMystic(); if (id === 'chronw') { buildChronicle(); send({ t: 'universe' }); } if (id === 'portalw') { buildPortal(); send({ t: 'portal' }); } if (id === 'campw') buildCamp(); if (id === 'teamw') buildTeam(); if (id === 'tradew') buildTrade(); if (id === 'setw') buildSettings(); tip.style.display = 'none'; }
function closeWin(id) { if (id === 'tradew' && TRADE) send({ t: 'trade', op: 'cancel' }); $(id).style.display = 'none'; if (id === 'invp') { mergeMode = false; mergeSel = []; } if (id === 'setw') bindWait = null; tip.style.display = 'none'; }
function togglePanel(id) { if (isOpen(id)) closeWin(id); else openWin(id); }
function closeAll() { for (const id of ['invp', 'skillp', 'shopw', 'smithw', 'mysticw', 'portalw', 'campw', 'chronw', 'teamw', 'tradew', 'setw']) closeWin(id); }
document.querySelectorAll('.win').forEach(w => {
  const h = w.querySelector('.win-h'); w.addEventListener('mousedown', () => { w.style.zIndex = ++zTop; });
  h.addEventListener('mousedown', e => { if (e.target.closest('button')) return; const r = w.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
    const mv = ev => { w.style.left = Math.max(0, Math.min(innerWidth - 60, ev.clientX - ox)) + 'px'; w.style.top = Math.max(0, Math.min(innerHeight - 40, ev.clientY - oy)) + 'px'; w.style.right = 'auto'; w.style.marginLeft = 0; };
    const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); }; addEventListener('mousemove', mv); addEventListener('mouseup', up); e.preventDefault(); });
});
// NPCs: open the window that belongs to the NPC (game.js calls this when you reach them)
function openNpc(k) { for (const n in NPCWIN) if (n !== k) closeWin(NPCWIN[n]); openWin(NPCWIN[k] || 'shopw'); if (k !== 'portal' && k !== 'camp' && !isOpen('invp')) openWin('invp'); sfx('click'); }

// ---------- inventory ----------
function slotHtml(it, attrs, extra) {
  // Item level sits in the top-right corner, green/red against the equipped item of the same slot (▲/▼ for colour-blind players).
  // The +upgrade is top-left; the rarity letter (see Settings) and the lock mark sit bottom-left.
  const worn = typeof EQ !== 'undefined' && EQ[it.slot], diff = worn && worn.uid !== it.uid ? it.ilvl - worn.ilvl : 0;
  const ilv = '<sup class="ilv' + (diff > 0 ? ' up' : diff < 0 ? ' dn' : '') + '">' + (diff > 0 ? '▲' : diff < 0 ? '▼' : '') + it.ilvl + '</sup>';
  return '<div class="slot r' + it.rar + (it.lk ? ' locked' : '') + (extra || '') + '" ' + attrs + '>' + iconOf(it) + ilv + (it.plus ? '<sub>+' + it.plus + '</sub>' : '') + '<b class="rmark">' + esc(text('rarity.' + it.rar + '.short', 'CURELM'[it.rar] || '')) + '</b>' + (it.lk ? '<i class="lockmark">🔒</i>' : '') + '</div>';
}
function onInv(m) { BAG = m.bag; EQ = m.eq; GS = m.gs; SKB = m.skb || {}; SOULS = m.souls || 0; mergeSel = mergeSel.filter(u => BAG.some(i => i.uid === u)); if (isOpen('invp')) buildInv(); if (isOpen('smithw')) buildSmith(); if (isOpen('mysticw')) buildMystic(); if (isOpen('skillp')) buildSkills(); if (isOpen('tradew')) buildTrade(); }
let bagPage = 0;

function renderBagPage() {
  const pageSize = I.bagPageSize || 30;
  const pageCount = Math.ceil(I.bagMax / pageSize);

  const pageBar = $('bag-pages');
  const consumables = bagPage === 'cons';
  if (!consumables) bagPage = Math.max(0, Math.min(bagPage, pageCount - 1));
  // One tab per bag page, then a tab for consumables.
  if (pageBar.children.length !== pageCount + 1) {
    const tabs = Array.from({ length: pageCount }, (_, page) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.dataset.bagPage = page;
      tab.textContent = page + 1;
      tab.setAttribute('aria-controls', 'bag');
      return tab;
    });
    const consTab = document.createElement('button'); consTab.type = 'button'; consTab.dataset.bagPage = 'cons'; consTab.className = 'constab'; consTab.setAttribute('aria-controls', 'bag');
    tabs.push(consTab);
    pageBar.replaceChildren(...tabs);
  }
  for (const tab of pageBar.children) {
    const isCons = tab.dataset.bagPage === 'cons', page = isCons ? 'cons' : Number(tab.dataset.bagPage);
    const isActive = page === bagPage;
    tab.classList.toggle('on', isActive);
    tab.setAttribute('aria-pressed', String(isActive));
    if (isCons) { tab.textContent = text('inventory.consumablesTab', '🧪 Consumables'); tab.setAttribute('aria-label', text('inventory.consumables', 'Consumables')); }
    else tab.setAttribute('aria-label', text('inventory.bagPage', 'Bag page {page}', { page: page + 1 }));
  }
  if (consumables) {
    const list = Object.keys(I.items).filter(k => me.inv[k] > 0);
    $('bag').innerHTML = list.length ? list.map(k => '<div class="slot cons" data-use="' + k + '" data-tip="cons:' + k + '">' + consIcon(k) + '<sub>×' + me.inv[k] + '</sub></div>').join('') : '<div class="mu" style="grid-column:1/-1;font-size:0.75rem">' + esc(text("inventory.noConsumables", "Nothing yet. Monsters drop potions and scrolls.")) + '</div>';
    $('bag').classList.add('consview'); return;
  }
  $('bag').classList.remove('consview');

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
  $('gst').innerHTML = line('⚔ Damage', me.dmg ?? GS._dmg ?? 0) + line('🎯 Crit', (GS._crit || 12) + '%') + line('❤ Max HP', GS._hp || 0) + line('🛡 Reduction', (GS._dr || 0) + '%') + line('💧 Max MP', GS._mp || 0) + line('💨 Speed', '+' + Math.min(60, GS.spd || 0).toFixed(1) + '%') + line('💥 Crit damage', (GS._cdmg || 180) + '%') + line('🩸 Lifesteal', (GS._ls || 0) + '%') + line('⚡ Attack speed', '+' + (GS._haste || 0) + '%') + line('💰 Gold find', '+' + (GS._gf || 0) + '%');
  renderBagPage();
  $('bagc').textContent = BAG.length + ' / ' + I.bagMax; $('bagfull').textContent = BAG.length >= I.bagMax ? text("inventory.full", "Bag full - merge or sell items.") : '';
  $('mergeBtn').classList.toggle('on', mergeMode); $('mergebar').style.display = mergeMode ? 'flex' : 'none';
  if (mergeMode) { const it = mergeSel.map(u => BAG.find(i => i.uid === u)).filter(Boolean), r = it.length ? it[0].rar : -1, need = MERGE_COST[r] || 0, avg = it.length ? Math.max(1, Math.round(it.reduce((s, i) => s + (i.ilvl || 1), 0) / it.length)) : 0;
    $('mergeinfo').innerHTML = !it.length ? esc(text("inventory.mergePromptCounts", "Pick items of one colour: 2 Common, 3 Uncommon, 4 Rare, 5 Epic or 15 Legendary make 1 item of the next colour.")) : it.length + '/' + need + ' <b style="color:' + RC[r] + '">' + esc(text('rarity.' + (r), I.rarity[r])) + '</b> → <b style="color:' + RC[r + 1] + '">' + esc(text('rarity.' + (r + 1), I.rarity[r + 1])) + ' ' + esc(text('slot.' + it[0].slot, SLOTNAME[it[0].slot])) + '</b> · ' + esc(text('inventory.itemLevelShort', 'iLvl')) + ' ' + avg;
    $('mergeGo').disabled = !need || it.length !== need; }
  const list = Object.keys(I.items).filter(k => me.inv[k] > 0);
  if ($('inl')) $('inl').innerHTML = list.length ? list.map(k => '<div class="chip" data-use="' + k + '" data-tip="cons:' + k + '">' + consIcon(k) + esc(itemName(k, I.items[k].n)) + ' ×' + me.inv[k] + '</div>').join('') : '<span class="mu" style="font-size:0.75rem">' + esc(text("inventory.noConsumables", "Nothing yet. Monsters drop potions and scrolls.")) + '</span>';
}
// "(▲ +7 vs equipped)" next to the item level when the tooltip compares against worn gear.
function ilvlCompare(it, cmp) {
  if (!cmp || cmp.uid === it.uid) return '';
  const d = it.ilvl - cmp.ilvl;
  if (!d) return ' <span class="mu">(' + esc(text('inventory.ilvlSame', 'same as equipped')) + ')</span>';
  return ' <span class="' + (d > 0 ? 'up' : 'dn') + '">(' + (d > 0 ? '▲ +' : '▼ ') + d + ' ' + esc(text('inventory.ilvlVsEquipped', 'vs equipped {level}', { level: cmp.ilvl })) + ')</span>';
}
function tipItem(it, cmp, plusOverride) {
  const pl = plusOverride === undefined ? it.plus || 0 : plusOverride;
  let h = '<b class="nm" style="color:' + RC[it.rar] + '">' + esc(gearName(it.name)) + (pl ? ' +' + pl : '') + '</b><div class="mu">' + esc(text('rarity.' + (it.rar), I.rarity[it.rar])) + ' ' + (it.slot === 'weapon' ? esc(text('weapon.' + it.fam, { sword: 'Sword', bow: 'Bow', staff: 'Staff' }[it.fam] || 'Weapon')) : esc(text('slot.' + it.slot, SLOTNAME[it.slot]))) + ' · ' + esc(text('inventory.itemLevelShort', 'iLvl')) + ' ' + it.ilvl + ilvlCompare(it, cmp) + '</div><div style="margin:5px 0">';
  // Without Shift the tooltip stays short: stats plus a one-line verdict. Shift adds each stat's change and its possible range.
  let better = 0, worse = 0;
  for (const k of STATORDER) if (k in it.stats) { const v = eff(it, k, pl); let d = ''; if (cmp && cmp.uid !== it.uid) { const df = v - (k in cmp.stats ? eff(cmp, k) : 0); if (df > 0.049) better++; else if (df < -0.049) worse++; if (SHIFT && Math.abs(df) > 0.049) d = '<span class="' + (df > 0 ? 'up' : 'dn') + '">' + (df > 0 ? '▲' : '▼') + fmtS(k, Math.abs(df)) + '</span>'; } h += '<div class="ln"><span>+' + fmtS(k, v) + ' ' + esc(text('stat.' + k, I.stat[k].n)) + '</span>' + (SHIFT && it.rg && it.rg[k] ? '<span class="rg">' + fmtS(k, it.rg[k][0] * eff({ stats: { [k]: 1 }, slot: it.slot, plus: pl }, k)) + '–' + fmtS(k, it.rg[k][1] * eff({ stats: { [k]: 1 }, slot: it.slot, plus: pl }, k)) + '</span>' : '') + d + '</div>'; }
  if (cmp && cmp.uid !== it.uid) for (const k of STATORDER) if (k in cmp.stats && !(k in it.stats)) { worse++; if (SHIFT) h += '<div class="ln dn"><span>-' + fmtS(k, eff(cmp, k)) + ' ' + esc(text('stat.' + k, I.stat[k].n)) + '</span><span>▼</span></div>'; }
  if (it.afx && I.affixes[it.afx.k]) h += '<div class="ln afx"><span>+' + (+it.afx.v).toFixed(1) + ' ' + esc(text('affix.' + it.afx.k, I.affixes[it.afx.k].n)) + '</span>' + (SHIFT && it.rg && it.rg['afx:' + it.afx.k] ? '<span class="rg">' + it.rg['afx:' + it.afx.k][0].toFixed(1) + '–' + it.rg['afx:' + it.afx.k][1].toFixed(1) + '</span>' : '') + '</div>';
  if (!SHIFT && cmp && cmp.uid !== it.uid && (better || worse)) h += '<div class="cmpsum">' + (better ? '<span class="up">▲ ' + esc(text('inventory.better', '{count} better', { count: better })) + '</span> ' : '') + (worse ? '<span class="dn">▼ ' + esc(text('inventory.worse', '{count} worse', { count: worse })) + '</span> ' : '') + '<span class="mu">' + esc(text('inventory.thanEquipped', 'than equipped')) + '</span></div>';
  if (it.lk) h += '<div class="mu" style="color:#ffb04a">🔒 ' + esc(text('inventory.lockedLine', 'Locked: cannot be sold, merged or traded. Ctrl+click to unlock.')) + '</div>';
  if (SHIFT && it.rg) h += '<div class="mu" style="font-size:0.6875rem">' + esc(text('inventory.rangeHint', 'Possible values for this item level and rarity') + (pl ? ' (+' + pl + ')' : '')) + '</div>';
  else if (it.rg) h += '<div class="mu" style="font-size:0.6875rem">' + esc(text('inventory.shiftForDetails', 'Shift: comparison and possible values · Ctrl+click: lock')) + '</div>';
  if (it.psk) h += '<div class="ln" style="color:#ff8a9a;margin-top:2px"><span>' + esc(text('inventory.mythicPassives', 'Mythic: passive skill ranks')) + '</span></div>' + Object.keys(it.psk).map(k => '<div class="ln" style="color:#ff6a80"><span>+' + it.psk[k] + ' ' + esc(text('passive.' + k, PAS[k] ? PAS[k][0] : k)) + '</span></div>').join('');
  h += '</div><div class="' + (me.l < it.req ? 'dn' : 'mu') + '">' + esc(text('inventory.requiresLevel', 'Requires level {level}', { level: it.req })) + '</div>';
  if (isOpen('shopw')) h += '<div class="mu">' + esc(text('shop.sellPrice', 'Merchant pays {gold}g', { gold: sellValue(it) })) + '</div>';
  return h;
}
const tip = $('tip');
const skillTooltipSelector = '#hotbar [data-sk], #skl [data-passive-skill]';
let hoveredSkillElement = null;
function updateSkillTooltip(shiftHeld) {
  if (!hoveredSkillElement) return;
  if (!shiftHeld || !I || !me || !hoveredSkillElement.isConnected) {
    tip.style.display = 'none';
    return;
  }

  const { sk, passiveSkill } = hoveredSkillElement.dataset;
  const skill = passiveSkill || SK_ACT[Number(sk) - 1];
  const [name, key, , description] = skillInfo(skill);
  const rank = me.sk[skill] || 0;
  const hasBonus = passiveSkill ? effectivePassiveRank(skill) > 0 : rank > 0;
  const status = hasBonus
    ? text('skill.tooltipRank', 'Rank {rank}/{max}', { rank, max: maxSkillRank(skill) })
    : text('skill.tooltipUnlearned', 'Not learned · Rank 1 preview');
  const effect = passiveSkill ? passiveTooltipDescription(skill) : description;
  const shortcut = key ? ' · <kbd>' + esc(keyName(BINDS['skill' + key])) + '</kbd>' : '';
  tip.innerHTML = '<b class="nm">' + esc(name) + '</b><div>' + esc(effect) +
    '</div><div class="mu">' + esc(status) + shortcut + '</div>';
  tip.style.display = 'block';

  const bounds = hoveredSkillElement.getBoundingClientRect();
  const above = bounds.top - tip.offsetHeight - 8;
  const top = above >= 8 ? above : bounds.bottom + 8;
  tip.style.left = Math.max(8, Math.min(bounds.left, innerWidth - tip.offsetWidth - 8)) + 'px';
  tip.style.top = Math.max(8, Math.min(top, innerHeight - tip.offsetHeight - 8)) + 'px';
}
for (const event of ['keydown', 'keyup']) {
  document.addEventListener(event, e => {
    if (e.key === 'Shift' && !e.repeat) updateSkillTooltip(e.shiftKey);
  });
}
addEventListener('blur', () => {
  updateSkillTooltip(false);
  hoveredSkillElement = null;
});
document.addEventListener('mouseover', e => {
  hoveredSkillElement = e.target.closest?.(skillTooltipSelector) || null;
  if (hoveredSkillElement) {
    updateSkillTooltip(e.shiftKey);
    return;
  }
  const el = e.target.closest && e.target.closest('[data-tip]'); tipEl = el; showTip(el);
});
// Item tooltips are rebuilt when Shift goes down or up, to show or hide the possible stat values.
let SHIFT = false, tipEl = null;
for (const event of ['keydown', 'keyup']) document.addEventListener(event, e => { if (e.key !== 'Shift' || e.repeat) return; SHIFT = e.type === 'keydown'; if (tipEl && tipEl.isConnected && tip.style.display === 'block') showTip(tipEl); });
addEventListener('blur', () => { SHIFT = false; });
function showTip(el) {
  if (!el || !I || !me) { tip.style.display = 'none'; return; }
  const [kind, id] = el.dataset.tip.split(':'); let h = '';
  if (kind === 'bag') { const it = BAG.find(x => x.uid === id); if (it) h = tipItem(it, EQ[it.slot]) + '<div class="mu" style="margin-top:4px">' + (mergeMode ? text("inventory.selectForMerge", "Click: select for merging") : text("inventory.clickEquip", "Click: equip") + (isOpen('shopw') ? text("inventory.shiftSell", " · Shift/right-click: sell") : '')) + '</div>'; }
  else if (kind === 'eq') { const it = EQ[id]; if (it) h = tipItem(it) + '<div class="mu" style="margin-top:4px">' + esc(text("inventory.clickUnequip", "Click: unequip")) + '</div>'; }
  else if (kind === 'sm' || kind === 'my' || kind === 'af' || kind === 'mm' || kind === 'tr') { const it = findItem(id); if (it) h = tipItem(it); }
  else if (kind === 'to') { const it = TRADE && TRADE.theirs.items.find(x => x.uid === id); if (it) h = tipItem(it, EQ[it.slot]); }
  else if (kind === 'cons') { const it = I.items[id]; h = '<b class="nm" style="color:' + (it.color || '#fff') + '">' + esc(itemName(id, it.n)) + '</b><div>' + esc(itemDescription(id, it.d)) + '</div><div class="mu">' + esc(text('shop.buyPrice', 'Merchant price {gold}g', { gold: it.price })) + '</div>'; }
  if (!h) { tip.style.display = 'none'; return; } tip.innerHTML = h; tip.style.display = 'block';
}
document.addEventListener('mousemove', e => { if (!hoveredSkillElement && tip.style.display === 'block') { const w = tip.offsetWidth, hh = tip.offsetHeight; tip.style.left = Math.max(8, e.clientX + 16 + w > innerWidth - 8 ? e.clientX - w - 16 : e.clientX + 16) + 'px'; tip.style.top = Math.max(8, Math.min(innerHeight - hh - 8, e.clientY + 12)) + 'px'; } });
document.addEventListener('mouseout', e => {
  if (hoveredSkillElement) {
    if (e.relatedTarget instanceof Node && hoveredSkillElement.contains(e.relatedTarget)) return;
    hoveredSkillElement = null;
    tip.style.display = 'none';
    return;
  }
  if (!e.relatedTarget?.closest?.('[data-tip]')) tip.style.display = 'none';
});
const findItem = uid => BAG.find(i => i.uid === uid) || Object.values(EQ).find(i => i && i.uid === uid);
document.addEventListener('click', e => {
  const t = e.target.closest('button,[data-bag],[data-eq],[data-use],[data-sm],[data-my],[data-af],[data-mm],[data-tr],[data-afx]'); if (!t) return; sfx('click');
  if (t.dataset.close !== undefined) { closeWin(t.closest('.win').id); return; }
  if (t.dataset.open) { togglePanel(t.dataset.open); return; }
  if (t.dataset.bagPage !== undefined) {
    bagPage = t.dataset.bagPage === 'cons' ? 'cons' : Number(t.dataset.bagPage);
    tip.style.display = 'none';
    renderBagPage();
    return;
  }
  if (t.dataset.sm) { smSel = t.dataset.sm; buildSmith(); return; }
  if (t.dataset.smtab) { smTab = t.dataset.smtab; buildSmith(); return; }
  if (t.dataset.mytab) { myTab = t.dataset.mytab; buildMystic(); return; }
  if (t.dataset.mm) { const k = mmSel.indexOf(t.dataset.mm); if (k >= 0) mmSel.splice(k, 1); else if (mmSel.length < I.mythicMerge.count) mmSel.push(t.dataset.mm); buildSmith(); return; }
  if (t.id === 'mmgo') { if (mmSel.length === I.mythicMerge.count) { send({ t: 'mythicMerge', uids: mmSel.slice() }); $('mmres').textContent = '…'; } return; }
  if (t.dataset.af) { afSel = t.dataset.af; buildMystic(); return; }
  if (t.dataset.afx) { afKey = t.dataset.afx; buildMystic(); return; }
  if (t.id === 'afgo') { if (afSel && afKey) { send({ t: 'affix', uid: afSel, k: afKey }); $('afres').textContent = '…'; } return; }
  if (t.dataset.tr) { if (!TRADE) return; const u = t.dataset.tr, list = TRADE.mine.uids.slice(), k = list.indexOf(u); if (k >= 0) list.splice(k, 1); else list.push(u); send({ t: 'trade', op: 'offer', uids: list, gold: +$('trgold').value || 0 }); return; }
  if (t.id === 'trok') { send({ t: 'trade', op: 'confirm' }); return; }
  if (t.id === 'trcancel') { send({ t: 'trade', op: 'cancel' }); return; }
  if (t.dataset.teamop) { const op = t.dataset.teamop; if (op === 'invite') { const n = $('teamname').value.trim(); if (n) send({ t: 'team', op: 'invite', name: n }); $('teamname').value = ''; } else send({ t: 'team', op, name: t.dataset.name }); return; }
  if (t.dataset.trwith) { send({ t: 'trade', op: 'request', name: t.dataset.trwith }); return; }
  if (t.dataset.ask) { const a = ASK; hideAsk(); if (a) send({ t: a.kind, op: t.dataset.ask === 'yes' ? 'accept' : 'decline' }); return; }
  if (t.dataset.bag && mergeMode) { const id = t.dataset.bag, it = BAG.find(i => i.uid === id), k = mergeSel.indexOf(id); if (!it) return;
    if (k >= 0) mergeSel.splice(k, 1); else if (it.rar < MERGE_COST.length) { const f = BAG.find(i => i.uid === mergeSel[0]); if (f && f.rar !== it.rar) mergeSel = []; if (mergeSel.length < MERGE_COST[it.rar]) mergeSel.push(id); } else toast(text('inventory.mythicNoMerge', 'Mythic items cannot be merged.'), '#ff4560'); buildInv(); return; }
  if (t.id === 'mergeBtn') { mergeMode = !mergeMode; mergeSel = []; buildInv(); return; }
  if (t.id === 'mergeGo') { const f = BAG.find(i => i.uid === mergeSel[0]); if (f && mergeSel.length === MERGE_COST[f.rar]) { send({ t: 'merge', uids: mergeSel }); mergeSel = []; sfx('equip'); } return; }
  if (t.id === 'autoMerge') { send({ t: 'automerge', max: 1 }); return; }
  if (t.id === 'autoMerge2') { send({ t: 'automerge', max: 2 }); return; }
  if (t.id === 'autoMerge3') { send({ t: 'automerge', max: 3 }); return; }
  if (t.id === 'autoMerge4') { send({ t: 'automerge', max: 4 }); return; }
  if (t.dataset.build) { const k = t.dataset.build, st = WORLD.settlement, raised = Object.values((st.funds && st.funds[k]) || {}).reduce((s, v) => s + v, 0), left = st.cost[k] - raised; uxConfirm(text('camp.confirm', 'Build the {stall} for {gold} gold? It stays for everyone on this server.', { stall: text('camp.stall.' + k, STALL_NAME[k]), gold: GameText.number(left) }), text('camp.build', 'Build'), () => send({ t: 'build', k, amount: left })); return; }
  if (t.dataset.donate) { const k = t.dataset.donate, field = $('campamt-' + k), amount = Math.floor(+(field && field.value) || 0); if (amount < 1) return;
    uxConfirm(text('camp.donateConfirm', 'Give {gold} gold towards the {stall}? Gold given is not returned. The biggest contributor gets the deed.', { gold: GameText.number(Math.min(amount, me.g)), stall: text('camp.stall.' + k, STALL_NAME[k]) }), text('camp.give', 'Give'), () => send({ t: 'build', k, amount })); return; }
  if (t.dataset.travel) { send({ t: 'travel', map: +t.dataset.travel }); closeWin('portalw'); return; }
  if (t.dataset.my) { mySel = t.dataset.my; buildMystic(); return; }
  if (t.id === 'mygo') { if (mySel) { send({ t: 'reroll', uid: mySel }); $('myres').textContent = '…'; $('myres').style.color = '#ccc'; } return; }
  if (t.id === 'junk') { send({ t: 'sellall', rar: 1 }); sfx('sell'); return; }
  if (t.id === 'junk2') { send({ t: 'sellall', rar: 2 }); sfx('sell'); return; }
  if (t.id === 'smgo' || t.id === 'smauto') {
    const item = smSel && I.slots.map(slot => EQ[slot]).find(gear => gear?.uid === smSel);
    if (!item || t.disabled) return;
    if (t.id === 'smauto') confirmAutoUpgrade(item);
    else submitUpgrade(item.uid, false);
    return;
  }
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
const smithAutoDialog = $('smith-auto-dialog');
let pendingAutoUpgrade;

function submitUpgrade(uid, automatic) {
  send({ t: 'upgrade', uid, automatic });
  $('smres').textContent = '…';
  $('smres').style.color = '#ccc';
}

function confirmAutoUpgrade(item) {
  if (smithAutoDialog.open) return;
  pendingAutoUpgrade = item.uid;
  smithAutoDialog.returnValue = '';
  $('smith-auto-message').textContent = text('smith.autoConfirm',
    'Automatically upgrade {item} to +9? This may spend all available gold ({gold}g). Failed attempts can lower the upgrade level.',
    { item: gearName(item.name), gold: GameText.number(me.g) });
  smithAutoDialog.showModal();
}

smithAutoDialog.addEventListener('close', () => {
  const uid = pendingAutoUpgrade;
  pendingAutoUpgrade = null;
  if (smithAutoDialog.returnValue === 'confirm' && uid) submitUpgrade(uid, true);
});

let smTab = 'up', mmSel = [], forgePending = false;
function buildSmith() {
  if (!I || !me) return;
  for (const b of document.querySelectorAll('#smtabs [data-smtab]')) b.classList.toggle('on', b.dataset.smtab === smTab);
  $('smup').style.display = smTab === 'up' ? '' : 'none'; $('smmyth').style.display = smTab === 'myth' ? '' : 'none';
  if (smTab === 'myth') return buildMythicMerge();
  const all = I.slots.map(s => EQ[s]).filter(Boolean);
  const it = all.find(item => item.uid === smSel) || all[0];
  smSel = it?.uid ?? null;
  $('smpick').innerHTML = all.map(item => slotHtml(item, 'data-sm="' + item.uid + '" data-tip="sm:' + item.uid + '"', smSel === item.uid ? ' pick' : '')).join('');
  $('smauto').disabled = true;
  if (!it) { $('smcard').innerHTML = '<div class="mu">' + esc(text("smith.noEquipment", "No equipment.")) + '</div>'; $('smgo').disabled = true; return; }
  if (it.plus >= 9) { $('smcard').innerHTML = '<div class="itemcard">' + tipItem(it) + '<div class="up" style="margin-top:6px">' + esc(text("smith.maxUpgrade", "Maximum level reached (+9).")) + '</div></div>'; $('smgo').disabled = true; return; }
  const c = upCost(it), ch = Math.round(I.upRate[it.plus] * 100);
  let rows = ''; for (const k of STATORDER) if (k in it.stats) rows += '<div class="ln"><span>' + esc(text('stat.' + k, I.stat[k].n)) + '</span><span>' + fmtS(k, eff(it, k)) + ' → <b class="up">' + fmtS(k, eff(it, k, it.plus + 1)) + '</b></span></div>';
  $('smcard').innerHTML = '<div class="itemcard"><b class="nm" style="color:' + RC[it.rar] + '">' + esc(gearName(it.name)) + ' +' + it.plus + ' → +' + (it.plus + 1) + '</b><div class="mu">' + text("inventory.equipped", "Equipped") + ' · ' + esc(text('inventory.itemLevelShort', 'iLvl')) + ' ' + it.ilvl + '</div><div style="margin:6px 0">' + rows + '</div>' +
    '<div class="ln"><span>' + esc(text("smith.cost", "Cost")) + '</span><b style="color:' + (me.g >= c ? '#ffd77a' : '#ff7a6a') + '">' + GameText.number(c) + 'g</b></div><div class="ln"><span>' + esc(text("smith.chance", "Success chance")) + '</span><b style="color:' + (ch >= 70 ? '#6fe39a' : ch >= 40 ? '#ffd24a' : '#ff7a6a') + '">' + ch + '%</b></div>' +
    (it.plus >= 5 ? '<div class="dn" style="margin-top:4px">' + esc(text('smith.failureLevel', '⚠ Failure drops the item to +{level}', { level: it.plus - 1 })) + '</div>' : '<div class="mu" style="margin-top:4px">' + esc(text("smith.goldOnly", "Failure only costs gold.")) + '</div>') + '</div>';
  $('smauto').disabled = forgePending || me.g < c;
  $('smgo').disabled = forgePending || me.g < c; $('smgo').textContent = text("smith.upgradeFor", "Upgrade for {cost}g", { cost: GameText.number(c) });
}
let myTab = 're', afSel = null, afKey = null;
function buildMystic() {
  if (!I || !me) return;
  for (const b of document.querySelectorAll('#mytabs [data-mytab]')) b.classList.toggle('on', b.dataset.mytab === myTab);
  $('myre').style.display = myTab === 're' ? '' : 'none'; $('myaf').style.display = myTab === 'af' ? '' : 'none';
  $('mysouls').innerHTML = uiImg('item-souls', 'soulico') + ' ' + GameText.number(SOULS);
  if (myTab === 'af') return buildAffix();
  const worn = I.slots.map(s => EQ[s]).filter(Boolean), all = worn.concat(BAG);
  if (mySel && !findItem(mySel)) mySel = null; if (!mySel && worn.length) mySel = worn[0].uid;
  $('mysouls').innerHTML = uiImg('item-souls', 'soulico') + ' ' + GameText.number(SOULS);
  $('mypick').innerHTML = all.map(it => slotHtml(it, 'data-my="' + it.uid + '" data-tip="my:' + it.uid + '"', mySel === it.uid ? ' pick' : '')).join('');
  const it = mySel && findItem(mySel);
  if (!it) { $('mycard').innerHTML = '<div class="mu">' + esc(text('mystic.noItem', 'Pick an item.')) + '</div>'; $('mygo').disabled = true; return; }
  const c = REROLL_COST[it.rar] || 1;
  $('mycard').innerHTML = '<div class="itemcard">' + tipItem(it) + '<div class="ln" style="margin-top:6px"><span>' + esc(text('mystic.cost', 'Cost')) + '</span><b style="color:' + (SOULS >= c ? '#c9a0ff' : '#ff7a6a') + '">' + c + ' ' + esc(text('mystic.souls', 'souls')) + '</b></div><div class="mu" style="margin-top:4px">' + esc(text('mystic.keeps', 'Keeps the name, rarity, item level and + upgrades. All stats are rolled again.')) + '</div></div>';
  $('mygo').disabled = SOULS < c; $('mygo').textContent = text('mystic.rerollFor', 'Reroll for {cost} souls', { cost: c });
}
function onReroll() { const r = $('myres'); r.textContent = text('mystic.done', '✦ The souls reshape the item.'); r.style.color = '#c9a0ff'; sfx('lvl'); }
const fmtTime = ms => { const s = Math.ceil(ms / 1000); return s >= 60 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : s + 's'; };
// ---------- Blacksmith: Mythic merge ----------
function buildMythicMerge() {
  const need = I.mythicMerge.count, price = I.mythicMerge.gold, mythics = BAG.filter(it => it.rar === 5);
  mmSel = mmSel.filter(uid => mythics.some(it => it.uid === uid));
  $('mmpick').innerHTML = mythics.length ? mythics.map(it => slotHtml(it, 'data-mm="' + it.uid + '" data-tip="mm:' + it.uid + '"', mmSel.includes(it.uid) ? ' sel' : '')).join('') : '<div class="mu" style="grid-column:1/-1;font-size:0.75rem">' + esc(text('smith.noMythics', 'No Mythic items in your bag.')) + '</div>';
  const picked = mmSel.map(uid => BAG.find(it => it.uid === uid)), avg = picked.length ? Math.max(1, Math.round(picked.reduce((s, it) => s + it.ilvl, 0) / picked.length)) : 0;
  $('mminfo').innerHTML = '<div class="ln"><span>' + esc(text('smith.mythicPicked', 'Mythics picked')) + '</span><b>' + picked.length + ' / ' + need + '</b></div>' +
    '<div class="ln"><span>' + esc(text('smith.mythicResult', 'Result')) + '</span><b style="color:' + RC[5] + '">' + esc(picked.length === need ? text('smith.mythicResultLevel', 'Random Mythic · iLvl {level}', { level: avg }) : '–') + '</b></div>' +
    '<div class="ln"><span>' + esc(text('smith.cost', 'Cost')) + '</span><b style="color:' + (me.g >= price ? '#ffd77a' : '#ff7a6a') + '">' + GameText.number(price) + 'g</b></div>';
  $('mmgo').disabled = picked.length !== need || me.g < price;
}
function onMythicMerge(m) { const r = $('mmres'); r.textContent = m.text || (typeof m.m === 'string' ? m.m : ''); GameText.present(r, { message: m.text || m.m, color: m.ok ? RC[5] : '#ff7a6a' }); if (m.ok) { mmSel = []; sfx('lvl'); } }
// ---------- Soul Mystic: affixes ----------
function buildAffix() {
  const ok = it => I.affixSlots.includes(it.slot), worn = I.slots.map(s => EQ[s]).filter(Boolean).filter(ok), all = worn.concat(BAG.filter(ok));
  if (afSel && !all.some(it => it.uid === afSel)) afSel = null; if (!afSel && all.length) afSel = all[0].uid;
  $('afpick').innerHTML = all.length ? all.map(it => slotHtml(it, 'data-af="' + it.uid + '" data-tip="af:' + it.uid + '"', afSel === it.uid ? ' pick' : '')).join('') : '<div class="mu" style="grid-column:1/-1;font-size:0.75rem">' + esc(text('mystic.noAffixItems', 'Bring a weapon, ring or amulet.')) + '</div>';
  const it = afSel && findItem(afSel);
  if (!afKey || !I.affixes[afKey]) afKey = Object.keys(I.affixes)[0];
  $('afopts').innerHTML = Object.keys(I.affixes).map(k => '<button data-afx="' + k + '" class="' + (afKey === k ? 'on' : '') + '">' + esc(text('affix.' + k + '.prefix', I.affixes[k].prefix)) + '<small>' + esc(text('affix.' + k, I.affixes[k].n)) + '</small></button>').join('');
  if (!it) { $('afcard').innerHTML = ''; $('afgo').disabled = true; return; }
  const c = I.affixCost[it.rar] || 2;
  $('afcard').innerHTML = '<div class="itemcard">' + tipItem(it) + '<div class="ln" style="margin-top:6px"><span>' + esc(text('mystic.cost', 'Cost')) + '</span><b style="color:' + (SOULS >= c ? '#c9a0ff' : '#ff7a6a') + '">' + c + ' ' + esc(text('mystic.souls', 'souls')) + '</b></div>' +
    '<div class="mu" style="margin-top:4px">' + esc(it.afx ? text('mystic.affixReplace', 'Replaces the current affix. The value is rolled for the item level and rarity.') : text('mystic.affixNew', 'Adds one affix. The value is rolled for the item level and rarity.')) + '</div></div>';
  $('afgo').disabled = SOULS < c; $('afgo').textContent = text('mystic.affixFor', 'Add {affix} for {cost} souls', { affix: text('affix.' + afKey + '.prefix', I.affixes[afKey].prefix), cost: c });
}
function onAffix(m) { const r = $('afres'); GameText.present(r, { message: m.text || m.m, color: m.ok ? '#5fe0d0' : '#ff7a6a' }); if (m.ok) sfx('lvl'); }
// ---------- teams and trading ----------
let TEAM = null, TRADE = null, ASK = null;
function onTeam(m) { TEAM = m.team; if (isOpen('teamw')) buildTeam(); }
function buildTeam() {
  const t = TEAM, mine = t && I && t.leader === I.id;
  const members = t ? t.members.map(p => '<div class="row"><div class="t"><b>' + (p.id === t.leader ? '👑 ' : '') + esc(p.n) + '</b> <span class="mu">' + esc(text('team.memberInfo', 'Lv {level} · {where}', { level: p.l, where: p.map ? text('portal.regionShort', 'Region {index}', { index: p.map }) : text('portal.founding', 'The Founding Lands') })) + '</span><div class="bar teamhp"><i style="width:' + Math.round(p.hp / Math.max(1, p.mh) * 100) + '%"></i></div></div>' +
    (p.id === I.id ? '' : '<button data-trwith="' + esc(p.n) + '">' + esc(text('team.trade', 'Trade')) + '</button>' + (mine ? ' <button data-teamop="kick" data-name="' + esc(p.n) + '">✕</button>' : '')) + '</div>').join('') : '<div class="mu">' + esc(text('team.none', 'You are not in a team. Invite a hero by name - only team members can trade with each other.')) + '</div>';
  $('teamb').innerHTML = members + '<div class="teaminv"><input id="teamname" maxlength="14" placeholder="' + esc(text('team.namePlaceholder', 'Hero name')) + '"><button data-teamop="invite" class="pri">' + esc(text('team.invite', 'Invite')) + '</button></div>' +
    (t ? '<div class="itemcard" style="margin-top:8px;font-size:0.75rem"><div class="ln"><span>' + esc(text('team.sharing', 'XP and gold sharing')) + '</span>' + (mine ? '<button data-teamop="share">' + esc(t.share ? text('team.on', 'ON') : text('team.off', 'OFF')) + '</button>' : '<b>' + esc(t.share ? text('team.on', 'ON') : text('team.off', 'OFF')) + '</b>') + '</div>' +
      '<div class="mu" style="margin-top:4px">' + esc(text('team.rulesCurrent', 'Nearby contributors share XP; nearby members share gold. Health scaling depends on enemy category; each extra party member adds {damage}% damage.', { damage: Math.round((WORLD.scaling?.partyDamage || 0) * 100) })) + '</div></div>' : '') +
    (t ? '<button data-teamop="leave" style="width:100%;margin-top:6px">' + esc(text('team.leave', 'Leave team')) + '</button>' : '') +
    '<div class="mu" style="font-size:0.6875rem;margin-top:6px">' + esc(text('team.chatHint', 'Team chat: /t message')) + '</div>';
}
function showAsk(kind, message) { ASK = { kind }; $('askmsg').textContent = message; $('askbar').style.display = 'flex'; sfx('click'); clearTimeout(showAsk.timer); showAsk.timer = setTimeout(hideAsk, 60000); }
function hideAsk() { ASK = null; $('askbar').style.display = 'none'; }
function onTrade(m) {
  if (!m.open) { TRADE = null; if (isOpen('tradew')) { $('tradew').style.display = 'none'; } if (m.done) sfx('coin'); if (isOpen('invp')) buildInv(); return; }
  TRADE = m; if (!isOpen('tradew')) { openWin('tradew'); if (!isOpen('invp')) openWin('invp'); } else buildTrade();
}
function buildTrade() {
  const t = TRADE; if (!t) return;
  $('trwith').textContent = text('trade.with', 'Trading with {name}', { name: t.with });
  const offered = t.mine.uids.map(uid => BAG.find(it => it.uid === uid)).filter(Boolean);
  $('trmine').innerHTML = offered.map(it => slotHtml(it, 'data-tr="' + it.uid + '" data-tip="tr:' + it.uid + '"')).join('') || '<div class="mu trempty">' + esc(text('trade.pickHint', 'Click items below to offer them.')) + '</div>';
  $('trtheirs').innerHTML = t.theirs.items.map(it => slotHtml(it, 'data-tip="to:' + it.uid + '"')).join('') || '<div class="mu trempty">' + esc(text('trade.nothing', 'Nothing yet.')) + '</div>';
  $('trpick').innerHTML = BAG.filter(it => !t.mine.uids.includes(it.uid)).map(it => slotHtml(it, 'data-tr="' + it.uid + '" data-tip="tr:' + it.uid + '"')).join('');
  if (document.activeElement !== $('trgold')) $('trgold').value = t.mine.gold || '';
  $('trtheirgold').textContent = GameText.number(t.theirs.gold || 0) + 'g';
  const tick = ok => ok ? '<b style="color:#8fd18f">✔ ' + esc(text('trade.accepted', 'accepted')) + '</b>' : '<span class="mu">' + esc(text('trade.waiting', 'not accepted yet')) + '</span>';
  $('trstate').innerHTML = esc(text('trade.you', 'You')) + ': ' + tick(t.mine.ok) + ' · ' + esc(t.with) + ': ' + tick(t.theirs.ok);
  $('trok').disabled = t.mine.ok;
}
// ---------- encampment ----------
const STALL_NAME = { merchant: "Merchant's stall", smith: "Blacksmith's forge", mystic: "Soul Mystic's tent" }, STALL_NPC = { merchant: 'npc.merchant', smith: 'npc.smith', mystic: 'npc.mystic' };
function buildCamp() {
  const st = WORLD && WORLD.settlement; if (!st || !(st.kind === 'camp' || st.stalls)) { $('campb').innerHTML = ''; return; }
  const village = st.kind === 'village';
  { const title = document.querySelector('#campw .win-h b span'); if (title) title.textContent = village ? text('npc.villageBoard', '📜 Village board') : text('npc.camp', '🏕 Encampment board'); }
  // Each unbuilt stall shows how much is raised. Heroes can give any part of their gold; the biggest contributor gets the deed.
  const row = k => { const b = st.built[k], cost = st.cost[k], donors = (st.funds && st.funds[k]) || {};
    const name = '<div class="t">' + esc(text('camp.stall.' + k, STALL_NAME[k])) + '<small>';
    if (b) return '<div class="row">' + name + esc(text('camp.builtBy', 'Built by {name}', { name: b.by })) + (b.donors > 1 ? ' · ' + esc(text('camp.withHelp', 'with {count} heroes', { count: b.donors })) : '') + '</small></div><b style="color:#8fd18f">✔</b></div>';
    const raised = Object.values(donors).reduce((s, v) => s + v, 0), left = Math.max(0, cost - raised), mine = Object.hasOwn(donors, I.name) ? donors[I.name] : 0;
    const top = Object.keys(donors).sort((a, c) => donors[c] - donors[a])[0];
    const pct = Math.min(100, raised / cost * 100), give = Math.min(left, me.g);
    return '<div class="row camp-row" style="flex-wrap:wrap">' + name + esc(village ? text('camp.bringsVillage', 'Brings the {npc} to this village', { npc: text(STALL_NPC[k], k) }) : text('camp.brings', 'Brings the {npc} to this camp', { npc: text(STALL_NPC[k], k) })) + '</small></div>' +
      '<b style="color:#ffd24a">' + GameText.number(cost) + 'g</b>' +
      '<div class="camp-fund" style="flex-basis:100%;margin-top:4px">' +
        '<div style="height:8px;border-radius:4px;background:#1a130c;border:1px solid #4a3a2a;overflow:hidden"><div style="height:100%;width:' + pct.toFixed(1) + '%;background:linear-gradient(90deg,#b8862e,#ffd24a)"></div></div>' +
        '<div class="mu" style="font-size:0.6875rem;margin-top:2px">' + esc(text('camp.raised', '{raised} / {cost} gold raised · {left} to go', { raised: GameText.number(raised), cost: GameText.number(cost), left: GameText.number(left) })) +
          (top ? ' · ' + esc(text('camp.topDonor', 'Deed goes to {name} ({gold}g)', { name: top, gold: GameText.number(donors[top]) })) : '') +
          (mine ? ' · ' + esc(text('camp.yourShare', 'You gave {gold}g', { gold: GameText.number(mine) })) : '') + '</div>' +
        '<div style="display:flex;gap:6px;margin-top:4px;align-items:center">' +
          '<input id="campamt-' + k + '" type="number" min="1" max="' + give + '" step="1000" value="' + give + '" aria-label="' + esc(text('camp.amount', 'Gold to give')) + '" style="width:120px"' + (give < 1 ? ' disabled' : '') + '>' +
          '<button class="pri" data-donate="' + k + '"' + (give < 1 ? ' disabled' : '') + '>' + esc(text('camp.give', 'Give')) + '</button>' +
          '<button data-build="' + k + '"' + (me.g < left || left < 1 ? ' disabled' : '') + '>' + esc(text('camp.payRest', 'Pay the rest ({gold}g)', { gold: GameText.number(left) })) + '</button>' +
        '</div></div></div>'; };
  $('campb').innerHTML = '<div class="mu" style="font-size:0.75rem;margin-bottom:6px">' + esc(village ? text('camp.villageIntro', 'This village has no traders yet. Fund a stall and its keeper will stay here for every hero on the server. Heroes can pool their gold: whoever gives the most gets the deed, and every stall is written in the Chronicle.') : text('camp.intro', 'This land is too harsh for a village. Fund a stall and its keeper will stay here for every hero on the server. Heroes can pool their gold: whoever gives the most gets the deed. The first stall founds the encampment, and every stall is written in the Chronicle.')) + '</div>' + Object.keys(STALL_NAME).map(row).join('');
}
// ---------- world portal ----------
let PORTAL = null;
const BIOME_NAME = { volcanic: 'Volcanic', glacier: 'Glacier', voidscar: 'Voidscar', wildwood: 'Wildwood', warfields: 'Warfields', necropolis: 'Necropolis' };
function onPortal(m) { PORTAL = m; if (isOpen('portalw')) buildPortal(); }
function buildPortal() {
  const p = PORTAL; if (!p) { $('portalb').innerHTML = '<div class="mu">…</div>'; return; }
  const row = m => {
    const here = m.index === p.here, title = m.founding ? text('portal.founding', 'The Founding Lands') : m.name;
    const info = m.founding ? text('portal.foundingInfo', 'World Tiers 1-7 · Levels {min}-{max}', { min: m.levels[0], max: m.levels[1] }) : text('portal.regionInfo', 'World Tier {tier} · {biome} · Levels {min}-{max}', { tier: m.tier, biome: text('biome.' + m.biome, BIOME_NAME[m.biome] || m.biome), min: m.levels[0], max: m.levels[1] });
    const boss = m.founding ? '' : '<small>' + esc(text('universe.worldBoss', 'World Boss')) + ': <b style="color:' + (m.defeated ? '#8fd18f' : '#ffd24a') + '">' + esc(m.boss) + '</b> · ' + esc(m.defeated ? text('portal.defeated', 'defeated') : text('portal.undefeated', 'undefeated')) + '</small>';
    return '<div class="row' + (here ? ' here' : '') + '"><div class="t">' + esc(title) + '<small>' + esc(info) + '</small>' + boss + '<small>' + esc(text('portal.heroes', 'Heroes there now: {count}', { count: m.players })) + '</small></div><button' + (here ? ' disabled' : ' class="pri" data-travel="' + m.index + '"') + '>' + esc(here ? text('portal.here', 'You are here') : text('portal.travel', 'Travel')) + '</button></div>';
  };
  $('portalb').innerHTML = '<div class="mu" style="font-size:0.75rem;margin-bottom:6px">' + esc(text('portal.unlocked', 'Maps unlocked on this server: {count} · World Tier {tier}', { count: p.maps.length, tier: p.tier })) + '</div><div class="portal-list">' + p.maps.map(row).join('') + '</div><div class="mu" style="font-size:0.6875rem;margin-top:8px">' + esc(text('portal.hint', 'Defeat the World Boss of the newest region to unlock the next map.')) + '</div>';
}
// ---------- universe chronicle ----------
let UNI = null;
const CHRONICLE_TEXT = {
  founded: 'The universe {universe} was founded.', firstHero: '{player} was the first hero to walk {universe}.',
  levelMilestone: '{player} was the first to reach level {level}.', bossFirstKill: '{player} was the first to slay {boss}.',
  stoneFirst: '{player} shattered the first stone of {region}.', firstMythic: '{player} forged the first Mythic item: {item}.',
  worldBoss: '{player} defeated the World Boss {boss}. World Tier {tier} begins: {region} is discovered.',
  campFounded: '{player} founded the encampment of {region}.', stallBuilt: '{player} built the {stall} in {region} for {gold} gold.', stallFunded: '{player} led the building of the {stall} in {region}: {count} heroes gave {gold} gold.',
};
const zoneKey = name => 'zone.' + String(name).toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
const regionName = region => region.kind === 'founding' ? text(zoneKey(region.name), region.name) : region.name;
const bossName = boss => boss.type && I && I.types[boss.type] && !/ /.test(boss.name) ? text('monster.' + boss.type, boss.name) : boss.name;
const dateText = at => new Date(at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
function showUniverseLine() {
  const u = WORLD && WORLD.universe, el = $('uni'); if (!el || !u) return;
  el.textContent = text('universe.publicLine', '{universe} · World Tier {tier}', { universe: u.name, tier: u.tier });
}
function onUniverse(u) { UNI = u; if (WORLD && WORLD.universe) { WORLD.universe.tier = u.tier; } if (isOpen('chronw')) buildChronicle(); }
function buildChronicle() {
  const u = UNI; if (!u) { $('chronb').innerHTML = '<div class="mu">…</div>'; return; }
  const f = u.frontier, wb = f.worldBoss;
  const entryText = e => { const d = Object.assign({}, e.data); if (d.stallKey) d.stall = text('camp.stall.' + d.stallKey, d.stall); if (d.gold) d.gold = GameText.number(d.gold); if (d.bossType) d.boss = text('monster.' + d.bossType, d.boss); if (d.region && e.type !== 'worldBoss') d.region = text(zoneKey(d.region), d.region); else if (d.region && e.data.tier <= 7) d.region = text(zoneKey(d.region), d.region);
    return text('chronicle.' + e.type, CHRONICLE_TEXT[e.type] || e.type, Object.assign({ universe: u.name, player: e.players[0] || '' }, d)); };
  const others = e => e.players.length > 1 ? '<small>' + esc(text('chronicle.with', 'Fought alongside: {players}', { players: e.players.slice(1).join(', ') })) + '</small>' : '';
  $('chronb').innerHTML =
    '<div class="uni-head"><b>' + esc(u.name) + '</b><span>' + esc(text('universe.publicIdentity', 'Founded {date}', { date: dateText(u.foundedAt) })) + '</span></div>' +
    '<div class="uni-tier"><div><span class="mu">' + esc(text('universe.worldTier', 'World Tier')) + '</span><b>' + u.tier + '</b></div><div><span class="mu">' + esc(text('universe.frontier', 'Frontier region')) + '</span><b>' + esc(regionName(f)) + '</b><small>' + esc(text('universe.levels', 'Levels {min}-{max}', { min: f.levels[0], max: f.levels[1] })) + '</small></div><div><span class="mu">' + esc(text('universe.worldBoss', 'World Boss')) + '</span><b style="color:#ffd24a">' + esc(bossName(wb)) + '</b></div></div>' +
    '<div class="mu" style="font-size:0.75rem;margin:6px 0">' + esc(f.playable ? text('universe.frontierHint', 'Defeat the World Boss in its own region to advance this universe to the next World Tier.') : text('universe.frontierLocked', 'This region has been charted from the history of this universe, but it cannot be entered yet.')) + '</div>' +
    '<details class="howto"><summary>' + esc(text('chronicle.howTitle', 'How does the World Tier grow?')) + '</summary><p>' + esc(text('chronicle.how', 'Every zone has one World Boss (👑), chosen by the server\'s seed. Defeat it in its own zone and the World Tier rises by one, revealing the next region. After the seventh, a World Portal opens in the village centre and leads to new maps. Every first victory is written into this chronicle.')) + '</p></details>' + '<div class="hd2">' + esc(text('universe.chronicle', 'Chronicle')) + '</div><div class="uni-list">' + u.history.slice().reverse().map(e => '<div class="uni-row"><span class="mu">' + esc(dateText(e.at)) + '</span><div>' + esc(entryText(e)) + others(e) + '</div></div>').join('') + '</div>' +
    '<div class="hd2">' + esc(text('universe.legends', 'Legends')) + '</div><div class="uni-list">' + (u.legends.length ? u.legends.map((l, i) => '<div class="uni-row"><span class="mu">' + (i + 1) + '.</span><div><b>' + esc(l.name) + '</b><small>' + esc(text('universe.renown', '{renown} renown · {deeds} deeds in the chronicle', { renown: l.renown, deeds: l.deeds })) + '</small></div></div>').join('') : '<div class="mu">' + esc(text('universe.noLegends', 'No hero has entered the chronicle yet.')) + '</div>') + '</div>';
}
function onForge(m) {
  forgePending = Boolean(m.pending);
  if (m.m) {
    const result = $('smres');
    result.textContent = GameText.resolve(m.text || m.m);
    result.style.color = '#ff7a6a';
    sfx('fail');
    return;
  }
  if (m.automatic) {
    const result = $('smres');
    const key = m.pending ? 'smith.autoProgress' : m.cancelled ? 'smith.autoStopped' : 'smith.autoResult';
    const fallback = m.pending ? 'Upgrading… +{level} · Attempts: {attempts} · Gold spent: {gold}' : m.cancelled ? 'Stopped at +{level} · Attempts: {attempts} · Gold spent: {gold}' : 'Final level: +{level} · Attempts: {attempts} · Gold spent: {gold}';
    result.textContent = text(key, fallback, {
      level: m.plus, attempts: m.attempts, gold: GameText.number(m.spent),
    });
    result.style.color = m.plus === 9 ? '#6fe39a' : '#ffe0a0';
    if (!m.pending) sfx(m.ok ? 'lvl' : 'fail');
    if (isOpen('smithw')) buildSmith();
    return;
  }
  const r = $('smres'); r.textContent = m.ok ? text("smith.success", "✔ Success! Now +{level}", { level: m.plus }) : (m.drop ? text("smith.dropped", "✖ Failed - dropped to +{level}", { level: m.plus }) : text("smith.failed", "✖ Failed")); r.style.color = m.ok ? '#6fe39a' : '#ff7a6a';
  sfx(m.ok ? 'lvl' : 'fail'); if (m.ok && m.plus >= 7) toast(text("smith.forged", "Forged +{level}!", { level: m.plus }), '#ffd24a');
}

// ---------- skills ----------
const SK_ACT = ['s1', 'mend', 'frenzy'], SK_PAS = ['vit', 'might', 'swift', 'crit', 'critdmg', 'lifesteal', 'guard', 'haste', 'focus', 'fortune']; let skTab = 'act';
const PAS = { vit: ['Vitality', '❤️', 'max HP', 5, '%'], might: ['Might', '💪', 'damage', 5, '%'], swift: ['Swiftness', '💨', 'move speed', 4, '%'], crit: ['Precision', '🎯', 'critical hit chance', 1.5, '%'], critdmg: ['Brutality', '💥', 'critical hit damage', 12, '%'], lifesteal: ['Bloodthirst', '🩸', 'of damage dealt healed (lifesteal)', 0.8, '%'], guard: ['Iron Skin', '🛡️', 'less damage taken', 2.5, '%'], haste: ['Haste', '⚡', 'attack speed', 3.5, '%'], focus: ['Focus', '🔷', 'max MP and +10% MP regen per rank', 5, '%'], fortune: ['Fortune', '💰', 'gold find', 1, '%'] };
const passiveTooltipDescriptions = {
  vit: 'Increases base maximum health by {bonus}%.',
  might: 'Increases damage dealt by {bonus}%.',
  swift: 'Increases movement speed by {bonus}%.',
  crit: 'Adds {bonus} percentage points to critical hit chance, up to the 80% total cap.',
  critdmg: 'Adds {bonus} percentage points to the critical damage multiplier.',
  lifesteal: 'Each hit restores health equal to {bonus}% of your Damage stat.',
  guard: 'Reduces incoming damage by {bonus}% after armor.',
  haste: 'Shortens the interval between basic attacks by {bonus}%.',
  focus: 'Increases maximum mana by {bonus}% and mana regeneration by {regen}%.',
  fortune: 'Increases gold dropped by monsters by {bonus}%.',
};
const maxSkillRank = skill => SK_ACT.includes(skill) ? I.maxRank : (I.pMax || 10);
// Same curve as the server (characters.js passiveValue): full gain for 10 ranks, then levelling off towards the cap.
function passiveValue(k, r) {
  if (k === 'fortune') return r > 0 ? Math.min(100, r + 1) : 0;
  const [step, cap] = I.passiveEffect[k]; if (r <= 10) return step * r;
  const head = step * 10, room = cap - head, curve = Math.min(step / room, 3 / ((I.pMax || 99) - 10));
  return head + room * (1 - Math.exp(-(r - 10) * curve));
}
const passivePercent = (k, r) => Math.round((k === 'fortune' ? 1 : 100) * passiveValue(k, r) * 10) / 10;
const effectivePassiveRank = skill => Math.min(maxSkillRank(skill) + 5, (me.sk[skill] || 0) + (SKB[skill] || 0));

function passiveTooltipDescription(skill) {
  const rank = effectivePassiveRank(skill) || 1;
  const bonus = passivePercent(skill, rank);
  return text('passive.' + skill + '.tooltip', passiveTooltipDescriptions[skill], {
    bonus: GameText.number(bonus),
    regen: GameText.number(Math.round(bonus * 2 * 10) / 10),
  });
}
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
  const p = PAS[k], gb = SKB[k] || 0, re = effectivePassiveRank(k); return [text('passive.' + k, p[0]) + (gb ? ' (+' + gb + ' ' + text('skill.fromGear', 'from gear') + ')' : ''), '', skillIcon(k), (re ? '+' + passivePercent(k, re) + '% ' + text('passive.' + k + '.effect', p[2]) + ' · ' : '') + ((me.sk[k] || 0) >= maxSkillRank(k) ? text('skill.maxRank', 'maximum rank') : text('skill.nextRank', 'next rank +{bonus}%', { bonus: Math.round((passivePercent(k, re + 1) - passivePercent(k, re)) * 100) / 100 }))];
}
function buildSkills() {
  if (!I || !me) return; $('spn').textContent = me.sp ? text("skill.points", "★ Points: {count}", { count: me.sp }) : text("skill.noPoints", "no points"); $('spn').style.color = me.sp ? '#ffe97a' : '';
  const passiveTab = skTab === 'pas';
  const list = passiveTab ? SK_PAS : SK_ACT;
  const hoveredPassive = hoveredSkillElement?.dataset.passiveSkill;
  const restoreTooltip = hoveredPassive && tip.style.display === 'block';
  $('skl').innerHTML = '<div class="tabs"><button data-sktab="act" class="' + (skTab === 'act' ? 'on' : '') + '">' + esc(text("skills.active", "Active skills")) + '</button><button data-sktab="pas" class="' + (skTab === 'pas' ? 'on' : '') + '">' + esc(text("skills.passive", "Passive skills")) + '</button></div>' +
    (passiveTab ? '<div class="mu">' + esc(text('skill.passiveTooltipHint', 'Hover a passive skill and hold Shift for details.')) + '</div>' : '') +
    list.map(k => { const [n, key, ic, d] = skillInfo(k), r = me.sk[k] || 0, M_ = maxSkillRank(k); return '<div class="row"' + (passiveTab ? ' data-passive-skill="' + k + '"' : '') + '><div class="ico">' + ic + '</div><div class="t"><b>' + esc(n) + '</b>' + (key ? ' <kbd>' + (BINDS['skill' + key] || key).toUpperCase() + '</kbd>' : '') + ' <span class="mu" style="font-size:0.6875rem">' + r + '/' + M_ + '</span><span class="pips">' + (M_ > 10 ? '<span class="rankbar"><i style="width:' + Math.round(r / M_ * 100) + '%"></i></span>' : Array.from({ length: M_ }, (_, i) => '<i class="' + (i < r ? 'on' : '') + '"' + (M_ > 5 ? ' style="width:6px"' : '') + '></i>').join('')) + '</span><small>' + esc(r || k === 's1' || !key ? d : text("skill.notLearned", "Not learned")) + '</small></div><button data-learn="' + k + '"' + (me.sp > 0 && r < M_ ? '' : ' disabled') + '>+</button></div>'; }).join('') +
    '<div class="mu" style="font-size:0.6875rem;margin-top:6px">' + esc(text('skill.summary', '1 point per level. Actives max {active}, passives max {passive}. A Skill Reset Scroll (Merchant) refunds everything.', { active: I.maxRank, passive: I.pMax || 10 })) + '</div>';
  if (hoveredPassive) {
    hoveredSkillElement = $('skl').querySelector('[data-passive-skill]:hover');
    if (hoveredSkillElement) updateSkillTooltip(restoreTooltip);
    else tip.style.display = 'none';
  }
}
document.addEventListener('click', e => { const t = e.target.closest('[data-sktab]'); if (t) { skTab = t.dataset.sktab; buildSkills(); } });
// ---------- settings & key bindings ----------
const BIND_DEF = { skill1: '1', skill2: '2', skill3: '3', hp: 'q', mp: 'e', hp2: 'r', ret: 't', talk: 'f', inv: 'i', skills: 'k', team: 'y', history: 'h', settings: 'o', mute: 'm', gfx: 'g', fps: 'p', attack: ' ' };
const BIND_NAME = { skill1: 'Skill 1', skill2: 'Skill 2', skill3: 'Skill 3', hp: 'Health potion', mp: 'Mana potion', hp2: 'Greater health potion', ret: 'Return scroll', talk: 'Talk to NPC', inv: 'Inventory', skills: 'Skills window', team: 'Team', history: 'Chronicle', settings: 'Settings', mute: 'Mute', gfx: 'Cycle graphics quality', fps: 'FPS counter', attack: 'Attack nearest monster' };
let BINDS = Object.assign({}, BIND_DEF); try { Object.assign(BINDS, JSON.parse(localStorage.getItem('sl_keys') || '{}')); } catch (e) {}
for (const [action, defaultKey] of Object.entries(BIND_DEF)) {
  if (BINDS[action] === 'shift') BINDS[action] = actionOf(defaultKey) ? '' : defaultKey;
}
if (Object.keys(BIND_DEF).some(action => action !== 'attack' && BINDS[action] === BINDS.attack)) BINDS.attack = '';
let bindWait = null;
const keyName = k => ({ ' ': 'SPACE', control: 'CTRL', shift: 'SHIFT', alt: 'ALT', tab: 'TAB' })[k] || (k ? k.toUpperCase() : text("settings.unbound", "UNBOUND"));
function actionOf(k) { for (const a in BINDS) if (BINDS[a] === k) return a; return null; }
function saveBinds() { try { localStorage.setItem('sl_keys', JSON.stringify(BINDS)); } catch (e) {} applyBindLabels(); }
function applyBindLabels() { const map = { '1': 'skill1', '2': 'skill2', '3': 'skill3' }; document.querySelectorAll('#hotbar [data-sk]').forEach(el => el.querySelector('.key').textContent = keyName(BINDS['skill' + el.dataset.sk])); document.querySelectorAll('#hotbar [data-it]').forEach(el => el.querySelector('.key').textContent = keyName(BINDS[el.dataset.it])); }
function buildKeys() { $('kbl').innerHTML = Object.keys(BIND_DEF).map(a => '<span>'  + esc(text('binding.' + a, BIND_NAME[a])) + '</span><button data-bind="' + a + '" class="' + (bindWait === a ? 'wait' : '') + '">' + (bindWait === a ? text("settings.pressKey", "press…") : keyName(BINDS[a])) + '</button>').join(''); }
addEventListener('keydown', e => {
  if (!bindWait || smithAutoDialog.open) return; e.preventDefault(); e.stopImmediatePropagation(); const k = e.key.toLowerCase();
  if (k === 'shift') {
    toast(text('settings.shiftReserved', 'Shift is reserved for tooltips.'));
  } else if ((k.length === 1 && 'wasd'.includes(k)) || k.startsWith('arrow') || k === 'enter') {
    toast(text('settings.reservedKey', 'That key is reserved for movement / chat'));
  } else if (k !== 'escape') {
    const other = actionOf(k);
    if (other && other !== bindWait) BINDS[other] = BINDS[bindWait];
    BINDS[bindWait] = k;
    saveBinds();
  }
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
function buildSettings() { $('gfxsel').value = GL.Q.mode; $('fpslimit').value = GL.Q.fpsLimit; $('renderscale').value = GL.Q.resolution; $('shadowquality').value = GL.Q.shadowQuality; $('fpschk').checked = $('perf').style.display === 'block'; $('vol').value = Math.round(volume * 100); $('volc').value = Math.round(volC * 100); $('volu').value = Math.round(volU * 100); $('mutechk').checked = muted; volLabels(); buildKeys(); }
$('gfxsel').onchange = e => { GL.setQuality(e.target.value); toast(text("settings.qualityChanged", "Graphics: {quality}", { quality: qualityName(e.target.value) })); };
$('fpslimit').onchange = e => GL.setRenderOptions({ fpsLimit: +e.target.value });
$('renderscale').onchange = e => GL.setRenderOptions({ resolution: +e.target.value });
$('shadowquality').onchange = e => GL.setRenderOptions({ shadowQuality: e.target.value });
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
  setT('goldl', '💰 ' + GameText.number(me.g) + '   🔮 ' + GameText.number(me.so || 0) + '   🎒 ' + me.bag + '/' + I.bagMax); setD('sppill', me.sp > 0 ? 'block' : 'none');
  setH('buffs', Object.keys(me.buf).map(k => '<span class="bf">'  + esc(text('buff.' + k, BUFFN[k] || k)) + ' ' + fmtTime(me.buf[k]) + '</span>').join(''));
  if (!_hot) _hot = { sk: [...document.querySelectorAll('#hotbar [data-sk]')].map(el => ({ el, rk: el.querySelector('.rk'), u: el.querySelector('u') })), it: [...document.querySelectorAll('#hotbar [data-it]')].map(el => ({ el, em: el.querySelector('em'), k: el.dataset.it })) };
  _hot.sk.forEach((h, i) => { const r = me.sk[['s1', 'mend', 'frenzy'][i]], c = [me.c1, me.c2, me.c3][i]; if (c > cdMax[i]) cdMax[i] = c; const cd = Math.round(Math.min(100, c / cdMax[i] * 100)); if (h.r !== r) { h.r = r; h.el.classList.toggle('lock', r < 1); h.rk.textContent = r ? 'R' + r : ''; } if (h.cd !== cd) { h.cd = cd; h.u.style.setProperty('--p', cd); } });
  _hot.it.forEach(h => { const n = me.inv[h.k] || 0; if (h.n !== n) { h.n = n; h.em.textContent = n; h.el.classList.toggle('lock', !n); } });
  setD('dead', me.dead ? 'flex' : 'none'); if (me.dead) setT('deadsec', text("hud.respawn", "Respawning in {seconds}s", { seconds: Math.ceil(me.dead / 1000) }));
  const low = me.hp / me.mh < 0.3 && !me.dead; if (_hc.low !== low) { _hc.low = low; $('hurtfx').classList.toggle('low', low); if (!low) $('hurtfx').style.opacity = 0; }
  const T = me.tg && mo.find(m => m.id === me.tg);
  if (T) { const t = I.types[T.ty]; setD('tgt', 'block'); setH('tgtn', (t.wb ? '<span style="color:#ffd24a">👑 </span>' : t.boss ? '<span style="color:#ffd24a">★ </span>' : '') + (T.al ? '<span style="color:#ffb04a">' + esc(text("mob.alpha", "Alpha ")) + '</span>' : '') + esc(mobName(T.ty, t.n)) + ' ' + monsterLevelLabel(T.l, me.l) + (t.wb ? '<span class="tag" style="background:#ffd24a;color:#000">' + esc(text("mob.worldBossTag", "WORLD BOSS")) + '</span>' : t.boss ? '<span class="tag" style="background:#ffd24a;color:#000">' + esc(text("mob.bossTag", "BOSS")) + '</span>' : T.al ? '<span class="tag" style="background:#ffb04a;color:#000">' + esc(text("mob.alphaTag", "ALPHA")) + '</span>' : '')); const b = $('tgt').querySelector('.bar'), p = Math.round(Math.max(0, T.hp / T.mh * 100)); if (_hc.tp !== p) { _hc.tp = p; b.firstChild.style.width = p + '%'; } const tx = GameText.number(T.hp) + ' / ' + GameText.number(T.mh); if (_hc.tt !== tx) { _hc.tt = tx; b.lastChild.textContent = tx; } } else setD('tgt', 'none');
  const damageChanged = _hc.inventoryDamage !== me.dmg;
  _hc.inventoryDamage = me.dmg;
  const s = me.sp + '|' + me.g + '|' + me.l + '|' + JSON.stringify(me.sk) + JSON.stringify(me.inv);
  if (s !== sig) { sig = s; if (isOpen('skillp')) buildSkills(); if (isOpen('invp')) buildInv(); if (isOpen('smithw')) buildSmith(); }
  else if (damageChanged && isOpen('invp')) buildInv();
}

// Gold offered in a trade is sent when the field changes.
$('trgold').addEventListener('change', () => { if (TRADE) send({ t: 'trade', op: 'offer', uids: TRADE.mine.uids, gold: Math.max(0, Math.floor(+$('trgold').value || 0)) }); });
