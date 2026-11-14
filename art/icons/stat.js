'use strict';
// Character statistics and attributes (stat lines, tooltips, passive skills). Compact emblems, readable at 16-20 px.
const { Icon, P } = require('./kit');
const em = (draw) => { const I = Icon(); draw(I); return I.svg(); };
module.exports = {
  damage: () => em(I => { const c = [64, 64];
    for (const a of [Math.PI / 4, -Math.PI / 4]) { I.part(P.poly(P.rot([[58, 6], [70, 6], [70, 86], [64, 96], [58, 86]], c, a)), 'steel', { ang: 0 }); I.part(P.poly(P.rot([[44, 88], [84, 88], [84, 98], [44, 98]], c, a)), 'gold', { bev: 1.4 }); I.part(P.poly(P.rot([[60, 98], [68, 98], [68, 118], [60, 118]], c, a)), 'dleather', { bev: 1.2 }); } }),
  crit: () => em(I => { I.glow(64, 64, 50, '#ffb43a', .5); I.part(P.ring(64, 64, 46, 32), 'red'); I.part(P.ring(64, 64, 24, 12), 'red', { bev: 1.6 }); I.part(P.circle(64, 64, 6), 'gold', { ow: 3, bev: 1 });
    for (const [x, y, w, h] of [[60, 4, 8, 26], [60, 98, 8, 26], [4, 60, 26, 8], [98, 60, 26, 8]]) I.part(P.rrect(x, y, w, h, 2), 'gold', { ow: 3.5, bev: 1.2 }); }),
  critdmg: () => em(I => { I.glow(64, 64, 54, '#ff6a1a', .6); const pts = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = i % 2 ? 24 : 56; pts.push([64 + Math.cos(a) * r, 64 + Math.sin(a) * r]); } I.part(P.poly(pts), 'flame'); I.part(P.circle(64, 64, 14), 'amber', { bev: 1.6 }); }),
  hp: () => em(I => { I.part('M64 112 C30 88 10 66 10 42 C10 24 24 12 40 12 C52 12 60 20 64 30 C68 20 76 12 88 12 C104 12 118 24 118 42 C118 66 98 88 64 112Z', 'red'); I.raw('<ellipse cx="38" cy="38" rx="12" ry="8" fill="#fff" fill-opacity=".45" transform="rotate(-30 38 38)"/>'); }),
  defense: () => em(I => { I.part('M64 8 L112 24 L112 62 Q112 98 64 120 Q16 98 16 62 L16 24Z', 'steel'); I.part('M64 22 L98 34 L98 62 Q98 88 64 106 Q30 88 30 62 L30 34Z', 'blue', { bev: 1.8 }); I.part('M58 30 L70 30 L70 98 L58 98Z', 'gold', { ow: 3, bev: 1.2 }); I.part('M38 52 L90 52 L90 62 L38 62Z', 'gold', { ow: 3, bev: 1.2 }); }),
  mana: () => em(I => { I.glow(64, 74, 50, '#58b8ff', .5); I.part('M64 8 C78 34 104 58 104 82 C104 104 86 120 64 120 C42 120 24 104 24 82 C24 58 50 34 64 8Z', 'blue'); I.raw('<ellipse cx="48" cy="80" rx="8" ry="14" fill="#fff" fill-opacity=".45" transform="rotate(20 48 80)"/>'); }),
  speed: () => em(I => { I.part('M28 10 L84 10 L64 50 L96 50 L40 120 L54 68 L24 68Z', 'amber'); I.glow(60, 60, 40, '#fff0b0', .35); }),
  lifesteal: () => em(I => { I.part('M64 6 C76 30 98 50 98 76 C98 100 82 118 64 118 C46 118 30 100 30 76 C30 50 52 30 64 6Z', 'red'); I.part('M44 74 Q64 64 84 74 L78 82 Q64 76 50 82Z', '#ffe0d8', { ow: 2, bev: .8 }); I.part('M54 80 L58 96 L62 80 M66 80 L70 96 L74 80', '#fff', { ow: 2, bev: .5 }); }),
  movespeed: () => em(I => { I.part('M34 18 L66 18 L66 78 L104 90 Q116 94 114 108 L28 110 Q22 110 22 104 L22 78 L34 66Z', 'leather'); for (let i = 0; i < 3; i++) I.line(`M${6} ${40 + i * 18} L${26 - i * 4} ${40 + i * 18}`, '#e8f4ff', 5); I.part('M66 30 L92 12 L88 30 L104 22 L84 48 L66 48Z', 'steel', { bev: 1.2 }); }),
  level: () => em(I => { I.part('M64 6 L118 64 L64 122 L10 64Z', 'gold'); I.part('M64 24 L100 64 L64 104 L28 64Z', 'red', { bev: 1.8 }); I.part('M64 40 L80 60 L70 60 L70 82 L58 82 L58 60 L48 60Z', 'gold', { ow: 3, bev: 1 }); }),
  xp: () => em(I => { I.glow(64, 64, 56, '#ffd86a', .55); const pts = []; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 22 : 56; pts.push([64 + Math.cos(a) * r, 64 + Math.sin(a) * r]); } I.part(P.poly(pts), 'gold'); I.part(P.circle(64, 64, 10), 'amber', { ow: 3, bev: 1 }); }),
  bag: () => require('./menu').inventory(),
  locked: () => em(I => { I.part('M38 56 L38 40 Q38 14 64 14 Q90 14 90 40 L90 56 L78 56 L78 40 Q78 26 64 26 Q50 26 50 40 L50 56Z', 'steel'); I.part(P.rrect(24, 52, 80, 66, 10), 'gold'); I.raw('<circle cx="64" cy="78" r="8" fill="#0b0806"/><path d="M60 82 L68 82 L70 102 L58 102Z" fill="#0b0806"/>'); }),
};
