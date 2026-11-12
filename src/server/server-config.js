'use strict';

const fs = require('node:fs');
const { boundedRateSettings } = require('../shared/safety-limits');
const { resolveBalance } = require('../balance');
const path = require('node:path');

function loadServerConfig(directory, { watch = true } = {}) {
  const config = { serverName: 'Shardlands', motd: '', admins: [], disabledPlugins: [], port: 3000 };
  try { Object.assign(config, JSON.parse(fs.readFileSync(path.join(directory, 'config.json'), 'utf8'))); } catch (error) {}

  // Strict new configuration; legacy rates.json retains its bounded compatibility semantics.
  const balance = resolveBalance(config.balance);
  const ratesFile = path.join(directory, 'rates.json');
  const rates = boundedRateSettings(balance.values.rates);
  const generation = balance.values.worldGeneration, legacyGeneration = config.worldGeneration || {};
  config.worldGeneration = { ...legacyGeneration,
    budgets: { ...legacyGeneration.budgets, ...generation.budgets },
    spacing: { ...legacyGeneration.spacing, ...generation.spacing },
    danger: { ...legacyGeneration.danger, ...generation.danger } };
  function writeDefaultRates() {
    const defaults = Object.assign({ _README: [
      'Edit the numbers below and save - the running server picks them up within ~2 seconds (no restart).',
      'xpRate: XP multiplier (1 = normal, 2 = double).  goldRate: gold dropped by monsters.',
      'gearDropRate: chance of equipment drops (2 = twice as often).  potionDropRate: potions/scrolls drops.',
      'rarityBoost: 0 = normal; 1 = noticeably more rare/epic/legendary; 3 = loot shower.',
      'monsterHp / monsterDamage: monster strength (applies as monsters respawn / immediately).',
      'deathZoneMonsters: how many monsters live in the Death Zone (needs a server restart).',
      'deathGoldLoss: death penalty fraction (default/max 0.05 = 5%; legacy higher values are capped).',
      'deathGoldKillCap: death penalty cap in average normal monster rewards at player level (default/max 12). Either death setting at 0 disables the loss.',
      'respawnSeconds: normal monster respawn time.'] }, rates);
    try { fs.writeFileSync(ratesFile, JSON.stringify(defaults, null, 2)); } catch (error) {}
  }
  function loadRates(first) {
    if (!fs.existsSync(ratesFile)) { if (first) writeDefaultRates(); return; }
    try { const updatedRates = JSON.parse(fs.readFileSync(ratesFile, 'utf8')); for (const key in rates) if (typeof updatedRates[key] === 'number' && isFinite(updatedRates[key])) rates[key] = Math.max(0, updatedRates[key]); if (!first) console.log('  rates.json reloaded: xp x' + rates.xpRate + ', gold x' + rates.goldRate + ', gear x' + rates.gearDropRate + ', potions x' + rates.potionDropRate + ', rarity +' + rates.rarityBoost); }
    catch (error) { console.log('  rates.json could not be read (' + error.message + ') - keeping previous values'); }
  }
  loadRates(true);
  const listener = () => loadRates(false);
  if (watch) fs.watchFile(ratesFile, { interval: 1500 }, listener);
  return { config, rates, balance, reloadRates: () => loadRates(false),
    effectiveBalance: () => resolveBalance({ ruleset: balance.ruleset, overrides: { ...balance.values, rates: { ...rates } } }),
    close: () => { if (watch) fs.unwatchFile(ratesFile, listener); } };
}

module.exports = { loadServerConfig };
