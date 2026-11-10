// EXAMPLE: add a whole new class. Uses the same 3 skill slots with your own names/numbers.
module.exports = { name: 'class_berserker', version: '1.0', init(api) {
  api.addClass('berserker', { model: 'Rogue', tint: [1, .78, .74], name: 'Berserker', desc: 'Huge HP, hits like a truck, no mana.', color: '#c0392b', fam: 'sword', range: 45, hp: 1.6, mp: 0.5, atk: 1.15,
    s1: 'Cleave', s1r: 120, s1m: 2.0, s1c: 12, s1n: 99, s2: 'Bloodlust', s3: 'Rampage' });
} };
