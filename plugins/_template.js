// Files starting with "_" are NOT loaded. Copy this to plugins/my_plugin.js to start. Full reference: PLUGINS.md
module.exports = { name: 'my_plugin', version: '0.1', init(api) {
  // api.on('join'|'leave'|'chat'|'kill'|'damage'|'hurt'|'death'|'xp'|'levelup'|'tick', fn)
  // api.command('name', { admin: true }, (player, args) => 'reply text');
  // api.addMob / addItem / addClass / addToTier / genGear / giveGear / giveItem / giveGold / spawn / teleport ...
  api.log('hello from my plugin');
} };
