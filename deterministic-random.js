'use strict';
function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
function mulberry32(state) {
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// One independent random stream per purpose, e.g. seededRandom(seed, 'spawns') or (seed, 'region', 9).
function seededRandom(seed, ...labels) {
  const random = mulberry32(hashString([seed, ...labels].join('|')));
  random.float = (a, b) => a + random() * (b - a);
  random.int = (a, b) => Math.floor(random.float(a, b + 1));
  random.pick = list => list[Math.floor(random() * list.length)];
  random.weighted = entries => {
    let roll = random() * entries.reduce((sum, entry) => sum + entry[1], 0);
    for (const entry of entries) { roll -= entry[1]; if (roll < 0) return entry[0]; }
    return entries[entries.length - 1][0];
  };
  return random;
}

module.exports = { hashString, seededRandom };
