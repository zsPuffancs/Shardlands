// Admin commands. Add your hero name to "admins" in config.json to use them.
module.exports = { name: 'admin', version: '1.0', init(api) {
  const A = { admin: true };
  const num = (v, d) => (v === undefined || isNaN(+v) ? d : +v);
  const target = (p, n) => (n ? api.findPlayer(n) : p);
  api.command('give', A, (p, a) => { const k = a[0], n = num(a[1], 1); if (!api.ITEMS[k]) return api.message("admin.unknownItem", "Unknown item. Ids: {ids}", { ids: Object.keys(api.ITEMS).join(', ') }); const previous = p.inv[k] || 0; api.giveItem(p, k, n); const added = (p.inv[k] || 0) - previous; return api.message("admin.gave", "Gave {count} x {item}", { count: added, item: api.message('item.' + k + '.name', api.ITEMS[k].n) }); });
  api.command('gear', A, (p, a) => { // /gear <slot|any> <ilvl> <rarity 0-4>
    const it = api.genGear(a[0] === 'any' ? undefined : a[0], num(a[1], p.lvl), a[2] === undefined ? undefined : num(a[2], 0));
    return api.giveGear(p, it) ? api.message("admin.created", "Created {item}", { item: api.gearName(it.name) }) : api.message("admin.bagFull", "Bag is full."); });
  api.command('drop', A, (p, a) => { // /drop <slot|any> <ilvl> <rarity 0-4> [count] - drops gear on the ground next to you
    const n = Math.min(10, num(a[3], 1)); for (let i = 0; i < n; i++) { const it = api.genGear(a[0] === 'any' ? undefined : a[0], num(a[1], p.lvl), a[2] === undefined ? undefined : num(a[2], 0));
      api.dropAt(p.x + 50 + i * 28, p.y + (i % 2 ? 30 : -30), { kind: 'gear', item: it, name: it.name, rar: it.rar }, p.id); } return api.message("admin.dropped", "Dropped {count} item(s).", { count: n }); });
  api.command('gold', A, (p, a) => { api.giveGold(p, num(a[0], 1000)); return api.message("admin.gold", "Gold: {gold}", { gold: p.gold }); });
  api.command('souls', A, (p, a) => { api.giveSouls(p, num(a[0], 50)); return api.message("admin.souls", "Souls: {souls}", { souls: p.souls }); });
  api.command('level', A, (p, a) => { api.setLevel(p, num(a[0], p.lvl + 1)); return api.message("admin.level", "You are level {level}", { level: p.lvl }); });
  api.command('heal', A, (p, a) => { const t = target(p, a[0]); if (!t) return api.message("admin.noPlayer", "No such player."); api.heal(t); });
  api.command('tp', A, (p, a) => { if (isNaN(+a[0])) { const t = api.findPlayer(a[0]); if (!t) return api.message("admin.noPlayer", "No such player."); api.teleportTo(p, t); return api.message("admin.teleported", "Teleported."); } api.teleport(p, num(a[0], api.consts.CX), num(a[1], api.consts.CY)); return api.message("admin.teleported", "Teleported."); });
  api.command('home', {}, p => { api.toVillage(p); return api.message("admin.home", "Welcome home."); });
  api.command('spawn', A, (player, [type, countText = '1', levelText]) => {
    if (!Object.hasOwn(api.MOBTYPES, type)) return api.message("admin.unknownMob", "Unknown mob. Ids: {ids}", { ids: Object.keys(api.MOBTYPES).join(', ') });
    const count = Number(countText), level = levelText === undefined ? undefined : Number(levelText);
    if (!Number.isInteger(count) || count < 1 || count > 20 ||
        (level !== undefined && (!Number.isInteger(level) || level < 1 || level > api.consts.MAX_LEVEL))) {
      return api.message("admin.spawnUsage", "Usage: /spawn <type> [count: 1-20] [level: 1-{max}]", { max: api.consts.MAX_LEVEL });
    }
    for (let i = 0; i < count; i++) {
      api.spawn(type, player.x + 60 + Math.random() * 60, player.y + Math.random() * 80 - 40, { temp: true, level });
    }
    return api.message("admin.spawned", "Spawned {count} {type}{level}.", { count, type, level: level === undefined ? '' : api.message('admin.spawnLevel', ' at level {level}', { level }) });
  });
  api.command('announce', A, (p, a) => { api.broadcast(api.message("admin.announcement", "[Announcement] {message}", { message: a.join(' ') })); });
  api.command('kick', A, (p, a) => { const t = api.findPlayer(a[0]); if (!t) return api.message("admin.noPlayer", "No such player."); api.kick(t); return api.message("admin.kicked", "Kicked {player}", { player: t.name }); });
  api.command('xprate', A, (p, a) => { api.rates.xpRate = num(a[0], 1.5); return api.message("admin.xpRate", "XP rate x{rate} (until restart - edit rates.json to keep it)", { rate: api.rates.xpRate }); });
  api.command('droprate', A, (p, a) => { api.rates.gearDropRate = num(a[0], 1); return api.message("admin.dropRate", "Gear drop rate x{rate} (until restart - edit rates.json to keep it)", { rate: api.rates.gearDropRate }); });
  api.command('rate', A, (p, a) => { if (!a[0] || !(a[0] in api.rates)) return api.message("admin.rates", "Rates: {rates}", { rates: Object.entries(api.rates).map(([k, v]) => k + '=' + v).join(', ') }); api.rates[a[0]] = num(a[1], api.rates[a[0]]); return a[0] + ' = ' + api.rates[a[0]]; });
  api.command('stats', A, () => { const s = api.stats(); return api.message("admin.stats", "Players {players} · monsters {mobs} ({awake} awake) · loot {loot} · server tick {tickMs} ms (p95 {tickP95}, max {tickMax}, budget 50) · TX {bytesPerSecond} B/s · max/player {peakPlayerBytesPerSecond} B/s · slow disconnects {backpressureDisconnects}", s); });
  api.command('zone', A, (p, a) => { const T = api.TIERS[num(a[0], 0)]; if (!T) return api.message("admin.zones", "Zones 0-{last}", { last: api.TIERS.length - 1 }); const d = T.outer ? T.min + 250 : (T.min + T.max) / 2; api.teleport(p, api.consts.CX, api.consts.CY - d); return api.message("admin.teleportedZone", "Teleported to {zone}", { zone: api.zoneName(T.name) }); });
  api.command('god', A, p => { p.data.god = !p.data.god; return api.message("admin.god", "God mode {state}", { state: p.data.god ? api.message('admin.godOn', 'ON - monsters cannot hurt you') : api.message('admin.godOff', 'OFF') }); });
  api.on('hurt', (p, m, o) => { if (p.data.god) o.v = 0; });
  api.command('players', {}, () => api.message("admin.online", "Online: {players}", { players: api.players().map(p => p.name + ' (Lv' + p.lvl + ')').join(', ') }));
} };
