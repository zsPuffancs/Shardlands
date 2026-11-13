'use strict';
// Game Master sessions and commands.
//
// Authentication is separate from player login: its own message types (gmLogin, gmChangePassword, gmEnter,
// gmReauth, gmLogout, gm), its own credential store (gm-accounts.js) and its own rate limiter. Player login never
// consults the GM store and GM login never consults player saves, so neither accepts the other's credentials.
//
// The authenticated state lives only on the server's connection object (connection.gmAuth). It is never sent to
// the client as a token, never saved, and ends with the connection: closing the game, logging out or joining as a
// normal character revokes it. Every GM command re-checks that the connection is authenticated as the account that
// owns the character it is playing. GM characters are saved under "gm:<account>" keys that player names cannot
// reach (player names cannot contain ':').
const fs = require('node:fs');
const path = require('node:path');
const { GM_ACCOUNTS, canonical, createLoginLimiter } = require('./gm-accounts');
const { mapOf, maps, clampWorld } = require('../world/game-world');
const { TIERS, MOBTYPES } = require('../combat/monsters');
const { ITEMS } = require('./characters');
const { SLOTS } = require('../economy/equipment');
const { MAX_CURRENCY } = require('../shared/safety-limits');

const GM_KEY = account => 'gm:' + account.toLowerCase();
const NEARBY_RADIUS = 650;
const int = (v, lo, hi) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };

function createGmService({ directory, store, limiter = createLoginLimiter(), players, mobs, saves, sendInv, send, api, regions, hitMob, enterCharacter, leavePlayer, now = () => Date.now(), log = line => console.log(line) }) {
  const auditFile = path.join(directory, 'gm-audit.log');
  // Important GM actions: account, action, target, time. Never passwords or tokens.
  function audit(connection, action, detail = {}) {
    const entry = { at: new Date(now()).toISOString(), account: connection.gmAuth?.account || detail.account || null, action, ...detail, ip: connection.ip || null };
    delete entry.pw; delete entry.password; delete entry.current; delete entry.next;
    try { fs.appendFileSync(auditFile, JSON.stringify(entry) + '\n'); } catch (error) { log('[gm] audit log unavailable: ' + error.message); }
    log('[gm] ' + entry.account + ' ' + action + (detail.target ? ' -> ' + detail.target : ''));
  }
  const reply = (connection, message) => send(connection, message);
  const pending = new WeakSet();
  const limiterKeys = (connection, account) => ['account:' + String(account || '').toLowerCase().slice(0, 32), 'address:' + (connection.ip || 'unknown')];
  const onlineAs = account => [...players.values()].find(player => player.gm === account);

  async function login(connection, message) {
    if (connection.p || pending.has(connection)) return;
    const user = String(message.user || '').slice(0, 32), keys = limiterKeys(connection, user), wait = limiter.wait(keys);
    if (wait > 0) return reply(connection, { t: 'gmAuth', ok: false, error: 'Too many attempts. Try again in ' + Math.ceil(wait / 1000) + ' s.' });
    pending.add(connection);
    try {
      const result = await store.verify(user, typeof message.pw === 'string' ? message.pw : '');
      if (connection.closed) return;
      if (!result.ok) { limiter.fail(keys); audit(connection, 'login-failed', { account: canonical(user) || '(unknown)' }); return reply(connection, { t: 'gmAuth', ok: false, error: 'Wrong GM name or password.' }); }
      limiter.succeed(keys);
      if (onlineAs(result.account)) return reply(connection, { t: 'gmAuth', ok: false, error: 'This GM account is already in the game.' });
      connection.gmAuth = { account: result.account, mustChange: result.mustChange, since: now() };
      audit(connection, 'login');
      reply(connection, { t: 'gmAuth', ok: true, account: result.account, mustChange: result.mustChange, hasCharacter: !!saves[GM_KEY(result.account)] });
    } catch (error) { log('[gm] login error: ' + error.message); reply(connection, { t: 'gmAuth', ok: false, error: 'GM login is unavailable.' }); }
    finally { pending.delete(connection); }
  }

  async function changePassword(connection, message) {
    const auth = connection.gmAuth; if (!auth || pending.has(connection)) return;
    const keys = limiterKeys(connection, auth.account), wait = limiter.wait(keys);
    if (wait > 0) return reply(connection, { t: 'gmPassword', ok: false, error: 'Too many attempts. Try again in ' + Math.ceil(wait / 1000) + ' s.' });
    pending.add(connection);
    try {
      const result = await store.changePassword(auth.account, String(message.current || ''), String(message.next || ''));
      if (!result.ok) { if (result.error === 'The current password is wrong.') limiter.fail(keys); return reply(connection, { t: 'gmPassword', ok: false, error: result.error }); }
      auth.mustChange = false; audit(connection, 'password-changed');
      reply(connection, { t: 'gmPassword', ok: true });
    } finally { pending.delete(connection); }
  }

  function enter(connection, message) {
    const auth = connection.gmAuth;
    if (!auth || connection.p) return;
    if (auth.mustChange) return reply(connection, { t: 'gmAuth', ok: false, error: 'Change the initial password first.' });
    if (onlineAs(auth.account)) return reply(connection, { t: 'gmAuth', ok: false, error: 'This GM account is already in the game.' });
    enterCharacter(connection, message, { account: auth.account, key: GM_KEY(auth.account), index: GM_ACCOUNTS.indexOf(auth.account) + 1 });
    if (connection.p) { connection.p.gmFlags = { invincible: false, god: false }; audit(connection, 'enter'); sendState(connection.p); }
  }

  async function reauth(connection, message) {
    const auth = connection.gmAuth; if (!auth || !connection.p || pending.has(connection)) return;
    const keys = limiterKeys(connection, auth.account), wait = limiter.wait(keys);
    if (wait > 0) return reply(connection, { t: 'gmReauth', ok: false, error: 'Too many attempts. Try again in ' + Math.ceil(wait / 1000) + ' s.' });
    pending.add(connection);
    try {
      const result = await store.verify(auth.account, typeof message.pw === 'string' ? message.pw : '');
      if (!result.ok) limiter.fail(keys); else limiter.succeed(keys);
      audit(connection, result.ok ? 'reauth' : 'reauth-failed');
      reply(connection, { t: 'gmReauth', ok: result.ok, ...(result.ok ? {} : { error: 'Wrong password.' }) });
    } finally { pending.delete(connection); }
  }

  function logout(connection) {
    if (!connection.gmAuth) return;
    audit(connection, 'logout');
    if (connection.p) leavePlayer(connection);
    connection.gmAuth = null;
    reply(connection, { t: 'gmLoggedOut' });
  }
  // a normal join on this connection ends any GM authentication first
  function revoke(connection) { if (connection.gmAuth) { audit(connection, 'revoked-by-player-login'); connection.gmAuth = null; } }

  // ---------------- commands ----------------
  const isGmPlayer = (connection) => !!(connection.gmAuth && connection.p && connection.p.gm === connection.gmAuth.account && !connection.gmAuth.mustChange);
  const targetPlayer = (gm, name) => (name ? [...players.values()].find(p => p.name.toLowerCase() === String(name).toLowerCase()) : gm);
  const liveMobsOn = map => [...mobs.values()].filter(m => !m.dead && m.hp > 0 && mapOf(m) === map);
  // a kill through the normal combat path, so rewards, bosses and spawns behave as for any kill
  const kill = (gm, monster) => { hitMob(gm, monster, Math.min(Number.MAX_SAFE_INTEGER / 4, monster.hp * 4 + 1e6)); return monster.hp <= 0 || monster.dead ? 1 : 0; };
  function sendState(gm) {
    const map = mapOf(gm), boss = liveMobsOn(map).find(m => m.worldBoss);
    send(gm.c, { t: 'gmState', account: gm.gm, flags: gm.gmFlags, maps: regions.travelableMaps(), map: map.index, zones: map.index === 0 ? TIERS.filter(t => !t.generated).map((t, i) => ({ index: i, name: t.name })) : [],
      worldBoss: boss ? { name: MOBTYPES[boss.ty]?.name || boss.ty } : null, slots: SLOTS, items: Object.keys(ITEMS), players: [...players.values()].map(p => p.name) });
  }

  const COMMANDS = {
    // Character
    giveGold(gm, a) { const t = targetPlayer(gm, a.target), n = int(a.amount, 1, MAX_CURRENCY); if (!t || n === null) return 'Enter a player and an amount.'; api.giveGold(t, n); return { msg: 'Gave ' + n + ' gold to ' + t.name + '.', target: t.name, amount: n }; },
    removeGold(gm, a) { const t = targetPlayer(gm, a.target), n = int(a.amount, 1, MAX_CURRENCY); if (!t || n === null) return 'Enter a player and an amount.'; const taken = Math.min(t.gold, n); t.gold -= taken; sendInv(t); return { msg: 'Removed ' + taken + ' gold from ' + t.name + '.', target: t.name, amount: taken }; },
    giveXp(gm, a) { const t = targetPlayer(gm, a.target), n = int(a.amount, 1, 1e12); if (!t || n === null) return 'Enter a player and an amount.'; api.giveXp(t, n); return { msg: 'Gave ' + n + ' XP to ' + t.name + '.', target: t.name, amount: n }; },
    setLevel(gm, a) { const t = targetPlayer(gm, a.target), n = int(a.level, 1, api.consts.MAX_LEVEL); if (!t || n === null) return 'Level must be 1-' + api.consts.MAX_LEVEL + '.'; api.setLevel(t, n); return { msg: t.name + ' is now level ' + t.lvl + '.', target: t.name, level: t.lvl }; },
    heal(gm, a) { const t = targetPlayer(gm, a.target); if (!t) return 'No such player online.'; if (t.dead) return t.name + ' is dead.'; t.hp = t.maxhp; return { msg: 'Healed ' + t.name + '.', target: t.name }; },
    restore(gm, a) { const t = targetPlayer(gm, a.target); if (!t) return 'No such player online.'; if (t.dead) return t.name + ' is dead.'; t.hp = t.maxhp; t.mp = t.maxmp; t.cd = t.cd1 = t.cd2 = t.cd3 = t.potCd = 0; return { msg: 'Restored health, mana and cooldowns of ' + t.name + '.', target: t.name }; },
    // World
    nextMap(gm) { const list = regions.travelableMaps(), here = mapOf(gm).index, next = list.find(m => m.index > here) || list[0]; if (!next || next.index === here) return 'No other unlocked map.'; return regions.gmTravel(gm, next.index) ? { msg: 'Travelled to ' + next.name + '.', target: next.name } : 'Cannot travel now.'; },
    selectMap(gm, a) { const index = int(a.map, 0, maps.length - 1), entry = regions.travelableMaps().find(m => m.index === index); if (!entry) return 'That map is not unlocked.'; if (index === mapOf(gm).index) return 'You are already there.'; return regions.gmTravel(gm, index) ? { msg: 'Travelled to ' + entry.name + '.', target: entry.name } : 'Cannot travel now.'; },
    zone(gm, a) { if (mapOf(gm).index !== 0) return 'Zones are in the Founding Lands.'; const zones = TIERS.filter(t => !t.generated), T = zones[int(a.zone, 0, zones.length - 1)]; if (!T) return 'Unknown zone.'; const d = T.outer ? T.min + 250 : (T.min + T.max) / 2; api.teleport(gm, api.consts.CX, api.consts.CY - d); return { msg: 'Teleported to ' + T.name + '.', target: T.name }; },
    teleport(gm, a) { const map = mapOf(gm), x = Number(a.x), y = Number(a.y); if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > map.w || y > map.h) return 'Coordinates must be inside this map (0-' + map.w + ').'; api.teleport(gm, x, y); return { msg: 'Teleported to ' + Math.round(x) + ', ' + Math.round(y) + '.', target: Math.round(x) + ',' + Math.round(y) }; },
    toWorldBoss(gm) { const boss = liveMobsOn(mapOf(gm)).find(m => m.worldBoss); if (!boss) return 'The World Boss of this map is not up.'; gm.x = boss.x + boss.r + 120; gm.y = boss.y; clampWorld(gm, mapOf(gm)); gm.dest = null; gm.target = 0; gm.chasingTarget = false; return { msg: 'Teleported to ' + (MOBTYPES[boss.ty]?.name || 'the World Boss') + '.', target: boss.ty }; },
    // Combat
    killNearby(gm) { const list = liveMobsOn(mapOf(gm)).filter(m => !m.worldBoss && Math.hypot(m.x - gm.x, m.y - gm.y) <= NEARBY_RADIUS); let n = 0; for (const m of list) n += kill(gm, m); return { msg: 'Killed ' + n + ' nearby enemies.', count: n }; },
    killMap(gm) { const list = liveMobsOn(mapOf(gm)).filter(m => !m.worldBoss); let n = 0; for (const m of list) n += kill(gm, m); return { msg: 'Killed ' + n + ' enemies on this map (the World Boss is spared).', count: n }; },
    damageTarget(gm, a) { const m = mobs.get(gm.target), n = int(a.amount, 1, 1e15); if (!m || m.dead || mapOf(m) !== mapOf(gm)) return 'Select an enemy first.'; if (n === null) return 'Enter an amount.'; const before = m.hp; hitMob(gm, m, n); return { msg: 'Hit ' + (MOBTYPES[m.ty]?.name || m.ty) + ' for ' + Math.max(0, Math.round(before - Math.max(0, m.hp))) + '.', target: m.ty }; },
    invincible(gm) { gm.gmFlags.invincible = !gm.gmFlags.invincible; return { msg: 'Invincibility ' + (gm.gmFlags.invincible ? 'on' : 'off') + '.', state: gm.gmFlags.invincible }; },
    god(gm) { gm.gmFlags.god = !gm.gmFlags.god; return { msg: 'God mode ' + (gm.gmFlags.god ? 'on: no damage, full health and mana, no cooldowns' : 'off') + '.', state: gm.gmFlags.god }; },
    // Items
    spawnGear(gm, a) { const slot = a.slot === 'any' ? undefined : SLOTS.includes(a.slot) ? a.slot : null, ilvl = int(a.ilvl, 1, api.consts.MAX_LEVEL), rarity = int(a.rarity, 0, 4), count = int(a.count, 1, 10);
      if (slot === null || ilvl === null || rarity === null || count === null) return 'Choose a slot, item level, rarity and count (1-10).';
      let made = 0; for (let i = 0; i < count; i++) if (api.giveGear(gm, api.genGear(slot, ilvl, rarity))) made++; return made ? { msg: 'Created ' + made + ' item(s).', count: made, slot: slot || 'any', rarity } : 'Bag is full.'; },
    spawnItem(gm, a) { const key = String(a.item || ''), count = int(a.count, 1, 999); if (!Object.hasOwn(ITEMS, key) || count === null) return 'Choose an item and a count (1-999).'; const before = gm.inv[key] || 0; api.giveItem(gm, key, count); return { msg: 'Gave ' + ((gm.inv[key] || 0) - before) + ' x ' + ITEMS[key].n + '.', item: key }; },
    state(gm) { return { msg: '', quiet: true }; },
  };
  const DESTRUCTIVE = new Set(['removeGold', 'setLevel', 'killNearby', 'killMap', 'nextMap', 'selectMap']);

  function command(connection, message) {
    if (!isGmPlayer(connection)) { if (connection.p) audit(connection, 'denied', { account: connection.p.name, op: String(message.op || '').slice(0, 24) }); return; }
    const gm = connection.p, op = String(message.op || ''), fn = Object.hasOwn(COMMANDS, op) ? COMMANDS[op] : null;
    if (!fn) return reply(connection, { t: 'gmResult', op, ok: false, msg: 'Unknown GM command.' });
    if (DESTRUCTIVE.has(op) && message.confirm !== true) return reply(connection, { t: 'gmResult', op, ok: false, msg: 'This command needs confirmation.' });
    let result;
    try { result = fn(gm, message.args && typeof message.args === 'object' ? message.args : {}); } catch (error) { result = 'Command failed: ' + error.message; }
    const ok = typeof result === 'object';
    if (ok && !result.quiet) { const { msg, quiet, ...detail } = result; audit(connection, op, detail); }
    reply(connection, { t: 'gmResult', op, ok, msg: ok ? result.msg : result });
    sendState(gm);
  }

  // server-side protection: no damage with invincibility or god mode; god mode keeps health, mana and cooldowns topped up
  const hurt = (player, monster, hit) => { if (player.gm && player.gmFlags && (player.gmFlags.invincible || player.gmFlags.god)) hit.v = 0; };
  const godTick = () => { for (const p of players.values()) if (p.gm && p.gmFlags && p.gmFlags.god && !p.dead) { p.hp = p.maxhp; p.mp = p.maxmp; p.cd = p.cd1 = p.cd2 = p.cd3 = 0; } };

  const handlers = { gmLogin: login, gmChangePassword: changePassword, gmEnter: enter, gmReauth: reauth, gmLogout: logout, gm: command };
  return { handlers, revoke, hurt, godTick, audit, COMMANDS, DESTRUCTIVE, GM_KEY };
}

module.exports = { createGmService, GM_KEY };
