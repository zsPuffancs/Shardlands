'use strict';
// Consumables. Potions share one flask so the liquid colour carries the meaning.
const { Icon, P } = require('./kit');
function flask(liq, o = {}) { const I = Icon(), big = o.big;
  const body = big ? 'M50 34 L78 34 L78 46 Q112 58 112 88 Q112 120 64 120 Q16 120 16 88 Q16 58 50 46Z' : 'M52 38 L76 38 L76 50 Q104 60 104 88 Q104 118 64 118 Q24 118 24 88 Q24 60 52 50Z';
  I.part(body, '#2a3038', { bev: 1.4, hi: .5 });
  const top = big ? 70 : 74, cp = I.part(body, 'ink', { ow: 0, bev: 0 });
  I.fill(`M0 ${top} Q32 ${top - 6} 64 ${top} T128 ${top} V128 H0Z`, '#000', { clip: cp });
  I.raw(`<g clip-path="url(#${cp})">`); I.part(`M0 ${top} Q32 ${top - 6} 64 ${top} T128 ${top} V128 H0Z`, liq, { ow: 0, bev: 2.4 }); I.raw('</g>');
  I.fill(big ? 'M30 70 Q30 52 54 48' : 'M36 72 Q36 58 54 54', 'none'); I.line(big ? 'M28 84 Q28 60 52 52' : 'M34 84 Q34 64 52 56', '#ffffff', 4, { op: .45 });
  I.part(big ? P.rrect(46, 16, 36, 20, 5) : P.rrect(48, 20, 32, 20, 5), 'wood', { bev: 1.6 });
  I.part(big ? P.rrect(44, 30, 40, 8, 3) : P.rrect(46, 34, 36, 8, 3), 'gold', { bev: 1.2 });
  if (big) { I.gem(64, 92, 9, 'amber'); I.spark(100, 40, 7); }
  for (const [x, y, r] of [[56, 96, 3], [72, 104, 2.2], [66, 88, 1.6]]) I.raw(`<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" fill-opacity=".35"/>`);
  return I; }
function elixir(liq, sym) { const I = Icon();
  const body = 'M56 34 L72 34 L72 54 L96 104 Q100 118 86 118 L42 118 Q28 118 32 104 L56 54Z';
  I.part(body, '#2a3038', { bev: 1.2, hi: .5 }); const cp = I.part(body, 'ink', { ow: 0, bev: 0 });
  I.raw(`<g clip-path="url(#${cp})">`); I.part('M0 76 Q40 70 64 76 T128 76 V128 H0Z', liq, { ow: 0, bev: 2.4 }); I.raw('</g>');
  I.line('M50 70 L38 104', '#fff', 3.5, { op: .4 });
  I.part(P.rrect(52, 16, 24, 20, 4), 'wood', { bev: 1.4 }); I.part(P.rrect(50, 30, 28, 7, 3), 'gold', { bev: 1 });
  sym(I); return I.svg(); }
module.exports = {
  hp: () => flask('red').svg(),
  hp2: () => flask('red', { big: 1 }).svg(),
  mp: () => flask('blue').svg(),
  atk: () => elixir('flame', I => { I.part('M64 86 L70 96 L64 112 L58 96Z', 'steel', { ow: 3, bev: 1 }); I.spark(98, 44, 6); }),
  def: () => elixir('steel', I => { I.part('M54 88 L74 88 L74 100 Q74 110 64 114 Q54 110 54 100Z', 'steel', { ow: 3, bev: 1 }); }),
  spd: () => elixir('green', I => { I.line('M46 94 Q60 86 82 92 M50 104 Q64 96 84 102', '#e8ffe0', 3, { op: .85 }); }),
  xp: () => { const I = Icon();
    I.part('M10 30 Q36 20 62 30 L62 112 Q36 102 10 112Z', 'parch'); I.part('M66 30 Q92 20 118 30 L118 112 Q92 102 66 112Z', 'parch');
    I.part('M6 32 Q36 22 62 32 L64 116 L66 32 Q92 22 122 32 L122 118 Q92 108 64 118 Q36 108 6 118Z', 'leather', { bev: 1.4 });
    I.part('M12 30 Q36 20 62 30 L62 110 Q36 100 12 110Z', 'parch', { bev: 1.6 }); I.part('M66 30 Q92 20 116 30 L116 110 Q92 100 66 110Z', 'parch', { bev: 1.6 });
    for (let i = 0; i < 5; i++) { I.line(`M20 ${44 + i * 12} Q36 ${40 + i * 12} 54 ${44 + i * 12}`, '#8a6a3a', 2, { op: .7 }); I.line(`M74 ${44 + i * 12} Q92 ${40 + i * 12} 108 ${44 + i * 12}`, '#8a6a3a', 2, { op: .7 }); }
    I.glow(64, 30, 36, '#ffd86a', .55); I.spark(64, 14, 9, '#fff6c8'); I.spark(90, 10, 4, '#fff6c8'); return I.svg(); },
  ret: () => { const I = Icon();
    I.part('M24 14 L104 14 Q112 14 112 22 Q112 30 104 30 L104 98 Q112 98 112 106 Q112 114 104 114 L24 114 Q16 114 16 106 Q16 98 24 98 L24 30 Q16 30 16 22 Q16 14 24 14Z', 'parch');
    I.part(P.rrect(12, 10, 104, 16, 8), 'wood', { bev: 1.4 }); I.part(P.rrect(12, 102, 104, 16, 8), 'wood', { bev: 1.4 });
    I.glow(64, 64, 34, '#58b8ff', .55);
    I.part('M64 40 L86 60 L80 60 L80 84 L48 84 L48 60 L42 60Z', 'blue', { ow: 3.5, bev: 1.4 }); I.fill(P.rrect(59, 68, 10, 16, 1), '#0b0806');
    return I.svg(); },
  reset: () => { const I = Icon();
    I.glow(64, 64, 52, '#a45cf0', .5);
    I.part('M64 18 A46 46 0 0 1 108 56 L120 56 L100 80 L80 56 L92 56 A30 30 0 0 0 64 34Z', 'violet');
    I.part('M64 110 A46 46 0 0 1 20 72 L8 72 L28 48 L48 72 L36 72 A30 30 0 0 0 64 94Z', 'violet');
    I.gem(64, 64, 11, 'violet'); return I.svg(); },
};
