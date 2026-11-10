'use strict';
const fs = require('node:fs');
const { basename } = require('node:path');
const { mapOf } = require('./game-world');

function openJsonStore(file) {
  const data = Object.create(null);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Expected a JSON object');
    }
    Object.assign(data, parsed);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error('Could not load ' + basename(file) + '. The existing file was preserved.', { cause: error });
    }
  }

  async function save() {
    const temporaryFile = file + '.' + process.pid + '.tmp';
    try {
      await fs.promises.writeFile(temporaryFile, JSON.stringify(data), { mode: 0o600 });
      await fs.promises.rename(temporaryFile, file);
    } catch (error) {
      await fs.promises.unlink(temporaryFile).catch(() => {});
      throw new Error('Could not save ' + basename(file), { cause: error });
    }
  }
  return { data, save };
}

function createGameSaves({ players, saveStore, pluginStore, extraStores = [] }) {
  const saves = saveStore.data;

  function savePlayer(player) {
    saves[player.name.toLowerCase()] = {
      ph: player.ph, data: player.data, name: player.name, cls: player.cls, lvl: player.lvl, xp: player.xp,
      gold: player.gold, souls: player.souls || 0, inv: player.inv, bag: player.bag, eq: player.eq, sk: player.sk, sp: player.sp,
      map: mapOf(player).index, x: player.x - mapOf(player).x0, y: player.y - mapOf(player).y0, hp: player.hp, mp: player.mp, dead: player.dead, buf: player.buf,
      cd: player.cd, cd1: player.cd1, cd2: player.cd2, cd3: player.cd3, potCd: player.potCd,
    };
  }
  function saveAll() {
    for (const player of players.values()) savePlayer(player);
    return Promise.allSettled([saveStore.save(), pluginStore.save(), ...extraStores.map(store => store.save())]).then(results => {
      for (const result of results) if (result.status === 'rejected') console.error(result.reason);
      return results.every(result => result.status === 'fulfilled');
    });
  }

  return { savePlayer, saveAll };
}

module.exports = { openJsonStore, createGameSaves };
