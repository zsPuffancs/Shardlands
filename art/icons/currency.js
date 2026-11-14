'use strict';
const { Icon, P } = require('./kit');
module.exports = {
  gold: () => { const I = Icon();
    const coin = (x, y, r) => { I.part(P.circle(x, y, r), 'gold'); I.line(P.circle(x, y, r * .72), '#7a5210', 2.2, { op: .9 }); I.part(`M${x} ${y - r * .42} L${x + r * .36} ${y} L${x} ${y + r * .42} L${x - r * .36} ${y}Z`, 'gold', { ow: 2.4, bev: 1 }); };
    coin(42, 82, 30); coin(86, 90, 28); coin(66, 46, 32); I.spark(98, 26, 8); I.spark(22, 50, 5); return I.svg(); },
  souls: () => { const I = Icon();
    I.glow(64, 70, 58, '#a45cf0', .6);
    I.part('M64 8 C76 30 98 42 98 74 C98 100 82 118 64 118 C46 118 30 100 30 74 C30 56 40 48 46 34 C50 50 56 52 58 46 C58 32 60 20 64 8Z', 'violet');
    I.part('M66 52 C74 64 84 72 84 88 C84 102 76 110 64 110 C52 110 44 102 44 88 C44 76 54 70 58 62 C62 70 66 68 66 52Z', '#f4e6ff', { ow: 0, bev: 1.4 });
    I.raw('<circle cx="58" cy="88" r="3.4" fill="#2a0e4a"/><circle cx="72" cy="88" r="3.4" fill="#2a0e4a"/>');
    I.spark(100, 26, 7, '#f0dcff'); I.spark(26, 40, 4, '#f0dcff'); return I.svg(); },
};
