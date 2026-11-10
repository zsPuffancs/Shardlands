'use strict';

const crypto = require('node:crypto');
const { CX, CY, rnd, worldInfo } = require('./game-world');
const { MOBTYPES } = require('./monsters');
const { CLASSES, ITEMS, MAXRANK, PMAX, newSk, stats } = require('./characters');
const { SLOTS, STATDEF, UP_RATE, RARITY, sanitize } = require('./equipment');
const { BAGMAX } = require('./inventory');

function createPlayerSessions({ config, players, mobs, saves, allocateId, refreshMobTypes, send, say, broadcast, fire, commands, skill, learnSkill, inventory, savePlayer }) {
  const isAdminName = name => config.admins.some(a => String(a).toLowerCase() === name.toLowerCase());
  const isAdmin = player => Boolean(player.ph && isAdminName(player.name));
  const clamp1 = v => Math.max(-1, Math.min(1, +v || 0));

  function joinPlayer(connection, message) {
    if (connection.p) return;
    const name = String(message.name || '').replace(/[^\w \-]/g, '').trim().slice(0, 14);
    if (name.length < 2) return send(connection, { t: 'err', m: 'Name must be 2-14 letters/digits.' });
    for (const onlinePlayer of players.values()) if (onlinePlayer.name.toLowerCase() === name.toLowerCase()) return send(connection, { t: 'err', m: 'That hero is already online.' });
    const savedPlayer = saves[name.toLowerCase()];
    if (isAdminName(name) && !savedPlayer?.ph) {
      return send(connection, { t: 'err', m: 'Admin hero must have a password set before granting admin access.' });
    }
    const password = String(message.pw || '').slice(0, 64);
    const passwordHash = password ? crypto.createHash('sha256').update(name.toLowerCase() + ':' + password).digest('hex') : '';
    if (savedPlayer && savedPlayer.ph && savedPlayer.ph !== passwordHash) return send(connection, { t: 'err', m: 'Wrong password for this hero.' });
    const classId = savedPlayer ? savedPlayer.cls : (typeof message.cls === 'string' && Object.hasOwn(CLASSES, message.cls) ? message.cls : 'blade');
    const level = savedPlayer ? savedPlayer.lvl : 1;
    const startingInventory = Object.assign(Object.fromEntries(Object.keys(ITEMS).map(k => [k, 0])), savedPlayer ? (savedPlayer.inv || { hp: savedPlayer.pots || 0 }) : { hp: 3, mp: 1 });
    const player = { id: allocateId(), c: connection, name: savedPlayer ? savedPlayer.name : name, cls: classId, lvl: level, xp: savedPlayer ? savedPlayer.xp : 0, gold: savedPlayer ? (Number.isFinite(savedPlayer.gold) ? savedPlayer.gold : 0) : 100, w: 0, inv: startingInventory, bag: (savedPlayer && Array.isArray(savedPlayer.bag) ? savedPlayer.bag.filter(it => it && typeof it === 'object').map(sanitize) : []), eq: Object.assign({ weapon: null, helm: null, armor: null, boots: null, ring: null, amulet: null }, savedPlayer && savedPlayer.eq),
      sk: Object.assign(newSk(), savedPlayer && savedPlayer.sk), sp: savedPlayer ? (savedPlayer.sp !== undefined ? savedPlayer.sp : level) : 1, buf: { atk: 0, def: 0, spd: 0, xp: 0, rage: 0 }, potCd: 0, g: {},
      ph: savedPlayer ? (savedPlayer.ph || passwordHash) : passwordHash, data: (savedPlayer && savedPlayer.data) || {},
      x: CX + rnd(-50, 50), y: CY + rnd(30, 95), dir: { x: 0, y: 0 }, dest: null, target: 0, chasingTarget: false, cd: 0, cd1: 0, cd2: 0, cd3: 0, dead: 0 };
    for (const slot of SLOTS) sanitize(player.eq[slot]);
    if (!player.eq.weapon) player.eq.weapon = inventory.starterWeapon(player, savedPlayer && savedPlayer.w);
    stats(player); player.hp = player.maxhp; player.mp = player.maxmp; connection.p = player; connection.mobDeltas = message.mobDeltas === true; players.set(player.id, player);
    const { types: typeList } = refreshMobTypes();
    const types = {}; for (const k in MOBTYPES) types[k] = { n: MOBTYPES[k].name, r: MOBTYPES[k].r, c: MOBTYPES[k].color, st: !!MOBTYPES[k].stone, boss: !!MOBTYPES[k].boss, lvl: MOBTYPES[k].lvl, shape: MOBTYPES[k].shape };
    send(connection, { t: 'init', id: player.id, name: player.name, cls: player.cls, world: worldInfo(), types, tl: typeList, classes: CLASSES, items: ITEMS, maxRank: MAXRANK, pMax: PMAX, bagMax: BAGMAX, slots: SLOTS, rarity: RARITY.map(r => r.n), upRate: UP_RATE, stat: Object.fromEntries(Object.entries(STATDEF).map(([k, v]) => [k, { n: v.n, pct: !!v.pct }])), resumed: !!savedPlayer, server: config.serverName, admin: isAdmin(player) });
    inventory.sendInv(player);
    broadcast({ t: 'chat', n: '*', m: player.name + ' entered ' + config.serverName + '.' });
    if (config.motd) say(player, config.motd);
    fire('join', player);
    if (player.sp > 0) say(player, 'You have ' + player.sp + ' unspent skill point(s) - press K!');
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
      return say(player, 'Commands: ' + available.map(key => '/' + key).join(' '));
    }
    const command = commands[commandName];
    if (!command) return say(player, 'Unknown command. Try /help');
    if (command.admin && !isAdmin(player)) return say(player, 'That command is for admins only.');
    try {
      const reply = command.fn(player, args, text);
      if (typeof reply === 'string') say(player, reply);
    } catch (error) {
      say(player, 'Command error: ' + error.message);
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
      player.dest = { x: message.x, y: message.y };
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
    unequip: (player, message) => inventory.unequipItem(player, message.slot),
    merge: (player, message) => inventory.doMerge(player, message.uids),
    automerge: (player, message) => inventory.autoMerge(player, message.max),
    sell: (player, message) => inventory.sellItem(player, message.uid),
    sellall: (player, message) => inventory.sellByRarity(player, message.rar),
    buy: (player, message) => inventory.buyItem(player, message.i, message.n),
    upgrade: (player, message) => inventory.upgradeItem(player, String(message.uid || player.eq.weapon?.uid || '')),
    chat: (player, message) => handleChat(player, message.m),
  };

  function handleMessage(connection, message) {
    if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.t !== 'string') return;
    if (message.t === 'join') return joinPlayer(connection, message);
    if (connection.p && Object.hasOwn(messageHandlers, message.t)) {
      messageHandlers[message.t](connection.p, message);
    }
  }

  function leavePlayer(connection) {
    const player = connection.p;
    if (!player) return;
    fire('leave', player);
    savePlayer(player);
    players.delete(player.id);
    for (const monster of mobs.values()) {
      if (monster.target === player.id) monster.target = 0;
    }
    broadcast({ t: 'chat', n: '*', m: player.name + ' left.' });
  }

  return { handleMessage, leavePlayer, isAdmin };
}

module.exports = { createPlayerSessions };
