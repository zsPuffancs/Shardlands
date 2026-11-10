// Admin commands. Add your hero name to "admins" in config.json to use them.
module.exports = { name: 'admin', version: '1.0', init(api) {
  const A = { admin: true };
  const num = (v, d) => (v === undefined || isNaN(+v) ? d : +v);
  const target = (p, n) => (n ? api.findPlayer(n) : p);
  api.command('give', A, (p, a) => { const k = a[0], n = num(a[1], 1); if (!api.ITEMS[k]) return 'Unknown item. Ids: ' + Object.keys(api.ITEMS).join(', '); api.giveItem(p, k, n); return 'Gave ' + n + ' x ' + api.ITEMS[k].n; });
  api.command('gear', A, (p, a) => { // /gear <slot|any> <ilvl> <rarity 0-4>
    const it = api.genGear(a[0] === 'any' ? undefined : a[0], num(a[1], p.lvl), a[2] === undefined ? undefined : num(a[2], 0));
    return api.giveGear(p, it) ? 'Created ' + it.name : 'Bag is full.'; });
  api.command('drop', A, (p, a) => { // /drop <slot|any> <ilvl> <rarity 0-4> [count] - drops gear on the ground next to you
    const n = Math.min(10, num(a[3], 1)); for (let i = 0; i < n; i++) { const it = api.genGear(a[0] === 'any' ? undefined : a[0], num(a[1], p.lvl), a[2] === undefined ? undefined : num(a[2], 0));
      api.dropAt(p.x + 50 + i * 28, p.y + (i % 2 ? 30 : -30), { kind: 'gear', item: it, name: it.name, rar: it.rar }, p.id); } return 'Dropped ' + n + ' item(s).'; });
  api.command('gold', A, (p, a) => { api.giveGold(p, num(a[0], 1000)); return 'Gold: ' + p.gold; });
  api.command('level', A, (p, a) => { api.setLevel(p, num(a[0], p.lvl + 1)); return 'You are level ' + p.lvl; });
  api.command('heal', A, (p, a) => { const t = target(p, a[0]); if (!t) return 'No such player.'; api.heal(t); });
  api.command('tp', A, (p, a) => { if (isNaN(+a[0])) { const t = api.findPlayer(a[0]); if (!t) return 'No such player.'; api.teleport(p, t.x, t.y); return 'Teleported.'; } api.teleport(p, num(a[0], api.consts.CX), num(a[1], api.consts.CY)); return 'Teleported.'; });
  api.command('home', {}, p => { api.teleport(p, api.consts.CX, api.consts.CY); return 'Welcome home.'; });
  api.command('spawn', A, (p, a) => { const k = a[0], n = Math.min(20, num(a[1], 1)); if (!api.MOBTYPES[k]) return 'Unknown mob. Ids: ' + Object.keys(api.MOBTYPES).join(', '); for (let i = 0; i < n; i++) api.spawn(k, p.x + 60 + Math.random() * 60, p.y + Math.random() * 80 - 40, { temp: true }); return 'Spawned ' + n + ' ' + k; });
  api.command('announce', A, (p, a) => { api.broadcast('[Announcement] ' + a.join(' ')); });
  api.command('kick', A, (p, a) => { const t = api.findPlayer(a[0]); if (!t) return 'No such player.'; api.kick(t); return 'Kicked ' + t.name; });
  api.command('xprate', A, (p, a) => { api.rates.xpRate = num(a[0], 1.5); return 'XP rate x' + api.rates.xpRate + ' (until restart - edit rates.json to keep it)'; });
  api.command('droprate', A, (p, a) => { api.rates.gearDropRate = num(a[0], 1); return 'Gear drop rate x' + api.rates.gearDropRate + ' (until restart - edit rates.json to keep it)'; });
  api.command('rate', A, (p, a) => { if (!a[0] || !(a[0] in api.rates)) return 'Rates: ' + Object.entries(api.rates).map(([k, v]) => k + '=' + v).join(', '); api.rates[a[0]] = num(a[1], api.rates[a[0]]); return a[0] + ' = ' + api.rates[a[0]]; });
  api.command('stats', A, () => { const s = api.stats(); return 'Players ' + s.players + ' · monsters ' + s.mobs + ' (' + s.awake + ' awake) · loot ' + s.loot + ' · server tick ' + s.tickMs + ' ms (budget 50)'; });
  api.command('zone', A, (p, a) => { const T = api.TIERS[num(a[0], 0)]; if (!T) return 'Zones 0-' + (api.TIERS.length - 1); const d = T.outer ? T.min + 250 : (T.min + T.max) / 2; api.teleport(p, api.consts.CX, api.consts.CY - d); return 'Teleported to ' + T.name; });
  api.command('god', A, p => { p.data.god = !p.data.god; return 'God mode ' + (p.data.god ? 'ON - monsters cannot hurt you' : 'OFF'); });
  api.on('hurt', (p, m, o) => { if (p.data.god) o.v = 0; });
  api.command('players', {}, () => 'Online: ' + api.players().map(p => p.name + ' (Lv' + p.lvl + ')').join(', '));
} };
