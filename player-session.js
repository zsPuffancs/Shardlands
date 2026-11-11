'use strict';

const { localizedText: messageText, isLocalizedText } = require('./localized-text');

const crypto = require('node:crypto');
const { commandAllowed } = require('./safety-limits');
const { CX, CY, rnd, worldInfo, clampWorld, maps, mapOf } = require('./game-world');
const { MOBTYPES } = require('./monsters');
const { mobTypesForClient } = require('./snapshots');
const { CLASSES, ITEMS, MAXRANK, PMAX, PASSIVE_EFFECT, newSk, stats } = require('./characters');
const { SLOTS, STATDEF, UP_RATE, RARITY, AFFIXES, AFFIX_SLOTS, AFFIX_COST, MYTHIC_MERGE_COUNT, MYTHIC_MERGE_GOLD, sanitize } = require('./equipment');
const { BAGMAX, BAG_PAGE_SIZE } = require('./inventory');

function createPlayerSessions({ config, players, mobs, saves, allocateId, refreshMobTypes, universe, regions, teams, send, say, broadcast, fire, commands, skill, learnSkill, inventory, savePlayer, resyncUi }) {
  const isAdminName = name => config.admins.some(a => String(a).toLowerCase() === name.toLowerCase());
  const isAdmin = player => Boolean(player.ph && isAdminName(player.name));
  const clamp1 = v => Math.max(-1, Math.min(1, +v || 0));

  function joinPlayer(connection, message) {
    if (connection.p) return;
    const name = String(message.name || '').replace(/[^\w \-]/g, '').trim().slice(0, 14);
    if (name.length < 2) return send(connection, { t: 'err', m: messageText("server.nameLength", "Name must be 2-14 letters/digits.") });
    for (const onlinePlayer of players.values()) if (onlinePlayer.name.toLowerCase() === name.toLowerCase()) return send(connection, { t: 'err', m: messageText("server.alreadyOnline", "That hero is already online.") });
    const savedPlayer = saves[name.toLowerCase()];
    if (isAdminName(name) && !savedPlayer?.ph) {
      return send(connection, { t: 'err', m: messageText("server.adminPassword", "Admin hero must have a password set before granting admin access.") });
    }
    const password = String(message.pw || '').slice(0, 64);
    const passwordHash = password ? crypto.createHash('sha256').update(name.toLowerCase() + ':' + password).digest('hex') : '';
    if (savedPlayer && savedPlayer.ph && savedPlayer.ph !== passwordHash) return send(connection, { t: 'err', m: messageText("server.badPassword", "Wrong password for this hero.") });
    if (savedPlayer && !savedPlayer.ph && passwordHash) {
      return send(connection, { t: 'err', m: messageText('server.guestPassword', 'This guest hero was created without a password. Leave the password blank to play it.') });
    }
    const classId = savedPlayer ? savedPlayer.cls : (typeof message.cls === 'string' && Object.hasOwn(CLASSES, message.cls) ? message.cls : 'blade');
    const level = savedPlayer ? savedPlayer.lvl : 1;
    const startingInventory = Object.assign(Object.fromEntries(Object.keys(ITEMS).map(k => [k, 0])), savedPlayer ? (savedPlayer.inv || { hp: savedPlayer.pots || 0 }) : { hp: 3, mp: 1 });
    const player = { id: allocateId(), c: connection, name: savedPlayer ? savedPlayer.name : name, cls: classId, lvl: level, xp: savedPlayer ? savedPlayer.xp : 0, gold: savedPlayer ? (Number.isFinite(savedPlayer.gold) ? Math.max(0, savedPlayer.gold) : 0) : 100, souls: savedPlayer && Number.isFinite(savedPlayer.souls) ? savedPlayer.souls : 0, w: 0, inv: startingInventory, bag: (savedPlayer && Array.isArray(savedPlayer.bag) ? savedPlayer.bag.filter(it => it && typeof it === 'object').map(sanitize) : []), eq: Object.assign({ weapon: null, helm: null, armor: null, boots: null, ring: null, amulet: null }, savedPlayer && savedPlayer.eq),
      sk: Object.assign(newSk(), savedPlayer && savedPlayer.sk), sp: savedPlayer ? (savedPlayer.sp !== undefined ? savedPlayer.sp : level) : 1, buf: { atk: 0, def: 0, spd: 0, xp: 0, rage: 0 }, potCd: 0, g: {},
      ph: passwordHash, data: (savedPlayer && savedPlayer.data) || {},
      x: CX + rnd(-50, 50), y: CY + rnd(30, 95), dir: { x: 0, y: 0 }, dest: null, target: 0, chasingTarget: false, cd: 0, cd1: 0, cd2: 0, cd3: 0, dead: 0 };
    for (const slot of SLOTS) sanitize(player.eq[slot]);
    for (const item of player.bag || []) sanitize(item);
    if (!player.eq.weapon) player.eq.weapon = inventory.starterWeapon(player, savedPlayer && savedPlayer.w);
    stats(player);
    player.hp = player.maxhp;
    player.mp = player.maxmp;
    if (savedPlayer) {
      const now = Date.now();
      const expiresAt = value => Number.isFinite(value) && value > now ? value : 0;
      for (const key of ['cd', 'cd1', 'cd2', 'cd3', 'potCd']) player[key] = expiresAt(savedPlayer[key]);
      for (const key of Object.keys(player.buf)) player.buf[key] = expiresAt(savedPlayer.buf?.[key]);
      player.dead = expiresAt(savedPlayer.dead);
      if (!savedPlayer.dead || player.dead) {
        if (Number.isFinite(savedPlayer.x) && Number.isFinite(savedPlayer.y)) {
          // Saved positions are local to their map. A map that no longer exists sends the hero home.
          const map = maps[savedPlayer.map || 0];
          if (map) { player.x = map.x0 + savedPlayer.x; player.y = map.y0 + savedPlayer.y; }
          clampWorld(player, map);
        }
        if (Number.isFinite(savedPlayer.hp)) player.hp = Math.max(0, Math.min(player.maxhp, savedPlayer.hp));
        if (Number.isFinite(savedPlayer.mp)) player.mp = Math.max(0, Math.min(player.maxmp, savedPlayer.mp));
      }
    }
    connection.p = player;
    connection.mapIndex = mapOf(player).index;
    connection.mobDeltas = message.mobDeltas === true;
    connection.meDeltas = message.meDeltas === true;
    connection.stateDeltas = message.stateDeltas === true;
    connection.listDeltas = message.listDeltas === true;
    connection.mobFieldDeltas = message.mobFieldDeltas === true;
    connection.uiDeltas = message.uiDeltas === true;
    players.set(player.id, player);
    const { types: typeList } = refreshMobTypes();
    const types = mobTypesForClient(MOBTYPES);
    send(connection, { t: 'init', id: player.id, name: player.name, cls: player.cls, world: worldInfo(mapOf(player)), types, tl: typeList, classes: CLASSES, items: ITEMS, maxRank: MAXRANK, pMax: PMAX, passiveEffect: PASSIVE_EFFECT, affixes: Object.fromEntries(Object.entries(AFFIXES).map(([k, v]) => [k, { n: v.n, prefix: v.prefix }])), affixSlots: Object.keys(AFFIX_SLOTS), affixCost: AFFIX_COST, mythicMerge: { count: MYTHIC_MERGE_COUNT, gold: MYTHIC_MERGE_GOLD }, buffCapMs: 300000, bagMax: BAGMAX, bagPageSize: BAG_PAGE_SIZE, slots: SLOTS, rarity: RARITY.map(r => r.n), upRate: UP_RATE, stat: Object.fromEntries(Object.entries(STATDEF).map(([k, v]) => [k, { n: v.n, pct: !!v.pct }])), resumed: !!savedPlayer, server: config.serverName, admin: isAdmin(player) });
    inventory.sendInv(player);
    broadcast({ t: 'chat', n: '*', m: messageText("server.joined", "{player} entered {server}.", { player: player.name, server: config.serverName }) });
    if (config.motd) say(player, config.motd);
    fire('join', player);
    if (player.sp > 0) say(player, messageText("server.unspent", "You have {count} unspent skill point(s) - press K!", { count: player.sp }));
  }

  function handleChat(player, rawMessage) {
    const text = String(rawMessage || '').slice(0, 120).trim();
    if (!text) return;
    if (!text.startsWith('/')) {
      if (fire('chat', player, text) !== false) broadcast({ t: 'chat', n: player.name, m: text });
      return;
    }

    const [name, ...args] = text.slice(1).split(/\s+/);
    const commandName = name.toLowerCase();
    if (commandName === 'help') {
      const available = Object.keys(commands).filter(key => !commands[key].admin || isAdmin(player));
      return say(player, messageText("server.commands", "Commands: {commands}", { commands: available.map(key => '/' + key).join(' ') }));
    }
    const command = commands[commandName];
    if (!command) return say(player, messageText("server.unknownCommand", "Unknown command. Try /help"));
    if (command.admin && !isAdmin(player)) return say(player, messageText("server.adminOnly", "That command is for admins only."));
    try {
      const reply = command.fn(player, args, text);
      if (typeof reply === 'string' || isLocalizedText(reply)) say(player, reply);
    } catch (error) {
      say(player, messageText("server.commandError", "Command error: {error}", { error: error.message }));
    }
  }

  const messageHandlers = {
    dir(player, message) {
      player.dir = { x: clamp1(message.x), y: clamp1(message.y) };
      if (player.dir.x || player.dir.y) {
        player.dest = null;
        player.chasingTarget = false;
      }
    },
    move(player, message) {
      if (player.dead || !Number.isFinite(message.x) || !Number.isFinite(message.y)) return;
      const map = mapOf(player);
      player.dest = { x: map.x0 + message.x, y: map.y0 + message.y };
      clampWorld(player.dest, map);
      player.chasingTarget = false;
    },
    target(player, message) {
      const monster = mobs.get(+message.id);
      if (!monster || monster.dead || player.dead) return;
      const chase = message.chase !== false;
      if (!chase && Math.hypot(player.x - monster.x, player.y - monster.y) > CLASSES[player.cls].range + monster.r) return;
      player.target = monster.id;
      player.chasingTarget = chase;
      if (chase) player.dest = null;
    },
    skill: (player, message) => skill(player, +message.n),
    use(player, message) {
      if (typeof message.i === 'string') inventory.useItem(player, message.i);
    },
    learn: (player, message) => learnSkill(player, String(message.k)),
    equip: (player, message) => inventory.equipItem(player, message.uid),
    prepareDestroy: (player, message) => inventory.prepareDestroy(player, message.uid),
    destroy: (player, message) => inventory.destroyItem(player, message.uid, message.token, message.deliberate),
    unequip: (player, message) => inventory.unequipItem(player, message.slot),
    merge: (player, message) => inventory.doMerge(player, message.uids),
    automerge: (player, message) => inventory.autoMerge(player, message.max),
    uiSync(player, message) {
      if (!['inv', 'team', 'trade', 'universe'].includes(message.channel)) return;
      const times = player.c.uiSyncTimes || (player.c.uiSyncTimes = {}), now = Date.now();
      if (now - (times[message.channel] || 0) < 1000) return;
      times[message.channel] = now; resyncUi?.(player.c, message.channel);
    },
    universe: player => send(player.c, { t: 'universe', u: universe.summary() }),
    portal: player => send(player.c, regions.portalList(player)),
    travel: (player, message) => regions.travel(player, message.map),
    team: (player, message) => teams.handlers.team(player, message),
    trade: (player, message) => teams.handlers.trade(player, message),
    build: (player, message) => regions.buildStall(player, String(message.k || '')),
    lock: (player, message) => inventory.lockItem(player, String(message.uid || '')),
    mythicMerge: (player, message) => inventory.mergeMythics(player, message.uids),
    affix: (player, message) => inventory.affixItem(player, String(message.uid || ''), String(message.k || '')),
    reroll: (player, message) => inventory.rerollItem(player, String(message.uid || '')),
    sell: (player, message) => inventory.sellItem(player, message.uid),
    sellall: (player, message) => inventory.sellByRarity(player, message.rar),
    buy: (player, message) => inventory.buyItem(player, message.i, message.n),
    upgrade: (player, message) => inventory.upgradeItem(player, String(message.uid || player.eq.weapon?.uid || ''), message.automatic === true),
    chat: (player, message) => handleChat(player, message.m),
  };

  function handleMessage(connection, message) {
    if (connection.closed || !message || typeof message !== 'object' || Array.isArray(message) || typeof message.t !== 'string') return;
    // Releasing movement must remain possible even after a movement burst is throttled.
    if (connection.p && message.t === 'dir' && message.x === 0 && message.y === 0) { connection.p.dir = { x: 0, y: 0 }; return; }
    if (!commandAllowed(connection, message.t)) return;
    if (message.t === 'join') return joinPlayer(connection, message);
    if (connection.p && Object.hasOwn(messageHandlers, message.t)) {
      messageHandlers[message.t](connection.p, message);
    }
  }

  function leavePlayer(connection) {
    const player = connection.p;
    if (!player) return;
    fire('leave', player);
    teams.onLeave(player);
    savePlayer(player);
    connection.p = null;
    players.delete(player.id);
    for (const monster of mobs.values()) {
      if (monster.target === player.id) monster.target = 0;
    }
    broadcast({ t: 'chat', n: '*', m: messageText("server.left", "{player} left.", { player: player.name }) });
  }

  return { handleMessage, leavePlayer, isAdmin };
}

module.exports = { createPlayerSessions };
