'use strict';
// Main menu / window icons (minimap buttons, window titles, tutorial).
const { Icon, P } = require('./kit');
module.exports = {
  inventory: () => { const I = Icon();
    I.part('M40 30 Q40 10 64 10 Q88 10 88 30 L80 30 Q80 18 64 18 Q48 18 48 30Z', 'dleather', { bev: 1.4 });
    I.part('M22 42 Q22 30 36 30 L92 30 Q106 30 106 42 L112 104 Q112 118 98 118 L30 118 Q16 118 16 104Z', 'leather');
    I.part('M22 44 Q64 60 106 44 L106 62 Q64 78 22 62Z', 'dleather', { bev: 1.6 });
    I.part(P.rrect(54, 56, 20, 18, 4), 'gold', { bev: 1.4 }); I.raw('<circle cx="64" cy="66" r="3" fill="#0b0806"/>');
    I.line('M30 80 L30 108 M98 80 L98 108', '#d8b58a', 2, { op: .45 }); I.line('M28 96 Q64 104 100 96', '#2a180a', 2, { op: .6 }); return I.svg(); },
  character: () => { const I = Icon();
    I.part('M64 10 C88 10 100 28 100 48 C100 66 90 76 80 80 L108 92 Q118 98 118 112 L118 118 L10 118 L10 112 Q10 98 20 92 L48 80 C38 76 28 66 28 48 C28 28 40 10 64 10Z', 'steel');
    I.part('M28 48 C28 28 40 10 64 10 C88 10 100 28 100 48 L100 56 L28 56Z', 'dsteel', { bev: 1.6 });
    I.fill('M38 52 L90 52 L86 60 L42 60Z', '#0b0806');
    I.part('M20 92 L48 80 L64 96 L80 80 L108 92 L100 104 L28 104Z', 'gold', { bev: 1.4 }); I.gem(64, 100, 6, 'red'); return I.svg(); },
  skills: () => { const I = Icon();
    I.part('M22 18 L100 18 L100 108 Q100 116 92 116 L30 116 Q22 116 22 108Z', 'parch');
    I.part(P.rrect(14, 10, 100, 16, 8), 'wood', { bev: 1.4 }); I.part(P.rrect(14, 104, 100, 16, 8), 'wood', { bev: 1.4 });
    I.glow(64, 62, 30, '#ffc23a', .55);
    I.part('M64 36 L71 54 L90 54 L75 66 L81 86 L64 74 L47 86 L53 66 L38 54 L57 54Z', 'gold', { ow: 3.5, bev: 1.4 }); return I.svg(); },
  team: () => { const I = Icon();
    const shield = (x, m, gm) => { I.part(`M${x - 26} 26 L${x} 16 L${x + 26} 26 L${x + 26} 62 Q${x + 26} 92 ${x} 108 Q${x - 26} 92 ${x - 26} 62Z`, m); I.part(`M${x - 4} 24 L${x + 4} 24 L${x + 4} 96 L${x - 4} 96Z`, 'gold', { ow: 2.5, bev: 1 }); I.gem(x, 52, 6, gm); };
    shield(44, 'blue', 'amber'); shield(84, 'red', 'cyan'); return I.svg(); },
  world: () => { const I = Icon();
    I.part('M10 26 L44 14 L84 26 L118 14 L118 102 L84 114 L44 102 L10 114Z', 'parch');
    I.fill('M44 14 L84 26 L84 114 L44 102Z', '#000', { op: .12 });
    I.line('M10 26 L44 14 L84 26 L118 14 M44 14 L44 102 M84 26 L84 114', '#6a5028', 2, { op: .7 });
    I.line('M22 92 Q38 64 58 76 Q76 88 92 56 L102 40', '#a01a04', 3, { op: .85 });
    I.line('M96 34 L108 46 M108 34 L96 46', '#a01a04', 4); I.part(P.circle(24, 92, 5), 'red', { ow: 2.5, bev: 1 }); return I.svg(); },
  chronicle: () => { const I = Icon();
    I.part('M64 8 L118 34 L10 34Z', 'stone'); I.part(P.rrect(8, 34, 112, 10, 2), 'stone', { bev: 1.4 });
    for (const x of [20, 46, 72, 98]) { I.part(P.rrect(x, 46, 12, 58, 2), 'stone', { bev: 1.4 }); I.line(`M${x + 6} 50 L${x + 6} 100`, '#3a3832', 1.6, { op: .6 }); }
    I.part(P.rrect(6, 104, 116, 14, 2), 'stone', { bev: 1.4 }); I.gem(64, 24, 6, 'amber'); return I.svg(); },
  settings: () => { const I = Icon(), pts = [];
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 - Math.PI / 16, r = i % 2 ? 46 : 56; pts.push([64 + Math.cos(a) * r, 64 + Math.sin(a) * r]); for (const da of [.16]) { const b = a + (i % 2 ? da : -da) * 0; } }
    const teeth = []; for (let i = 0; i < 10; i++) { const a0 = i / 10 * Math.PI * 2; for (const [da, r] of [[-.17, 44], [-.11, 56], [.11, 56], [.17, 44]]) teeth.push([64 + Math.cos(a0 + da) * r, 64 + Math.sin(a0 + da) * r]); }
    I.part(P.poly(teeth.map(p => p.map(v => +v.toFixed(2)))) + P.circle(64, 64, 18).replace(/a(\S+) (\S+) 0 1 0/g, 'a$1 $2 0 1 1'), 'steel');
    I.part(P.ring(64, 64, 30, 18), 'gold', { ow: 3, bev: 1.4 }); return I.svg(); },
  journal: () => { const I = Icon();
    I.part('M20 14 L96 14 Q104 14 104 22 L104 116 L28 116 Q20 116 20 108Z', 'red');
    I.part('M28 20 L98 20 L98 110 L28 110Z', 'parch', { bev: 1.2 });
    I.part('M20 14 L32 14 L32 116 L28 116 Q20 116 20 108Z', 'dleather', { bev: 1.2 });
    for (let i = 0; i < 5; i++) I.line(`M40 ${38 + i * 12} L86 ${38 + i * 12}`, '#8a6a3a', 2, { op: .6 });
    I.part('M116 6 Q120 28 98 54 L74 84 L70 80 L92 50 Q106 26 116 6Z', 'bone', { bev: 1.2 }); I.line('M72 82 L64 92', '#0b0806', 3); return I.svg(); },
  trade: () => { const I = Icon();
    I.part('M16 50 L80 50 L80 36 L112 62 L80 88 L80 74 L16 74Z', 'gold');
    I.part('M112 78 L48 78 L48 64 L16 90 L48 116 L48 102 L112 102Z', 'steel'); return I.svg(); },
  sound: () => { const I = Icon();
    I.part('M14 48 L38 48 L68 20 L68 108 L38 80 L14 80Z', 'steel'); I.part(P.rrect(10, 46, 30, 36, 4), 'dsteel', { bev: 1.4 });
    I.line('M82 44 Q94 64 82 84', '#f2c35a', 6); I.line('M96 30 Q118 64 96 98', '#f2c35a', 6); I.line('M82 44 Q94 64 82 84', '#fff4c4', 2, { op: .7 }); I.line('M96 30 Q118 64 96 98', '#fff4c4', 2, { op: .7 }); return I.svg(); },
  graphics: () => { const I = Icon();
    I.part('M8 64 Q64 10 120 64 Q64 118 8 64Z', 'parch'); I.part(P.circle(64, 64, 26), 'blue'); I.part(P.circle(64, 64, 11), 'ink', { ow: 0, bev: 1 });
    I.raw('<circle cx="56" cy="56" r="6" fill="#fff" fill-opacity=".85"/>'); I.spark(104, 26, 7); return I.svg(); },
  keys: () => { const I = Icon();
    const key = (x, y, w, t) => { I.part(P.rrect(x, y, w, 30, 6), 'dsteel'); I.part(P.rrect(x + 5, y + 3, w - 10, 20, 4), 'steel', { ow: 0, bev: 1.2 }); };
    key(10, 26, 50); key(68, 26, 50); key(10, 70, 32); key(48, 70, 70); return I.svg(); },
  log: () => { const I = Icon();
    I.part('M20 12 L96 12 Q108 12 108 24 L108 116 L20 116Z', 'parch'); for (let i = 0; i < 6; i++) I.line(`M32 ${30 + i * 14} L${i % 2 ? 80 : 94} ${30 + i * 14}`, '#6a5028', 3, { op: .8 });
    I.part('M78 80 L118 80 L118 112 L90 112 L78 122Z', 'blue', { bev: 1.4 }); return I.svg(); },
};
