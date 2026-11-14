'use strict';
// Enemy ranks and boss states (nameplates, target frame, boss banners, journal).
const { Icon, P } = require('./kit');
module.exports = {
  region: () => { const I = Icon(); I.glow(64, 64, 54, '#ff6a1a', .35);
    I.part('M24 44 Q8 20 14 6 Q30 22 40 30Z M104 44 Q120 20 114 6 Q98 22 88 30Z', 'bone');
    I.part('M64 18 C94 18 108 40 108 64 C108 80 98 88 92 92 L90 110 L38 110 L36 92 C30 88 20 80 20 64 C20 40 34 18 64 18Z', 'bone');
    I.part('M36 58 Q46 50 56 60 Q54 74 42 72 Q34 68 36 58Z M92 58 Q82 50 72 60 Q74 74 86 72 Q94 68 92 58Z', '#ff4a1a', { ow: 2.5, bev: 1 });
    I.part('M60 78 L68 78 L64 88Z', 'ink', { ow: 0, bev: .5 }); for (let i = 0; i < 5; i++) I.line(`M${46 + i * 9} 98 L${46 + i * 9} 108`, '#0b0806', 2.4); return I.svg(); },
  alpha: () => { const I = Icon();
    I.part('M20 20 Q44 30 50 64 Q54 96 40 118 Q22 84 20 20Z', 'bone'); I.part('M108 20 Q84 30 78 64 Q74 96 88 118 Q106 84 108 20Z', 'bone');
    I.glow(64, 70, 30, '#ff4a1a', .5); I.gem(64, 64, 10, 'red'); return I.svg(); },
  stagger: () => { const I = Icon(); I.glow(64, 64, 54, '#ffd86a', .5);
    for (const [x, y, s] of [[40, 40, 22], [88, 52, 16], [56, 92, 18]]) { const pts = []; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? s * .42 : s; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); } I.part(P.poly(pts), 'gold', { ow: 3.5, bev: 1.2 }); }
    I.line('M14 76 Q64 108 114 76', '#fff4c4', 4, { op: .7 }); return I.svg(); },
};
