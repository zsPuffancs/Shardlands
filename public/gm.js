// Shardlands: Game Master client (F10).
//
// F10 opens the GM login before entering the game, and the GM control panel once a GM character is in the game.
// Nothing here grants anything: the server (src/player/gm-service.js) authenticates GM accounts, owns the GM
// session on its side of the connection and checks every command. This file only sends requests and shows replies.
// Saved GM Credentials use the desktop app's native vault (window.shardlandsVault, desktop/preload.js); passwords are
// never kept in localStorage, sessionStorage, IndexedDB, cookies or variables that outlive the screen showing them.
(function () {
  'use strict';
  const ACCOUNTS = ['zsPuffancs', 'ColdSteel', 'MaxyKing'];
  const GEMS = { 1: '#e0455a', 2: '#5aa8ff', 3: '#3fd08a' }; // per-account gem in the shared emblem
  const RARITY = ['Common', 'Magic', 'Rare', 'Epic', 'Legendary'];
  const el = (tag, attrs = {}, kids = []) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); } for (const c of [].concat(kids)) if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); return n; };
  const state = { account: null, mustChange: false, entered: false, flags: {}, info: null, revealUntil: 0, pendingConfirm: null, tab: 'character' };

  // ---------------- styles ----------------
  const css = `
  .gm-layer{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(6,5,4,.62);font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#efe4cf}
  .gm-layer[hidden]{display:none}
  .gm-card{width:min(440px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:linear-gradient(#241d15,#16120d);border:1px solid #8a6a2c;border-radius:8px;box-shadow:0 0 0 1px #000,0 18px 60px #000a,0 0 40px #d4a03a22;padding:20px 22px}
  .gm-card.wide{width:min(720px,calc(100vw - 32px))}
  .gm-card h2{margin:0 0 2px;font:700 22px Georgia,'Times New Roman',serif;letter-spacing:.08em;color:#f2c862;text-shadow:0 0 12px #d4a03a55}
  .gm-card .gm-sub{margin:0 0 14px;color:#b9a684;font-size:12.5px}
  .gm-card label{display:block;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:#b9a684;margin:10px 0 4px}
  .gm-card input,.gm-card select{width:100%;box-sizing:border-box;background:#0d0b08;border:1px solid #5d4922;color:#f3ead8;border-radius:4px;padding:8px 10px;font:14px system-ui,sans-serif}
  .gm-card input:focus,.gm-card select:focus,.gm-card button:focus-visible{outline:2px solid #f2c862;outline-offset:1px}
  .gm-row{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}
  .gm-row>*{flex:1 1 120px;min-width:0}
  .gm-card button{cursor:pointer;background:#2c2318;color:#f3ead8;border:1px solid #7a5d27;border-radius:4px;padding:8px 12px;font:600 13px system-ui,sans-serif}
  .gm-card button:hover{border-color:#f2c862}
  .gm-card button.pri{background:linear-gradient(#e3b452,#a8781f);color:#1b1309;border-color:#f2c862}
  .gm-card button.danger{border-color:#a3412f;color:#ffcfc3}
  .gm-card button[aria-pressed=true]{background:#f2c862;color:#1b1309}
  .gm-err{min-height:18px;margin-top:10px;color:#ff9c86;font-size:12.5px}
  .gm-ok{color:#9be3a4}
  .gm-tabs{display:flex;gap:4px;flex-wrap:wrap;margin:6px 0 14px;border-bottom:1px solid #4a3a1c;padding-bottom:8px}
  .gm-tabs button{flex:0 0 auto;padding:6px 10px;font-weight:500}
  .gm-sec{display:grid;gap:12px}
  .gm-group{border:1px solid #3d3017;border-radius:6px;padding:10px 12px;display:grid;gap:8px}
  .gm-group h3{margin:0;font:600 12px system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#d9b866}
  .gm-confirm{border:1px solid #a3412f;background:#2a1511;border-radius:6px;padding:10px 12px;display:grid;gap:8px}
  .gm-log{font-size:12.5px;color:#cbbd9f;min-height:18px}
  .gm-note{font-size:12.5px;line-height:1.5;color:#cbbd9f}
  .gm-note code{background:#0d0b08;border:1px solid #3d3017;border-radius:3px;padding:1px 5px;color:#f2c862}
  .gm-vault-row{display:grid;grid-template-columns:110px 1fr;gap:8px;align-items:center}
  .gm-vault-row .gm-row button{flex:0 0 auto}
  .gm-secret{font:13px ui-monospace,Consolas,monospace;word-break:break-all;color:#f3ead8}
  .gm-emblem{position:absolute;left:0;top:0;width:124px;height:78px;pointer-events:none;will-change:transform;filter:drop-shadow(0 0 4px rgba(255,196,80,.45)) drop-shadow(0 1px 1px #000)}
  .gm-emblem svg{width:100%;height:100%;overflow:visible}
  .gm-emblem i{position:absolute;width:3px;height:3px;border-radius:50%;background:#ffe39a;box-shadow:0 0 5px #ffc14d;opacity:0;animation:gm-spark 2.6s linear infinite}
  @keyframes gm-spark{0%{opacity:0;transform:translateY(0)}15%{opacity:.9}100%{opacity:0;transform:translateY(-26px)}}
  .gm-emblem .halo{animation:gm-halo 3.2s ease-in-out infinite}
  @keyframes gm-halo{0%,100%{opacity:.35}50%{opacity:.6}}
  @media (prefers-reduced-motion: reduce){.gm-emblem i,.gm-emblem .halo{animation:none}.gm-emblem i{display:none}}
  .lb.pl.gm .n{color:#ffd76a;text-shadow:0 0 6px #b07a1a,0 1px 1px #000}
  `;
  document.head.appendChild(el('style', { text: css }));

  // ---------------- emblem ----------------
  // Crown over large "GM" lettering with a feathered wing to each side; one gem takes the account's colour.
  function emblemSvg(gem) {
    // a swept wing of six layered feathers, longest at the top, rising from beside the letters
    const wing = side => { const f = []; for (let i = 0; i < 6; i++) { const y = 40 + i * 9, len = 64 - i * 8, x0 = side < 0 ? 64 : 176, x1 = x0 + side * len, ctl = x0 + side * len * .5;
      f.push('<path d="M' + x0 + ' ' + (y - 3) + ' Q ' + ctl + ' ' + (y - 24 + i * 3) + ' ' + x1 + ' ' + (y - 16 + i * 4) + ' Q ' + (ctl - side * 4) + ' ' + (y + 1) + ' ' + x0 + ' ' + (y + 7) + ' Z" fill="url(#gmGold)" stroke="#5a3b08" stroke-width="1.2" opacity="' + (1 - i * .07) + '"/>'); }
      return '<g>' + f.reverse().join('') + '</g>'; };
    return '<svg viewBox="0 0 240 150" aria-hidden="true"><defs>' +
      '<linearGradient id="gmGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1b8"/><stop offset=".45" stop-color="#f2c24e"/><stop offset=".75" stop-color="#b9821f"/><stop offset="1" stop-color="#7a4d0c"/></linearGradient>' +
      '<radialGradient id="gmHalo"><stop offset="0" stop-color="#ffd877" stop-opacity=".55"/><stop offset="1" stop-color="#ffd877" stop-opacity="0"/></radialGradient></defs>' +
      '<ellipse class="halo" cx="120" cy="84" rx="92" ry="52" fill="url(#gmHalo)"/>' + wing(-1) + wing(1) +
      // crown: band, five points with pearls, centre gem
      '<path d="M86 52 L92 22 L104 40 L120 14 L136 40 L148 22 L154 52 Z" fill="url(#gmGold)" stroke="#5a3b08" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<rect x="84" y="50" width="72" height="9" rx="2" fill="url(#gmGold)" stroke="#5a3b08" stroke-width="1.4"/>' +
      [92, 104, 120, 136, 148].map((x, i) => '<circle cx="' + x + '" cy="' + [21, 39, 12, 39, 21][i] + '" r="3.2" fill="#fff4cf" stroke="#5a3b08" stroke-width="1"/>').join('') +
      '<path d="M120 44 l5 6 -5 6 -5 -6 z" fill="' + gem + '" stroke="#3a2504" stroke-width="1"/>' +
      '<circle cx="100" cy="54.5" r="2" fill="' + gem + '"/><circle cx="140" cy="54.5" r="2" fill="' + gem + '"/>' +
      // letters
      '<text x="120" y="128" text-anchor="middle" font-family="Georgia,\'Times New Roman\',serif" font-weight="700" font-size="74" letter-spacing="2" fill="url(#gmGold)" stroke="#4a2f05" stroke-width="2.6" paint-order="stroke">GM</text>' +
      '<path d="M66 136 H174" stroke="url(#gmGold)" stroke-width="2.4" stroke-linecap="round"/></svg>';
  }
  const emblems = new Map();
  function emblem(id, x, z, index, height) {
    if (typeof GL === 'undefined') return;
    let e = emblems.get(id);
    if (!e) { const node = el('div', { class: 'gm-emblem' }); node.innerHTML = emblemSvg(GEMS[index] || GEMS[1]); for (let i = 0; i < 5; i++) { const s = el('i'); s.style.left = (18 + i * 21) + 'px'; s.style.top = (36 + (i % 2) * 12) + 'px'; s.style.animationDelay = (i * .52) + 's'; node.appendChild(s); } ($('labels') || document.body).appendChild(node); e = { node, vis: true, t: '' }; emblems.set(id, e); }
    e.used = true;
    const p = GL.project(x, height || 92, z);
    if (!p || p.x < -120 || p.x > innerWidth + 120 || p.y < -80 || p.y > innerHeight + 80) { if (e.vis) { e.vis = false; e.node.style.display = 'none'; } return; }
    if (!e.vis) { e.vis = true; e.node.style.display = 'block'; }
    const t = 'translate(' + ((p.x - 62) | 0) + 'px,' + ((p.y - 100) | 0) + 'px)'; if (t !== e.t) { e.t = t; e.node.style.transform = t; }
  }
  function frameEnd() { for (const [id, e] of emblems) { if (!e.used) { e.node.remove(); emblems.delete(id); } else e.used = false; } }

  // ---------------- login screen ----------------
  const loginLayer = el('div', { class: 'gm-layer', hidden: '' }), panelLayer = el('div', { class: 'gm-layer', hidden: '' });
  document.body.append(loginLayer, panelLayer);
  const errBox = () => loginLayer.querySelector('.gm-err');
  function showLogin(view = 'login') {
    loginLayer.replaceChildren(); const card = el('div', { class: 'gm-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gm-title' });
    if (view === 'login') {
      const user = el('input', { id: 'gm-user', autocomplete: 'off', maxlength: '32', spellcheck: 'false' }), pw = el('input', { id: 'gm-pw', type: 'password', autocomplete: 'off', maxlength: '128' });
      const go = () => { if (!user.value || !pw.value) return errBox().textContent = 'Enter the GM name and password.'; errBox().textContent = 'Checking…'; connect(user.value, pw.value); pw.value = ''; };
      pw.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); user.addEventListener('keydown', e => { if (e.key === 'Enter') pw.focus(); });
      card.append(el('h2', { id: 'gm-title', text: 'Game Master' }), el('p', { class: 'gm-sub', text: 'Staff sign-in. Player accounts cannot sign in here.' }),
        el('label', { for: 'gm-user', text: 'GM name' }), user, el('label', { for: 'gm-pw', text: 'Password' }), pw,
        el('div', { class: 'gm-row', style: 'margin-top:14px' }, [el('button', { class: 'pri', text: 'Sign in', onclick: go }), el('button', { text: 'Cancel', onclick: close })]), el('div', { class: 'gm-err', role: 'status' }));
      loginLayer.appendChild(card); loginLayer.hidden = false; setTimeout(() => user.focus(), 0);
    } else if (view === 'change') {
      const cur = el('input', { id: 'gm-cur', type: 'password', autocomplete: 'off' }), next = el('input', { id: 'gm-new', type: 'password', autocomplete: 'off' }), again = el('input', { id: 'gm-new2', type: 'password', autocomplete: 'off' });
      const go = () => { if (next.value !== again.value) return errBox().textContent = 'The new passwords do not match.'; send({ t: 'gmChangePassword', current: cur.value, next: next.value }); cur.value = next.value = again.value = ''; errBox().textContent = 'Saving…'; };
      card.append(el('h2', { id: 'gm-title', text: 'Choose your password' }), el('p', { class: 'gm-sub', text: 'Signed in as ' + state.account + '. The initial password must be replaced before you enter the game. At least 12 characters, not containing the account name.' }),
        el('label', { for: 'gm-cur', text: 'Current password' }), cur, el('label', { for: 'gm-new', text: 'New password' }), next, el('label', { for: 'gm-new2', text: 'Repeat new password' }), again,
        el('div', { class: 'gm-row', style: 'margin-top:14px' }, [el('button', { class: 'pri', text: 'Save password', onclick: go }), el('button', { text: 'Sign out', onclick: () => location.reload() })]), el('div', { class: 'gm-err', role: 'status' }));
      loginLayer.appendChild(card); loginLayer.hidden = false; setTimeout(() => cur.focus(), 0);
    } else if (view === 'enter') {
      card.append(el('h2', { id: 'gm-title', text: 'Welcome, ' + state.account }), el('p', { class: 'gm-sub', text: state.hasCharacter ? 'Your GM character is ready.' : 'Your GM character will be created with the class selected on the login screen.' }),
        el('div', { class: 'gm-row' }, [el('button', { class: 'pri', text: 'Enter as ' + state.account, onclick: () => send({ t: 'gmEnter', cls: typeof sel === 'string' ? sel : 'blade', mobDeltas: true, meDeltas: true, stateDeltas: true, listDeltas: true, mobFieldDeltas: true, uiDeltas: true }) }), el('button', { text: 'Sign out', onclick: () => location.reload() })]),
        el('div', { class: 'gm-err', role: 'status' }));
      loginLayer.appendChild(card); loginLayer.hidden = false;
    }
  }
  function close() { loginLayer.hidden = true; if (!state.account && ws && ws.readyState === 1 && !I) { ws.close(); } }
  function connect(user, pw) {
    if (typeof I !== 'undefined' && I) return;
    if (ws && ws.readyState !== WebSocket.CLOSED) { send({ t: 'gmLogin', user, pw }); return; }
    if (typeof uiReceiver !== 'undefined') uiReceiver.reset();
    const socket = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
    ws = socket;
    socket.onopen = () => socket.send(JSON.stringify({ t: 'gmLogin', user, pw }));
    socket.onmessage = e => { if (ws !== socket) return; onMsg(JSON.parse(e.data)); };
    socket.onclose = () => { if (ws !== socket) return; ws = null; state.account = null; if (I) log('*', 'Disconnected from server. Refresh to reconnect.'); else if (errBox()) errBox().textContent = 'Disconnected from the server.'; };
  }

  // ---------------- control panel ----------------
  const result = el('div', { class: 'gm-log', role: 'status', 'aria-live': 'polite' });
  const cmd = (op, args = {}, confirm) => {
    if (confirm) { state.pendingConfirm = { op, args, text: confirm }; renderPanel(); return; }
    send({ t: 'gm', op, args, confirm: !!state.confirmed }); state.confirmed = false; result.textContent = '…';
  };
  const field = (id, label, attrs = {}) => { const input = el(attrs.options ? 'select' : 'input', Object.assign({ id }, attrs.options ? {} : attrs)); if (attrs.options) for (const [v, t] of attrs.options) input.appendChild(el('option', { value: v, text: t })); return [el('label', { for: id, text: label }), input]; };
  const val = id => (document.getElementById(id) || {}).value;
  function group(title, kids) { return el('div', { class: 'gm-group' }, [el('h3', { text: title }), ...kids]); }
  function renderPanel() {
    const info = state.info || {}, card = el('div', { class: 'gm-card wide', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gm-ptitle' });
    const tabs = [['character', 'Character'], ['world', 'World'], ['combat', 'Combat'], ['items', 'Items'], ['vault', 'Saved GM Credentials'], ['account', 'Account']];
    card.append(el('div', { class: 'gm-row' }, [el('h2', { id: 'gm-ptitle', text: 'GM · ' + state.account, style: 'flex:1 1 auto' }), el('button', { text: 'Close (F10)', style: 'flex:0 0 auto', onclick: () => { panelLayer.hidden = true; } })]),
      el('div', { class: 'gm-tabs', role: 'tablist' }, tabs.map(([k, t]) => el('button', { role: 'tab', 'aria-pressed': String(state.tab === k), text: t, onclick: () => { state.tab = k; state.pendingConfirm = null; renderPanel(); } }))));
    const sec = el('div', { class: 'gm-sec' });
    if (state.pendingConfirm) {
      const c = state.pendingConfirm;
      sec.appendChild(el('div', { class: 'gm-confirm', role: 'alertdialog' }, [el('div', { text: c.text }), el('div', { class: 'gm-row' }, [el('button', { class: 'danger', text: 'Confirm', onclick: () => { state.pendingConfirm = null; state.confirmed = true; cmd(c.op, c.args); renderPanel(); } }), el('button', { text: 'Cancel', onclick: () => { state.pendingConfirm = null; renderPanel(); } })])]));
    }
    const players = (info.players || []).map(n => [n, n]), target = id => field(id, 'Player', { options: [['', 'Myself'], ...players.filter(([n]) => n !== state.account)] });
    if (state.tab === 'character') {
      sec.append(group('Gold', [el('div', { class: 'gm-row' }, [el('div', {}, target('gm-g-t')), el('div', {}, field('gm-g-n', 'Amount', { type: 'number', min: '1', value: '1000' }))]),
          el('div', { class: 'gm-row' }, [el('button', { text: 'Give gold', onclick: () => cmd('giveGold', { target: val('gm-g-t'), amount: +val('gm-g-n') }) }), el('button', { class: 'danger', text: 'Remove gold', onclick: () => cmd('removeGold', { target: val('gm-g-t'), amount: +val('gm-g-n') }, 'Remove ' + val('gm-g-n') + ' gold from ' + (val('gm-g-t') || state.account) + '?') })])]),
        group('Experience and level', [el('div', { class: 'gm-row' }, [el('div', {}, target('gm-x-t')), el('div', {}, field('gm-x-n', 'XP', { type: 'number', min: '1', value: '10000' })), el('div', {}, field('gm-l-n', 'Level', { type: 'number', min: '1', value: '30' }))]),
          el('div', { class: 'gm-row' }, [el('button', { text: 'Give XP', onclick: () => cmd('giveXp', { target: val('gm-x-t'), amount: +val('gm-x-n') }) }), el('button', { class: 'danger', text: 'Set level', onclick: () => cmd('setLevel', { target: val('gm-x-t'), level: +val('gm-l-n') }, 'Set ' + (val('gm-x-t') || state.account) + ' to level ' + val('gm-l-n') + '? Skill points are recalculated.') })])]),
        group('Health', [el('div', { class: 'gm-row' }, [el('div', {}, target('gm-h-t'))]), el('div', { class: 'gm-row' }, [el('button', { text: 'Heal', onclick: () => cmd('heal', { target: val('gm-h-t') }) }), el('button', { text: 'Restore health, mana and cooldowns', onclick: () => cmd('restore', { target: val('gm-h-t') }) })])]));
    } else if (state.tab === 'world') {
      const maps = (info.maps || []).map(m => [m.index, m.name + (m.biome && m.biome !== 'founding' ? ' (' + m.biome + ', Tier ' + m.tier + ')' : '')]);
      sec.append(group('Maps', [el('div', { class: 'gm-row' }, [el('div', {}, field('gm-map', 'Unlocked map or biome', { options: maps }))]),
          el('div', { class: 'gm-row' }, [el('button', { text: 'Travel to selected map', onclick: () => cmd('selectMap', { map: +val('gm-map') }, 'Travel to ' + ((info.maps || []).find(m => m.index === +val('gm-map')) || {}).name + '?') }), el('button', { text: 'Skip to next map', onclick: () => cmd('nextMap', {}, 'Skip to the next unlocked map?') })])]),
        ...(info.zones && info.zones.length ? [group('Founding zones', [el('div', { class: 'gm-row' }, [el('div', {}, field('gm-zone', 'Zone', { options: info.zones.map(z => [z.index, z.name]) }))]), el('button', { text: 'Teleport to zone', onclick: () => cmd('zone', { zone: +val('gm-zone') }) })])] : []),
        group('Teleport', [el('div', { class: 'gm-row' }, [el('div', {}, field('gm-tx', 'X (this map)', { type: 'number', min: '0', value: String(me ? Math.round(me.x || 0) : 0) })), el('div', {}, field('gm-ty', 'Y (this map)', { type: 'number', min: '0', value: String(me ? Math.round(me.y || 0) : 0) }))]),
          el('div', { class: 'gm-row' }, [el('button', { text: 'Teleport to location', onclick: () => cmd('teleport', { x: +val('gm-tx'), y: +val('gm-ty') }) }), el('button', { text: info.worldBoss ? 'Teleport to ' + info.worldBoss.name : 'Teleport to the World Boss', onclick: () => cmd('toWorldBoss') })])]));
    } else if (state.tab === 'combat') {
      sec.append(group('Enemies', [el('div', { class: 'gm-row' }, [el('button', { class: 'danger', text: 'Kill nearby enemies', onclick: () => cmd('killNearby', {}, 'Kill every enemy within 650 units? The World Boss is spared.') }), el('button', { class: 'danger', text: 'Kill all enemies on this map', onclick: () => cmd('killMap', {}, 'Kill every enemy on the current map? The World Boss is spared; other maps are not affected.') })]),
          el('div', { class: 'gm-row' }, [el('div', {}, field('gm-d-n', 'Damage to the selected enemy', { type: 'number', min: '1', value: '5000' })), el('button', { text: 'Damage selected enemy', onclick: () => cmd('damageTarget', { amount: +val('gm-d-n') }) })])]),
        group('Protection', [el('div', { class: 'gm-row' }, [el('button', { 'aria-pressed': String(!!state.flags.invincible), text: 'Invincibility: ' + (state.flags.invincible ? 'ON' : 'OFF'), onclick: () => cmd('invincible') }), el('button', { 'aria-pressed': String(!!state.flags.god), text: 'God mode: ' + (state.flags.god ? 'ON' : 'OFF'), onclick: () => cmd('god') })]),
          el('div', { class: 'gm-note', text: 'Invincibility blocks all damage. God mode also keeps health and mana full and skills off cooldown. Both end when you leave the game.' })]));
    } else if (state.tab === 'items') {
      const slots = [['any', 'Any slot'], ...((info.slots || []).map(s => [s, s[0].toUpperCase() + s.slice(1)]))];
      sec.append(group('Equipment', [el('div', { class: 'gm-row' }, [el('div', {}, field('gm-i-s', 'Item type', { options: slots })), el('div', {}, field('gm-i-r', 'Rarity', { options: RARITY.map((r, i) => [i, r]) })), el('div', {}, field('gm-i-l', 'Item level', { type: 'number', min: '1', value: String(me ? me.l || 1 : 1) })), el('div', {}, field('gm-i-c', 'Count (1-10)', { type: 'number', min: '1', max: '10', value: '1' }))]),
          el('button', { text: 'Spawn equipment', onclick: () => cmd('spawnGear', { slot: val('gm-i-s'), rarity: +val('gm-i-r'), ilvl: +val('gm-i-l'), count: +val('gm-i-c') }) })]),
        group('Consumables', [el('div', { class: 'gm-row' }, [el('div', {}, field('gm-c-k', 'Item', { options: (info.items || []).map(k => [k, (I && I.items && I.items[k] && I.items[k].n) || k]) })), el('div', {}, field('gm-c-n', 'Count', { type: 'number', min: '1', value: '10' }))]),
          el('button', { text: 'Spawn consumables', onclick: () => cmd('spawnItem', { item: val('gm-c-k'), count: +val('gm-c-n') }) })]));
    } else if (state.tab === 'vault') sec.appendChild(vaultSection());
    else if (state.tab === 'account') {
      const cur = el('input', { id: 'gm-acur', type: 'password', autocomplete: 'off' }), next = el('input', { id: 'gm-anew', type: 'password', autocomplete: 'off' });
      sec.append(group('Change password', [el('label', { for: 'gm-acur', text: 'Current password' }), cur, el('label', { for: 'gm-anew', text: 'New password (12+ characters)' }), next, el('button', { text: 'Change password', onclick: () => { send({ t: 'gmChangePassword', current: cur.value, next: next.value }); cur.value = next.value = ''; result.textContent = 'Saving…'; } })]),
        group('Session', [el('div', { class: 'gm-note', text: 'Signing out saves your GM character and ends GM permissions on the server.' }), el('button', { class: 'danger', text: 'Sign out', onclick: () => { send({ t: 'gmLogout' }); } })]));
    }
    card.append(sec, result); panelLayer.replaceChildren(card);
  }

  // ---------------- Saved GM Credentials (desktop vault) ----------------
  const vaultApi = () => (window.shardlandsVault && typeof window.shardlandsVault.status === 'function' ? window.shardlandsVault : null);
  const vaultView = { status: null, list: null, shown: {}, msg: '' };
  function vaultSection() {
    const box = el('div', { class: 'gm-sec' }), api = vaultApi();
    if (!api) {
      box.appendChild(group('Saved GM Credentials', [el('div', { class: 'gm-note' }, ['This needs the Shardlands desktop app, which keeps passwords in your operating system\'s credential store (Windows Credential Manager on Windows). A web browser cannot reach that store, and the game never keeps passwords in browser storage, so nothing can be saved here.']),
        el('div', { class: 'gm-note' }, ['On the server computer, new passwords can go straight into Windows Credential Manager: ', el('code', { text: 'node scripts/gm-provision.js --vault' }), '.'])]));
      return box;
    }
    if (!vaultView.status) { api.status().then(r => { vaultView.status = r.ok ? r.value : { ok: false, reason: r.error }; if (vaultView.status.ok) return api.list().then(l => { vaultView.list = l.ok ? l.value : {}; }); }).finally(renderPanel); box.appendChild(el('div', { class: 'gm-note', text: 'Opening the credential store…' })); return box; }
    if (!vaultView.status.ok) { box.appendChild(group('Saved GM Credentials', [el('div', { class: 'gm-note', text: 'Secure storage is not available: ' + vaultView.status.reason + ' Passwords are not stored anywhere else.' })])); return box; }
    const unlocked = Date.now() < state.revealUntil;
    if (!unlocked) { const pw = el('input', { id: 'gm-reauth', type: 'password', autocomplete: 'off' }); box.appendChild(group('Confirm it is you', [el('div', { class: 'gm-note', text: 'Enter your GM password to reveal saved passwords (unlocks for 2 minutes).' }), pw, el('button', { text: 'Unlock', onclick: () => { send({ t: 'gmReauth', pw: pw.value }); pw.value = ''; } })])); }
    const refresh = () => api.list().then(l => { vaultView.list = l.ok ? l.value : {}; renderPanel(); });
    const copy = (text, what) => navigator.clipboard.writeText(text).then(() => { vaultView.msg = what + ' copied.'; renderPanel(); }, () => { vaultView.msg = 'Copy failed.'; renderPanel(); });
    const rows = ACCOUNTS.map(account => {
      const saved = vaultView.list && vaultView.list[account], shown = vaultView.shown[account], input = el('input', { id: 'gm-v-' + account, type: 'password', autocomplete: 'off', placeholder: saved ? 'New password to update' : 'Password to save' });
      return el('div', { class: 'gm-group' }, [el('div', { class: 'gm-vault-row' }, [el('b', { text: account }), el('div', { class: 'gm-note', text: saved ? 'Saved in ' + vaultView.status.store : 'Not saved' })]),
        shown ? el('div', { class: 'gm-secret', text: shown }) : null,
        el('div', { class: 'gm-row' }, [el('button', { text: 'Copy name', onclick: () => copy(account, 'Name') }),
          saved ? el('button', { text: shown ? 'Hide' : 'Reveal', onclick: () => { if (shown) { delete vaultView.shown[account]; return renderPanel(); } if (Date.now() >= state.revealUntil) { vaultView.msg = 'Unlock with your password first.'; return renderPanel(); } api.reveal(account).then(r => { if (r.ok && r.value) vaultView.shown[account] = r.value; else vaultView.msg = r.error || 'Nothing saved.'; renderPanel(); }); } }) : null,
          saved ? el('button', { text: 'Copy password', onclick: () => { if (Date.now() >= state.revealUntil) { vaultView.msg = 'Unlock with your password first.'; return renderPanel(); } api.reveal(account).then(r => (r.ok && r.value ? copy(r.value, 'Password') : (vaultView.msg = r.error || 'Nothing saved.', renderPanel()))); } }) : null,
          saved ? el('button', { class: 'danger', text: 'Delete', onclick: () => { state.vaultDelete = account; renderPanel(); } }) : null]),
        state.vaultDelete === account ? el('div', { class: 'gm-confirm' }, [el('div', { text: 'Delete the saved password for ' + account + ' from this computer?' }), el('div', { class: 'gm-row' }, [el('button', { class: 'danger', text: 'Delete', onclick: () => { state.vaultDelete = null; delete vaultView.shown[account]; api.remove(account).then(refresh); } }), el('button', { text: 'Cancel', onclick: () => { state.vaultDelete = null; renderPanel(); } })])]) : null,
        el('div', { class: 'gm-row' }, [input, el('button', { text: saved ? 'Update' : 'Save', onclick: () => { const v = input.value; input.value = ''; if (!v) return; api.save(account, v).then(r => { vaultView.msg = r.ok ? 'Saved on this computer.' : r.error; refresh(); }); } })])]);
    });
    box.append(group('Saved GM Credentials', [el('div', { class: 'gm-note', text: 'Stored only on this computer in ' + vaultView.status.store + '. Saving a password here does not sign anyone in.' })]), ...rows, el('div', { class: 'gm-log', text: vaultView.msg }));
    return box;
  }

  // ---------------- server replies ----------------
  function onMessage(m) {
    if (m.t === 'gmAuth') {
      if (!m.ok) { if (errBox()) { errBox().textContent = m.error || 'Sign-in failed.'; errBox().className = 'gm-err'; } return; }
      state.account = m.account; state.mustChange = m.mustChange; state.hasCharacter = m.hasCharacter; showLogin(m.mustChange ? 'change' : 'enter');
    } else if (m.t === 'gmPassword') {
      if (!state.entered) { if (m.ok) { state.mustChange = false; showLogin('enter'); } else if (errBox()) errBox().textContent = m.error; }
      else { result.textContent = m.ok ? 'Password changed.' : m.error; }
    } else if (m.t === 'gmState') {
      state.entered = true; loginLayer.hidden = true; state.info = m; state.flags = m.flags || {}; if (!panelLayer.hidden) renderPanel();
    } else if (m.t === 'gmResult') { result.textContent = m.msg || ''; result.className = 'gm-log' + (m.ok ? ' gm-ok' : ''); }
    else if (m.t === 'gmReauth') { if (m.ok) { state.revealUntil = Date.now() + 120000; vaultView.msg = 'Unlocked for 2 minutes.'; setTimeout(() => { vaultView.shown = {}; if (!panelLayer.hidden) renderPanel(); }, 120000); } else vaultView.msg = m.error || 'Wrong password.'; if (!panelLayer.hidden) renderPanel(); }
    else if (m.t === 'gmLoggedOut') { state.account = null; vaultView.shown = {}; location.reload(); }
  }

  // ---------------- F10 ----------------
  addEventListener('keydown', e => {
    if (e.key !== 'F10' || e.shiftKey) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (typeof I !== 'undefined' && I) {
      if (!state.entered) return; // a normal character: F10 does nothing
      panelLayer.hidden = !panelLayer.hidden; if (!panelLayer.hidden) { state.pendingConfirm = null; renderPanel(); send({ t: 'gm', op: 'state' }); }
      return;
    }
    if (loginLayer.hidden) showLogin(state.account ? (state.mustChange ? 'change' : 'enter') : 'login'); else close();
  }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape' && !panelLayer.hidden) { panelLayer.hidden = true; e.stopImmediatePropagation(); } }, true);

  window.GM = Object.freeze({ onMessage, emblem, frameEnd, emblemSvg, isGmMessage: t => typeof t === 'string' && /^gm[A-Z]/.test(t) });
})();
