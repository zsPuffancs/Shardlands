// Tiny example: join/leave tips, level-up fireworks and a /time command.
module.exports = { name: 'welcome', version: '1.0', init(api) {
  api.on('join', p => { api.say(p, 'Tip: boss monsters (gold names) drop rare gear. Spirit Stones always drop rare+ loot!'); });
  api.on('levelup', p => { api.effect(p.x, p.y, 140, 'lvl'); if (p.lvl % 10 === 0) api.broadcast(p.name + ' hit level ' + p.lvl + '. Legend!'); });
  api.command('time', {}, () => new Date().toLocaleTimeString());
} };
