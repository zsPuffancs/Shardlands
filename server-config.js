'use strict';

const fs = require('node:fs');
const path = require('node:path');

function loadServerConfig(directory) {
  const config = { serverName: 'Shardlands', motd: '', admins: [], disabledPlugins: [], port: 3000 };
  try { Object.assign(config, JSON.parse(fs.readFileSync(path.join(directory, 'config.json'), 'utf8'))); } catch (error) {}

  const ratesFile = path.join(directory, 'rates.json');
  const rates = { xpRate: 1, goldRate: 1, gearDropRate: 0.8, potionDropRate: 1, rarityBoost: 0, monsterHp: 1.6, monsterDamage: 1.4, deathZoneMonsters: 1800, deathGoldLoss: 0.1, respawnSeconds: 11 };
  function writeDefaultRates() {
    const defaults = Object.assign({ _README: [
      'Edit the numbers below and save - the running server picks them up within ~2 seconds (no restart).',
      'xpRate: XP multiplier (1 = normal, 2 = double).  goldRate: gold dropped by monsters.',
      'gearDropRate: chance of equipment drops (2 = twice as often).  potionDropRate: potions/scrolls drops.',
      'rarityBoost: 0 = normal; 1 = noticeably more rare/epic/legendary; 3 = loot shower.',
      'monsterHp / monsterDamage: monster strength (applies as monsters respawn / immediately).',
      'deathZoneMonsters: how many monsters live in the Death Zone (needs a server restart).',
      'deathGoldLoss: share of gold lost on death (0.1 = 10%).  respawnSeconds: normal monster respawn time.'] }, rates);
    try { fs.writeFileSync(ratesFile, JSON.stringify(defaults, null, 2)); } catch (error) {}
  }
  function loadRates(first) {
    if (!fs.existsSync(ratesFile)) { if (first) writeDefaultRates(); return; }
    try { const updatedRates = JSON.parse(fs.readFileSync(ratesFile, 'utf8')); for (const key in rates) if (typeof updatedRates[key] === 'number' && isFinite(updatedRates[key])) rates[key] = Math.max(0, updatedRates[key]); if (!first) console.log('  rates.json reloaded: xp x' + rates.xpRate + ', gold x' + rates.goldRate + ', gear x' + rates.gearDropRate + ', potions x' + rates.potionDropRate + ', rarity +' + rates.rarityBoost); }
    catch (error) { console.log('  rates.json could not be read (' + error.message + ') - keeping previous values'); }
  }
  loadRates(true); fs.watchFile(ratesFile, { interval: 1500 }, () => loadRates(false));
  return { config, rates };
}

module.exports = { loadServerConfig };
