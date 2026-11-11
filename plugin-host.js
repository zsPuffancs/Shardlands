'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { localizedText, isLocalizedText, gearText } = require('./localized-text');
const { W, H, CX, CY, VILLAGE, NPCS, tierOf, clampWorld, mapOf, placeInVillage } = require('./game-world');
const { MOBTYPES, TIERS, MAX_LEVEL } = require('./monsters');
const { SLOTS, STATDEF, RARITY } = require('./equipment');
const { ITEMS, CLASSES, SKILLS, stats } = require('./characters');
const { BAGMAX } = require('./inventory');
const { SUMMON_LIFETIME_MS } = require('./combat');

function createPluginHost({ directory, config, generatorVersion = 1, rates, players, mobs, loot, pluginData, getNextId, eventCount, truncateEvents, genGear, addGear, dropAt, spawnMob, say, toast, broadcast, gainXp, afterGearChange, sendInv, ev, isAdmin, serverStats }) {
  const hooks = Object.create(null), commands = Object.create(null);
  function fire(event, ...args) {
    const handlers = hooks[event];
    if (!handlers) return true;
    let allowed = true;
    for (const handler of handlers) {
      try {
        if (handler.fn(...args) === false) allowed = false;
      } catch (error) {
        console.log('[plugin ' + handler.plugin + '] error in "' + event + '": ' + error.message);
      }
    }
    return allowed;
  }

  function makeApi(pluginName) {
    return {
      name: pluginName, generatorVersion, config: config, rates: rates, log: (...a) => console.log('[' + pluginName + ']', ...a), consts: { W, H, CX, CY, VILLAGE, BAGMAX, MAX_LEVEL }, MOBTYPES, ITEMS, CLASSES, TIERS, RARITY, STATDEF, SLOTS, NPCS,
      on(ev, handler) { (hooks[ev] = hooks[ev] || []).push({ fn: handler, plugin: pluginName }); },
      command(name, options, handler) { if (typeof options === 'function') { handler = options; options = {}; } commands[String(name).toLowerCase()] = { fn: handler, admin: !!options.admin, help: options.help || '', plugin: pluginName }; },
      addMob(id, definition) { MOBTYPES[id] = Object.assign({ name: id, lvl: 5, hp: 50, dmg: 5, spd: 100, xp: 10, gold: [1, 5], r: 16, aggro: 120, color: '#cccccc' }, definition); return MOBTYPES[id]; },
      addToTier(tier, id, asBoss) { const T = TIERS[tier]; if (!T) return; const l = asBoss ? (T.bosses = T.bosses || []) : T.types; if (!l.includes(id) || asBoss) l.push(id); },
      addItem(id, definition) { ITEMS[id] = Object.assign({ n: id, price: 100, d: '', w: 0, color: '#cccccc' }, definition); return ITEMS[id]; },
      addClass(id, definition) { CLASSES[id] = Object.assign({}, CLASSES.blade, { name: id, desc: '', color: '#cccccc' }, definition); return CLASSES[id]; },
      genGear, giveGear: (p, it) => addGear(p, it), dropAt: (x, y, d, owner) => dropAt(x, y, d, owner),
      players: () => [...players.values()], mobs: () => [...mobs.values()],
      findPlayer: n => [...players.values()].find(p => p.name.toLowerCase() === String(n).toLowerCase()),
      spawn(type, x, y, options) { if (!MOBTYPES[type]) throw new Error('unknown mob ' + type); const m = spawnMob(type, x, y, tierOf(x, y), options); if (options && options.temp) { m.summoned = true; m.expiresAt = Date.now() + SUMMON_LIFETIME_MS; } m.awake = true; return m; },
      say, toast, message: localizedText, gearName: gearText,
      zoneName: name => localizedText('zone.' + name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''), name),
      broadcast: msg => broadcast({ t: 'chat', n: '*', m: isLocalizedText(msg) ? msg : String(msg) }),
      giveItem(p, k, n) { if (!ITEMS[k]) return false; p.inv[k] = (p.inv[k] || 0) + (n === undefined ? 1 : n); return true; },
      giveGold(p, n) { p.gold = Math.max(0, p.gold + n); }, giveXp: (p, n) => gainXp(p, n), refresh: p => afterGearChange(p),
      heal(p) { p.hp = p.maxhp; p.mp = p.maxmp; },
      // Positions given to teleport are local to the map the player is on. toVillage returns them to that map's village.
      toVillage(p) { placeInVillage(p); p.dest = null; p.target = 0; p.chasingTarget = false; },
      teleportTo(p, target) { p.x = target.x; p.y = target.y; clampWorld(p); p.dest = null; p.target = 0; p.chasingTarget = false; },
      teleport(p, x, y) { const map = mapOf(p); p.x = map.x0 + +x; p.y = map.y0 + +y; clampWorld(p); p.dest = null; p.target = 0; p.chasingTarget = false; },
      setLevel(p, l) { p.lvl = Math.max(1, Math.min(MAX_LEVEL, l | 0)); p.xp = 0; const spent = SKILLS.reduce((s, k) => s + p.sk[k], 0) - 1; p.sp = Math.max(0, p.lvl - spent); stats(p); p.hp = p.maxhp; p.mp = p.maxmp; sendInv(p); },
      effect(x, y, radius, style) { ev('fx', x, y, radius || 60, { s: style || 'buff' }); }, text(x, y, message, kind) { ev(kind || 'xp', x, y, isLocalizedText(message) ? message : String(message)); },
      isAdmin, kick(p) { try { p.c.sock.end(); } catch (e) {} }, data: () => (pluginData[pluginName] = pluginData[pluginName] || {}),
      stats: serverStats,
    };
  }
  const activePlugins = new Set(), knownPlugins = new Set();
  function restoreRegistry(registry, backup) {
    for (const key of Object.keys(registry)) delete registry[key];
    Object.assign(registry, backup);
  }
  function loadPlugins() {
    const dir = path.join(directory, 'plugins'); let list = []; try { list = fs.readdirSync(dir); } catch (e) { return; }
    console.log('  Loading plugins...');
    for (const f of list.sort()) {
      if (f.startsWith('_') || f.startsWith('.')) continue;
      const full = path.join(dir, f), name = f.replace(/\.js$/, ''); let entry = null;
      try { const st = fs.statSync(full); if (st.isDirectory()) { if (fs.existsSync(path.join(full, 'index.js'))) entry = full; } else if (f.endsWith('.js')) entry = full; } catch (e) {}
      if (!entry) continue;
      knownPlugins.add(name);
      if (config.disabledPlugins.includes(name)) continue;

      const registries = [hooks, commands, MOBTYPES, ITEMS, CLASSES, pluginData];
      const backups = registries.map(registry => ({ ...registry }));
      backups[0] = Object.fromEntries(Object.entries(hooks).map(([event, handlers]) => [event, handlers.slice()]));
      const tiers = TIERS.map(t => ({ ...t, types: t.types.slice(), ...(t.bosses ? { bosses: t.bosses.slice() } : {}) }));
      const initialId = getNextId(), initialEventCount = eventCount();
      try {
        const mod = require(entry), init = typeof mod === 'function' ? mod : mod.init;
        const registeredName = (typeof mod === 'object' && mod.name) || name;
        knownPlugins.add(registeredName);
        if (config.disabledPlugins.includes(registeredName)) continue;
        init(makeApi(registeredName));
        activePlugins.add(name);
        activePlugins.add(registeredName);
        console.log('    + ' + registeredName + (mod.version ? ' v' + mod.version : ''));
      } catch (e) {
        registries.forEach((registry, i) => restoreRegistry(registry, backups[i]));
        TIERS.splice(0, TIERS.length, ...tiers);
        for (const world of [mobs, loot]) for (const id of world.keys()) if (id >= initialId) world.delete(id);
        truncateEvents(initialEventCount);
        console.log('    ! FAILED ' + name + ': ' + e.message);
      }
    }
  }

  function clientScripts(publicDirectory) {
    try {
      return fs.readdirSync(path.join(publicDirectory, 'plugins')).filter(file => {
        if (!file.endsWith('.js') || file.startsWith('_') || file.startsWith('.')) return false;
        const name = file.slice(0, -3);
        return !config.disabledPlugins.includes(name) && (!knownPlugins.has(name) || activePlugins.has(name));
      }).sort();
    } catch {
      return [];
    }
  }

  return { fire, commands, loadPlugins, clientScripts };
}

module.exports = { createPluginHost };
