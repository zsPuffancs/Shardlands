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
const iconOf = it => it.slot === 'weapon' ? SLOTICON[it.fam] || '⚔️' : SLOTICON[it.slot];
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
function toggleMute() { muted = !muted; try { localStorage.setItem('sl_mute', muted ? '1' : '0'); } catch (e) {} toast(muted ? 'Sound off' : 'Sound on'); if (!muted) sfx('click'); if (isOpen('setw')) $('mutechk').checked = muted; }

// ---------- chat / banner / toasts ----------
function log(n, m) {
  const d = document.createElement('div');
  d.innerHTML = (n && n !== '*' ? '<b style="color:#9fd0ff">' + esc(n) + ': </b>' : '') + (n === '*' ? '<span style="color:#e8bf55">' : '') + esc(m) + (n === '*' ? '</span>' : '');
  const l = $('log'); l.appendChild(d); while (l.children.length > 10) l.removeChild(l.firstChild);
}
let bannerT = 0;
function banner(title, sub, danger) { const z = $('zone'); z.querySelector('b').textContent = title; z.querySelector('span').textContent = sub || ''; z.classList.toggle('danger', !!danger); z.style.opacity = 1; clearTimeout(bannerT); bannerT = setTimeout(() => z.style.opacity = 0, 3400); }
function toast(m, c) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; if (c) { t.style.color = c; t.style.borderColor = c; } const box = $('toasts'); box.appendChild(t); while (box.children.length > 4) box.removeChild(box.firstChild); setTimeout(() => t.style.opacity = 0, 3200); setTimeout(() => t.remove(), 3800); }
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
  const c = RC[it.rar];
  return '<div class="slot' + (extra || '') + '" style="border-color:' + c + ';box-shadow:inset 0 0 10px ' + c + '77" ' + attrs + '>' + iconOf(it) + '<sup>' + it.ilvl + '</sup>' + (it.plus ? '<sub>+' + it.plus + '</sub>' : '') + '</div>';
}
function onInv(m) { BAG = m.bag; EQ = m.eq; GS = m.gs; mergeSel = mergeSel.filter(u => BAG.some(i => i.uid === u)); if (isOpen('invp')) buildInv(); if (isOpen('smithw')) buildSmith(); }
function buildInv() {
  if (!I || !me) return;
  $('gld').textContent = '💰 ' + me.g.toLocaleString();
  $('eqwrap').innerHTML = I.slots.map(s => EQ[s] ? slotHtml(EQ[s], 'data-tip="eq:' + s + '" data-eq="' + s + '"') : '<div class="slot empty" title="' + SLOTNAME[s] + '">' + SLOTICON[s] + '</div>').join('');
  const line = (n, v) => '<div>' + n + '<b>' + v + '</b></div>';
  $('gst').innerHTML = line('⚔ Damage', GS._dmg || 0) + line('🎯 Crit', (GS._crit || 12) + '%') + line('❤ Max HP', GS._hp || 0) + line('🛡 Reduction', (GS._dr || 0) + '%') + line('💧 Max MP', GS._mp || 0) + line('💨 Speed', '+' + Math.min(60, GS.spd || 0).toFixed(1) + '%') + line('📖 XP bonus', '+' + (GS.xpb || 0).toFixed(1) + '%') + line('💥 Crit damage', (GS._cdmg || 180) + '%') + line('🩸 Lifesteal', (GS._ls || 0) + '%') + line('⚡ Attack speed', '+' + (GS._haste || 0) + '%') + line('💰 Total gold find', '+' + (GS._gf || 0) + '%');
  const cells = []; for (let i = 0; i < I.bagMax; i++) { const it = BAG[i]; cells.push(it ? slotHtml(it, 'data-tip="bag:' + it.uid + '" data-bag="' + it.uid + '"', mergeSel.includes(it.uid) ? ' sel' : '') : '<div class="slot empty"></div>'); }
  $('bag').innerHTML = cells.join(''); $('bagc').textContent = BAG.length + ' / ' + I.bagMax; $('bagfull').textContent = BAG.length >= I.bagMax ? 'Bag full - merge or sell items.' : '';
  $('mergeBtn').classList.toggle('on', mergeMode); $('mergebar').style.display = mergeMode ? 'flex' : 'none';
  if (mergeMode) { const it = mergeSel.map(u => BAG.find(i => i.uid === u)).filter(Boolean), r = it.length ? it[0].rar : -1, lo = Math.max(1, Math.round(me.l * .8)), hi = Math.round(me.l * 1.2);
    $('mergeinfo').innerHTML = !it.length ? 'Pick 3 bag items of the <b>same colour</b> (any slot, any level).' : it.length + '/3 <b style="color:' + RC[r] + '">' + I.rarity[r] + '</b> → <b style="color:' + RC[Math.min(4, r + 1)] + '">' + I.rarity[Math.min(4, r + 1)] + ' ' + SLOTNAME[it[0].slot] + '</b> · iLvl ' + lo + '-' + hi;
    $('mergeGo').disabled = it.length !== 3; }
  const list = Object.keys(I.items).filter(k => me.inv[k] > 0);
  $('inl').innerHTML = list.length ? list.map(k => '<div class="chip" data-use="' + k + '" data-tip="cons:' + k + '"><i style="background:' + (I.items[k].color || '#ccc') + '"></i>' + esc(I.items[k].n) + ' ×' + me.inv[k] + '</div>').join('') : '<span class="mu" style="font-size:12px">Nothing yet. Monsters drop potions and scrolls.</span>';
}
function tipItem(it, cmp, plusOverride) {
  const pl = plusOverride === undefined ? it.plus || 0 : plusOverride;
  let h = '<b class="nm" style="color:' + RC[it.rar] + '">' + esc(it.name) + (pl ? ' +' + pl : '') + '</b><div class="mu">' + I.rarity[it.rar] + ' ' + (it.slot === 'weapon' ? { sword: 'Sword', bow: 'Bow', staff: 'Staff' }[it.fam] || 'Weapon' : SLOTNAME[it.slot]) + ' · iLvl ' + it.ilvl + '</div><div style="margin:5px 0">';
  for (const k of STATORDER) if (k in it.stats) { const v = eff(it, k, pl); let d = ''; if (cmp && cmp.uid !== it.uid) { const df = v - (k in cmp.stats ? eff(cmp, k) : 0); if (Math.abs(df) > 0.049) d = '<span class="' + (df > 0 ? 'up' : 'dn') + '">' + (df > 0 ? '▲' : '▼') + fmtS(k, Math.abs(df)) + '</span>'; } h += '<div class="ln"><span>+' + fmtS(k, v) + ' ' + I.stat[k].n + '</span>' + d + '</div>'; }
  if (cmp && cmp.uid !== it.uid) for (const k of STATORDER) if (k in cmp.stats && !(k in it.stats)) h += '<div class="ln dn"><span>-' + fmtS(k, eff(cmp, k)) + ' ' + I.stat[k].n + '</span><span>▼</span></div>';
  h += '</div><div class="' + (me.l < it.req ? 'dn' : 'mu') + '">Requires level ' + it.req + '</div>';
  if (isOpen('shopw')) h += '<div class="mu">Merchant pays ' + sellValue(it) + 'g</div>';
  return h;
}
const tip = $('tip');
document.addEventListener('mouseover', e => {
  const el = e.target.closest && e.target.closest('[data-tip]'); if (!el || !I || !me) { tip.style.display = 'none'; return; }
  const [kind, id] = el.dataset.tip.split(':'); let h = '';
  if (kind === 'bag') { const it = BAG.find(x => x.uid === id); if (it) h = tipItem(it, EQ[it.slot]) + '<div class="mu" style="margin-top:4px">' + (mergeMode ? 'Click: select for merging' : 'Click: equip' + (isOpen('shopw') ? ' · Shift/right-click: sell' : '')) + '</div>'; }
  else if (kind === 'eq') { const it = EQ[id]; if (it) h = tipItem(it) + '<div class="mu" style="margin-top:4px">Click: unequip</div>'; }
  else if (kind === 'sm') { const it = findItem(id); if (it) h = tipItem(it); }
  else if (kind === 'cons') { const it = I.items[id]; h = '<b class="nm" style="color:' + (it.color || '#fff') + '">' + esc(it.n) + '</b><div>' + esc(it.d) + '</div><div class="mu">Merchant price ' + it.price + 'g</div>'; }
  if (!h) { tip.style.display = 'none'; return; } tip.innerHTML = h; tip.style.display = 'block';
});
document.addEventListener('mousemove', e => { if (tip.style.display === 'block') { const w = tip.offsetWidth, hh = tip.offsetHeight; tip.style.left = Math.min(innerWidth - w - 8, e.clientX + 16) + 'px'; tip.style.top = Math.min(innerHeight - hh - 8, e.clientY + 12) + 'px'; } });
document.addEventListener('mouseout', e => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('[data-tip]')) tip.style.display = 'none'; });
const findItem = uid => BAG.find(i => i.uid === uid) || Object.values(EQ).find(i => i && i.uid === uid);
document.addEventListener('click', e => {
  const t = e.target.closest('button,[data-bag],[data-eq],[data-use],[data-sm]'); if (!t) return; sfx('click');
  if (t.dataset.close !== undefined) { closeWin(t.closest('.win').id); return; }
  if (t.dataset.open) { togglePanel(t.dataset.open); return; }
  if (t.dataset.sm) { smSel = t.dataset.sm; buildSmith(); return; }
  if (t.dataset.bag && mergeMode) { const id = t.dataset.bag, it = BAG.find(i => i.uid === id), k = mergeSel.indexOf(id); if (!it) return;
    if (k >= 0) mergeSel.splice(k, 1); else { const f = BAG.find(i => i.uid === mergeSel[0]); if (f && f.rar !== it.rar) mergeSel = []; if (mergeSel.length < 3) mergeSel.push(id); } buildInv(); return; }
  if (t.id === 'mergeBtn') { mergeMode = !mergeMode; mergeSel = []; buildInv(); return; }
  if (t.id === 'mergeGo') { if (mergeSel.length === 3) { send({ t: 'merge', uids: mergeSel }); mergeSel = []; sfx('equip'); } return; }
  if (t.id === 'autoMerge') { send({ t: 'automerge', max: 1 }); return; }
  if (t.id === 'autoMerge2') { send({ t: 'automerge', max: 2 }); return; }
  if (t.id === 'junk') { send({ t: 'sellall', rar: 1 }); sfx('sell'); return; }
  if (t.id === 'junk2') { send({ t: 'sellall', rar: 2 }); sfx('sell'); return; }
  if (t.id === 'smgo') { if (smSel) { send({ t: 'upgrade', uid: smSel }); $('smres').textContent = '…'; $('smres').style.color = '#ccc'; sfx('click'); } return; }
  if (t.dataset.bag) { if (e.shiftKey && isOpen('shopw')) { send({ t: 'sell', uid: t.dataset.bag }); sfx('sell'); } else { send({ t: 'equip', uid: t.dataset.bag }); sfx('equip'); } tip.style.display = 'none'; return; }
  if (t.dataset.eq) { send({ t: 'unequip', slot: t.dataset.eq }); sfx('equip'); tip.style.display = 'none'; return; }
  if (t.dataset.use) { send({ t: 'use', i: t.dataset.use }); return; }
  if (t.dataset.learn) send({ t: 'learn', k: t.dataset.learn }); if (t.dataset.buy) send({ t: 'buy', i: t.dataset.buy, n: +t.dataset.n });
});
document.addEventListener('contextmenu', e => { const t = e.target.closest && e.target.closest('[data-bag]'); if (t) { e.preventDefault(); if (isOpen('shopw')) { send({ t: 'sell', uid: t.dataset.bag }); sfx('sell'); } else toast('Talk to the Merchant to sell items'); tip.style.display = 'none'; } });
document.querySelectorAll('#hotbar .sk').forEach(el => el.onclick = () => el.dataset.sk ? send({ t: 'skill', n: +el.dataset.sk }) : send({ t: 'use', i: el.dataset.it }));

// ---------- merchant / blacksmith ----------
function buildShop() {
  if (!I) return;
  $('shl').innerHTML = Object.keys(I.items).map(k => { const it = I.items[k]; return '<div class="row"><div class="ico" style="border-color:' + (it.color || '#888') + '">' + (ITEMICON[k] || '🧪') + '</div><div class="t"><b style="color:' + (it.color || '#fff') + '">' + esc(it.n) + '</b><small>' + esc(it.d) + '</small></div><button data-buy="' + k + '" data-n="1">' + it.price + 'g</button><button data-buy="' + k + '" data-n="10">×10</button></div>'; }).join('');
}
function buildSmith() {
  if (!I || !me) return;
  const all = I.slots.map(s => EQ[s]).filter(Boolean);
  if (smSel && !findItem(smSel)) smSel = null; if (!smSel && EQ.weapon) smSel = EQ.weapon.uid;
  $('smpick').innerHTML = all.map((it, i) => slotHtml(it, 'data-sm="' + it.uid + '" data-tip="sm:' + it.uid + '"', (smSel === it.uid ? ' pick' : '')) + (i === I.slots.filter(s => EQ[s]).length - 1 && BAG.length ? '' : '')).join('');
  const it = smSel && findItem(smSel);
  if (!it) { $('smcard').innerHTML = '<div class="mu">No equipment.</div>'; $('smgo').disabled = true; return; }
  const worn = true;
  if (it.plus >= 9) { $('smcard').innerHTML = '<div class="itemcard">' + tipItem(it) + '<div class="up" style="margin-top:6px">Maximum level reached (+9).</div></div>'; $('smgo').disabled = true; return; }
  const c = upCost(it), ch = Math.round(I.upRate[it.plus] * 100);
  let rows = ''; for (const k of STATORDER) if (k in it.stats) rows += '<div class="ln"><span>' + I.stat[k].n + '</span><span>' + fmtS(k, eff(it, k)) + ' → <b class="up">' + fmtS(k, eff(it, k, it.plus + 1)) + '</b></span></div>';
  $('smcard').innerHTML = '<div class="itemcard"><b class="nm" style="color:' + RC[it.rar] + '">' + esc(it.name) + ' +' + it.plus + ' → +' + (it.plus + 1) + '</b><div class="mu">' + (worn ? 'Equipped' : 'In bag') + ' · iLvl ' + it.ilvl + '</div><div style="margin:6px 0">' + rows + '</div>' +
    '<div class="ln"><span>Cost</span><b style="color:' + (me.g >= c ? '#ffd77a' : '#ff7a6a') + '">' + c.toLocaleString() + 'g</b></div><div class="ln"><span>Success chance</span><b style="color:' + (ch >= 70 ? '#6fe39a' : ch >= 40 ? '#ffd24a' : '#ff7a6a') + '">' + ch + '%</b></div>' +
    (it.plus >= 5 ? '<div class="dn" style="margin-top:4px">⚠ Failure drops the item to +' + (it.plus - 1) + '</div>' : '<div class="mu" style="margin-top:4px">Failure only costs gold.</div>') + '</div>';
  $('smgo').disabled = me.g < c; $('smgo').textContent = 'Upgrade for ' + c.toLocaleString() + 'g';
}
function onForge(m) {
  const r = $('smres'); r.textContent = m.ok ? '✔ Success! Now +' + m.plus : (m.drop ? '✖ Failed - dropped to +' + m.plus : '✖ Failed'); r.style.color = m.ok ? '#6fe39a' : '#ff7a6a';
  sfx(m.ok ? 'lvl' : 'fail'); if (m.ok && m.plus >= 7) toast('Forged +' + m.plus + '!', '#ffd24a');
}

// ---------- skills ----------
const SK_ACT = ['s1', 'mend', 'frenzy'], SK_PAS = ['vit', 'might', 'swift', 'crit', 'critdmg', 'lifesteal', 'guard', 'haste', 'focus', 'fortune']; let skTab = 'act';
const PAS = { vit: ['Vitality', '❤️', 'max HP', 5, '%'], might: ['Might', '💪', 'damage', 5, '%'], swift: ['Swiftness', '💨', 'move speed', 4, '%'], crit: ['Precision', '🎯', 'critical hit chance', 1.5, '%'], critdmg: ['Brutality', '💥', 'critical hit damage', 12, '%'], lifesteal: ['Bloodthirst', '🩸', 'of damage dealt healed (lifesteal)', 0.8, '%'], guard: ['Iron Skin', '🛡️', 'less damage taken', 2.5, '%'], haste: ['Haste', '⚡', 'attack speed', 3.5, '%'], focus: ['Focus', '🔷', 'max MP and +10% MP regen per rank', 5, '%'], fortune: ['Fortune', '💰', 'gold find', 6, '%'] };
function skillInfo(k) {
  const c = I.classes[I.cls], r = me.sk[k] || 0, n = r || 1;
  switch (k) {
    case 's1': return [c.s1, '1', S1ICON[I.cls] || '🌀', '×' + (c.s1m * (1 + .18 * (n - 1))).toFixed(2) + ' damage · ' + Math.round(c.s1c * (1 + .05 * (n - 1))) + ' MP · ' + (I.cls === 'archer' ? 'hits ' + (3 + (n >= 3 ? 2 : 0) + (n >= 5 ? 2 : 0)) + ' targets' : 'area attack')];
    case 'mend': return [c.s2, '2', '💚', 'Heal ' + Math.round(20 + 8 * n) + '% HP · 20 MP · ' + (8 - .5 * n) + 's cooldown'];
    case 'frenzy': return [c.s3, '3', '🔥', '+' + Math.round(20 + 5 * n) + '% damage & faster attacks for ' + (6 + 2 * n) + 's · 30 MP'];
  }
  const p = PAS[k]; return [p[0], '', p[1], (r ? '+' + Math.round(p[3] * r * 10) / 10 + '% ' + p[2] + ' · ' : '') + 'next rank +' + p[3] + '%'];
}
function buildSkills() {
  if (!I || !me) return; $('spn').textContent = me.sp ? '★ ' + me.sp + ' point' + (me.sp > 1 ? 's' : '') : 'no points'; $('spn').style.color = me.sp ? '#ffe97a' : '';
  const list = skTab === 'act' ? SK_ACT : SK_PAS, mx = k => SK_ACT.includes(k) ? I.maxRank : (I.pMax || 10);
  $('skl').innerHTML = '<div class="tabs"><button data-sktab="act" class="' + (skTab === 'act' ? 'on' : '') + '">Active skills</button><button data-sktab="pas" class="' + (skTab === 'pas' ? 'on' : '') + '">Passive skills</button></div>' +
    list.map(k => { const [n, key, ic, d] = skillInfo(k), r = me.sk[k] || 0, M_ = mx(k); return '<div class="row"><div class="ico">' + ic + '</div><div class="t"><b>' + esc(n) + '</b>' + (key ? ' <kbd>' + (BINDS['skill' + key] || key).toUpperCase() + '</kbd>' : '') + ' <span class="mu" style="font-size:11px">' + r + '/' + M_ + '</span><span class="pips">' + Array.from({ length: M_ }, (_, i) => '<i class="' + (i < r ? 'on' : '') + '"' + (M_ > 5 ? ' style="width:6px"' : '') + '></i>').join('') + '</span><small>' + (r || k === 's1' || !key ? d : 'Not learned') + '</small></div><button data-learn="' + k + '"' + (me.sp > 0 && r < M_ ? '' : ' disabled') + '>+</button></div>'; }).join('') +
    '<div class="mu" style="font-size:11px;margin-top:6px">1 point per level. Actives max ' + I.maxRank + ', passives max ' + (I.pMax || 10) + '. A Skill Reset Scroll (Merchant) refunds everything.</div>';
}
document.addEventListener('click', e => { const t = e.target.closest('[data-sktab]'); if (t) { skTab = t.dataset.sktab; buildSkills(); } });
// ---------- settings & key bindings ----------
const BIND_DEF = { skill1: '1', skill2: '2', skill3: '3', hp: 'q', mp: 'e', hp2: 'r', ret: 't', talk: 'f', inv: 'i', skills: 'k', settings: 'o', mute: 'm', gfx: 'g', fps: 'p', attack: ' ' };
const BIND_NAME = { skill1: 'Skill 1', skill2: 'Skill 2', skill3: 'Skill 3', hp: 'Health potion', mp: 'Mana potion', hp2: 'Greater health potion', ret: 'Return scroll', talk: 'Talk to NPC', inv: 'Inventory', skills: 'Skills window', settings: 'Settings', mute: 'Mute', gfx: 'Cycle graphics quality', fps: 'FPS counter', attack: 'Attack nearest monster' };
let BINDS = Object.assign({}, BIND_DEF); try { Object.assign(BINDS, JSON.parse(localStorage.getItem('sl_keys') || '{}')); } catch (e) {}
if (Object.keys(BIND_DEF).some(action => action !== 'attack' && BINDS[action] === BINDS.attack)) BINDS.attack = '';
let bindWait = null;
const keyName = k => ({ ' ': 'SPACE', control: 'CTRL', shift: 'SHIFT', alt: 'ALT', tab: 'TAB' })[k] || (k ? k.toUpperCase() : 'UNBOUND');
function actionOf(k) { for (const a in BINDS) if (BINDS[a] === k) return a; return null; }
function saveBinds() { try { localStorage.setItem('sl_keys', JSON.stringify(BINDS)); } catch (e) {} applyBindLabels(); }
function applyBindLabels() { const map = { '1': 'skill1', '2': 'skill2', '3': 'skill3' }; document.querySelectorAll('#hotbar [data-sk]').forEach(el => el.querySelector('.key').textContent = keyName(BINDS['skill' + el.dataset.sk])); document.querySelectorAll('#hotbar [data-it]').forEach(el => el.querySelector('.key').textContent = keyName(BINDS[el.dataset.it])); }
function buildKeys() { $('kbl').innerHTML = Object.keys(BIND_DEF).map(a => '<span>' + BIND_NAME[a] + '</span><button data-bind="' + a + '" class="' + (bindWait === a ? 'wait' : '') + '">' + (bindWait === a ? 'press…' : keyName(BINDS[a])) + '</button>').join(''); }
addEventListener('keydown', e => {
  if (!bindWait) return; e.preventDefault(); e.stopImmediatePropagation(); const k = e.key.toLowerCase();
  if (k !== 'escape') { if ('wasd'.includes(k) && k.length === 1 || k.startsWith('arrow') || k === 'enter') { toast('That key is reserved for movement / chat'); } else { const other = actionOf(k); if (other && other !== bindWait) BINDS[other] = BINDS[bindWait]; BINDS[bindWait] = k; saveBinds(); } }
  bindWait = null; buildKeys();
}, true);
document.addEventListener('click', e => { const b = e.target.closest('[data-bind]'); if (b) { bindWait = b.dataset.bind; buildKeys(); return; } const t = e.target.closest('[data-stab]'); if (t) { document.querySelectorAll('[data-stab]').forEach(x => x.classList.toggle('on', x === t)); document.querySelectorAll('[data-spage]').forEach(p => p.style.display = p.dataset.spage === t.dataset.stab ? 'block' : 'none'); } });
$('kbreset').onclick = () => { BINDS = Object.assign({}, BIND_DEF); saveBinds(); buildKeys(); toast('Key bindings reset'); };
function volLabels() { $('volv').textContent = Math.round(volume * 100) + '%'; $('volcv').textContent = Math.round(volC * 100) + '%'; $('voluv').textContent = Math.round(volU * 100) + '%'; }
function buildSettings() { $('gfxsel').value = GL.Q.mode; $('fpschk').checked = $('perf').style.display === 'block'; $('vol').value = Math.round(volume * 100); $('volc').value = Math.round(volC * 100); $('volu').value = Math.round(volU * 100); $('mutechk').checked = muted; volLabels(); buildKeys(); }
$('gfxsel').onchange = e => { GL.setQuality(e.target.value); toast('Graphics: ' + e.target.value); };
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
  const c = I.classes[I.cls]; $('who').innerHTML = esc(I.name) + ' <small>' + esc(c.name) + '</small>'; $('portrait').textContent = CLSICON[I.cls] || CLSICON[{ sword: 'blade', bow: 'archer', staff: 'mage' }[c.fam]] || '⚔️';
  const sk = document.querySelectorAll('#hotbar [data-sk]'); sk[0].querySelector('.ic').textContent = S1ICON[I.cls] || S1ICON[{ sword: 'blade', bow: 'archer', staff: 'mage' }[c.fam]] || '🌀';
  [c.s1, c.s2, c.s3].forEach((n, i) => sk[i].querySelector('.nm').textContent = n); buildShop();
}
function hud() {
  setT('plvl', me.l); setBar('hp', me.hp, me.mh, me.hp + ' / ' + me.mh); setBar('mp', me.mp, me.mm, me.mp + ' / ' + me.mm);
  setBar('xpbar', me.xp, me.xn, 'Lv ' + me.l + ' · ' + Math.floor(me.xp / me.xn * 1000) / 10 + '%');
  setT('goldl', '💰 ' + me.g.toLocaleString() + '   🎒 ' + me.bag + '/' + I.bagMax); setD('sppill', me.sp > 0 ? 'block' : 'none');
  setH('buffs', Object.keys(me.buf).map(k => '<span class="bf">' + BUFFN[k] + ' ' + Math.ceil(me.buf[k] / 1000) + 's</span>').join(''));
  if (!_hot) _hot = { sk: [...document.querySelectorAll('#hotbar [data-sk]')].map(el => ({ el, rk: el.querySelector('.rk'), u: el.querySelector('u') })), it: [...document.querySelectorAll('#hotbar [data-it]')].map(el => ({ el, em: el.querySelector('em'), k: el.dataset.it })) };
  _hot.sk.forEach((h, i) => { const r = me.sk[['s1', 'mend', 'frenzy'][i]], c = [me.c1, me.c2, me.c3][i]; if (c > cdMax[i]) cdMax[i] = c; const cd = Math.round(Math.min(100, c / cdMax[i] * 100)); if (h.r !== r) { h.r = r; h.el.classList.toggle('lock', r < 1); h.rk.textContent = r ? 'R' + r : ''; } if (h.cd !== cd) { h.cd = cd; h.u.style.setProperty('--p', cd); } });
  _hot.it.forEach(h => { const n = me.inv[h.k] || 0; if (h.n !== n) { h.n = n; h.em.textContent = n; h.el.classList.toggle('lock', !n); } });
  setD('dead', me.dead ? 'flex' : 'none'); if (me.dead) setT('deadsec', 'Respawning in ' + Math.ceil(me.dead / 1000) + 's');
  const low = me.hp / me.mh < 0.3 && !me.dead; if (_hc.low !== low) { _hc.low = low; $('hurtfx').classList.toggle('low', low); if (!low) $('hurtfx').style.opacity = 0; }
  const T = me.tg && mo.find(m => m.id === me.tg);
  if (T) { const t = I.types[T.ty]; setD('tgt', 'block'); setH('tgtn', (t.boss ? '<span style="color:#ffd24a">★ </span>' : '') + (T.al ? '<span style="color:#ffb04a">Alpha </span>' : '') + esc(t.n) + ' <span class="mu">Lv ' + T.l + '</span>' + (t.boss ? '<span class="tag" style="background:#ffd24a;color:#000">BOSS</span>' : T.al ? '<span class="tag" style="background:#ffb04a;color:#000">ALPHA</span>' : '')); const b = $('tgt').querySelector('.bar'), p = Math.round(Math.max(0, T.hp / T.mh * 100)); if (_hc.tp !== p) { _hc.tp = p; b.firstChild.style.width = p + '%'; } const tx = T.hp.toLocaleString() + ' / ' + T.mh.toLocaleString(); if (_hc.tt !== tx) { _hc.tt = tx; b.lastChild.textContent = tx; } } else setD('tgt', 'none');
  const s = me.sp + '|' + me.g + '|' + me.l + '|' + JSON.stringify(me.sk) + JSON.stringify(me.inv);
  if (s !== sig) { sig = s; if (isOpen('skillp')) buildSkills(); if (isOpen('invp')) buildInv(); if (isOpen('smithw')) buildSmith(); }
}
