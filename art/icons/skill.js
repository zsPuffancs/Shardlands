'use strict';
// Skills and classes. Active skills sit on a round rune disc so they read as "abilities" on the action bar.
const { Icon, P } = require('./kit');
const disc = (m, draw) => { const I = Icon(); I.part(P.circle(64, 64, 58), 'dsteel'); I.part(P.circle(64, 64, 50), m, { bev: 2.4 }); I.raw('<circle cx="64" cy="64" r="50" fill="url(#none)"/>'); draw(I); return I.svg(); };
const gear = require('./gear');
module.exports = {
  blade: () => disc('#6a2a20', I => { const c = [64, 64]; I.glow(64, 64, 44, '#ffb070', .5);
    I.part(P.poly(P.rot([[58, 14], [70, 14], [70, 80], [64, 90], [58, 80]], c, Math.PI / 4)), 'steel', { ang: 0 }); I.part(P.poly(P.rot([[44, 82], [84, 82], [84, 92], [44, 92]], c, Math.PI / 4)), 'gold', { bev: 1.4 });
    I.part(P.poly(P.rot([[60, 92], [68, 92], [68, 110], [60, 110]], c, Math.PI / 4)), 'dleather', { bev: 1 }); I.line('M24 92 Q40 60 92 34', '#fff0d0', 3, { op: .7 }); }),
  archer: () => disc('#1e4a2a', I => { I.glow(64, 64, 44, '#a8ffb0', .4);
    I.part('M40 22 Q88 36 88 64 Q88 92 40 106 L38 100 Q80 88 80 64 Q80 40 38 28Z', 'wood', { ang: 0 }); I.line('M40 26 L40 102', '#e8dcc0', 1.6);
    I.part('M30 62 H96 V66 H30Z', 'wood', { ow: 3, bev: 1 }); I.part('M94 56 L110 64 L94 72Z', 'steel', { bev: 1.2 }); I.part('M20 57 L34 62 L34 66 L20 71 L25 64Z', 'red', { bev: 1 }); }),
  mage: () => disc('#2e1a52', I => { I.glow(64, 60, 46, '#c88aff', .7);
    const pts = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 16 : 40; pts.push([64 + Math.cos(a) * r, 62 + Math.sin(a) * r]); } I.part(P.poly(pts), 'violet'); I.part(P.circle(64, 62, 10), '#ffffff', { ow: 2.5, bev: 1 }); }),
  berserker: () => disc('#4a1410', I => { I.glow(64, 64, 46, '#ff5a3a', .55);
    for (const s of [-1, 1]) { const c = [64, 64], R = pts => P.poly(P.rot(pts, c, s * Math.PI / 4));
      I.part(R([[61, 26], [67, 26], [67, 108], [61, 108]]), 'wood', { ang: 0, bev: 1.2 });
      I.part(R([[67, 28], [92, 20], [98, 40], [92, 58], [67, 50]].map(([x, y]) => [s > 0 ? x : 128 - x, y])), 'steel'); } }),
  mend: () => disc('#1a4a3a', I => { I.glow(64, 64, 46, '#7affc0', .6); I.part('M54 22 L74 22 L74 54 L106 54 L106 74 L74 74 L74 106 L54 106 L54 74 L22 74 L22 54 L54 54Z', 'green'); I.spark(96, 32, 6); }),
  frenzy: () => disc('#5a1a08', I => { I.glow(64, 70, 48, '#ff6a1a', .7);
    I.part('M64 12 C72 34 92 44 92 72 C92 96 78 112 64 112 C50 112 36 96 36 72 C36 56 44 50 48 38 C52 52 56 54 58 48 C58 34 60 24 64 12Z', 'flame');
    I.part('M64 58 C70 68 78 74 78 88 C78 100 72 106 64 106 C56 106 50 100 50 88 C50 78 58 72 60 66Z', '#fff4c0', { ow: 0, bev: 1 }); }),
};
