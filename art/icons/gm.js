'use strict';
// Game Master tools.
const { Icon, P } = require('./kit');
module.exports = {
  badge: () => { const I = Icon(); I.part('M64 6 L116 26 L108 82 Q96 108 64 122 Q32 108 20 82 L12 26Z', 'gold');
    I.part('M64 20 L102 34 L96 78 Q86 98 64 108 Q42 98 32 78 L26 34Z', 'ink', { bev: 1.6 }); I.gem(64, 62, 16, 'red'); I.spark(96, 22, 6); return I.svg(); },
  vault: () => { const I = Icon(); I.part(P.rrect(10, 14, 108, 100, 10), 'dsteel'); I.part(P.circle(64, 64, 34), 'steel');
    I.part(P.circle(64, 64, 14), 'gold'); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + .4; I.line(`M${64 + Math.cos(a) * 16} ${64 + Math.sin(a) * 16} L${64 + Math.cos(a) * 30} ${64 + Math.sin(a) * 30}`, '#0b0806', 5); }
    for (const [x, y] of [[22, 26], [106, 26], [22, 102], [106, 102]]) I.part(P.circle(x, y, 4), 'gold', { ow: 2, bev: .8 }); return I.svg(); },
  account: () => { const I = Icon(); I.part('M58 60 L112 60 L112 74 L104 74 L104 86 L92 86 L92 74 L58 74Z', 'gold'); I.part(P.ring(40, 67, 30, 13), 'gold'); return I.svg(); },
  teleport: () => { const I = Icon(); I.glow(64, 84, 48, '#3ad6e8', .55); I.part('M64 10 C88 10 102 28 102 48 C102 76 64 112 64 112 C64 112 26 76 26 48 C26 28 40 10 64 10Z', 'red'); I.part(P.circle(64, 46, 14), 'parch', { ow: 3, bev: 1 });
    I.raw('<ellipse cx="64" cy="114" rx="38" ry="8" fill="none" stroke="#8cf0ff" stroke-width="4" stroke-opacity=".8"/>'); return I.svg(); },
};
