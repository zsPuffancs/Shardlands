// EXAMPLE: a new monster, a new consumable and a drop rule. Client model: public/plugins/frost_wolf.js
module.exports = { name: 'frost_wolf', version: '1.0', init(api) {
  api.addMob('frostwolf', { name: 'Frost Wolf', lvl: 5, hp: 260, dmg: 12, spd: 125, xp: 60, gold: [15, 35], r: 16, aggro: 150, color: '#bfe6ff' });
  // three packs in the outer meadow (use api.addToTier(0, 'frostwolf') instead to mix them into every camp)
  const { CX, CY } = api.consts;
  for (let k = 0; k < 3; k++) { const a = 0.9 + k * 2.1, x = CX + Math.cos(a) * 820, y = CY + Math.sin(a) * 820; for (let i = 0; i < 3; i++) api.spawn('frostwolf', x + (Math.random() - .5) * 140, y + (Math.random() - .5) * 140); }
  api.addItem('frostpot', { n: 'Frostbite Tonic', price: 90, d: 'Heals 30% HP and +35% speed for 60s', color: '#8fe0ff', w: 3,
    use(p) { p.hp = Math.min(p.maxhp, p.hp + Math.floor(p.maxhp * 0.3)); p.buf.spd = Date.now() + 60000; api.effect(p.x, p.y, 60, 'buff'); return api.message('plugin.frostWolf.drink', 'You feel the chill rush through you.'); } });
  api.on('kill', (p, m) => { if (m.ty === 'frostwolf' && Math.random() < 0.3) { api.giveItem(p, 'frostpot', 1); api.text(p.x, p.y, api.message('server.pickedUp', 'You picked up: {item}', { item: api.message('item.frostpot.name', 'Frostbite Tonic') }), 'loot'); } });
} };
