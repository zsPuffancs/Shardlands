'use strict';
// Equipment: one icon per item type. Rarity is shown by the slot frame and glow (design tokens), not by recolouring.
const { Icon, P } = require('./kit');
const D45 = Math.PI / 4;
module.exports = {
  sword() { const I = Icon(), c = [64, 64], R = pts => P.poly(P.rot(pts, c, D45));
    // blade (with fuller), crossguard, grip, pommel, laid diagonally
    I.part(R([[58, 6], [70, 6], [72, 80], [64, 92], [56, 80]].map(([x, y]) => [x, y + 4])), 'steel', { ang: 0 });
    I.line(P.poly(P.rot([[64, 18], [64, 80]], c, D45)).replace('Z', ''), '#5a626c', 3, { op: .9 });
    I.line(P.poly(P.rot([[63, 18], [63, 80]], c, D45)).replace('Z', ''), '#ffffff', 1, { op: .6 });
    I.part(R([[40, 84], [88, 84], [92, 90], [88, 96], [40, 96], [36, 90]]), 'gold');
    I.part(R([[59, 96], [69, 96], [69, 116], [59, 116]]), 'dleather', { bev: 1.6 });
    for (let i = 0; i < 4; i++) I.line(P.poly(P.rot([[59, 100 + i * 4.5], [69, 98 + i * 4.5]], c, D45)).replace('Z', ''), '#0b0806', 1.6, { op: .7 });
    const pm = P.rot([[64, 121]], c, D45)[0]; I.part(P.circle(pm[0], pm[1], 7), 'gold'); I.gem(pm[0], pm[1], 3.2, 'red');
    I.spark(28, 30, 6); return I.svg(); },
  bow() { const I = Icon();
    I.part('M40 10 Q96 30 96 64 Q96 98 40 118 L36 112 Q86 94 86 64 Q86 34 36 16 Z', 'wood', { ang: 0 });
    I.part(P.rrect(82, 54, 16, 20, 3), 'dleather', { bev: 1.6 });
    I.part('M33 9 L44 9 L44 19 L33 17Z', 'gold', { bev: 1.4 }); I.part('M33 119 L44 119 L44 109 L33 111Z', 'gold', { bev: 1.4 });
    I.line('M38 14 L38 114', '#e8dcc0', 1.8);
    // nocked arrow
    I.part('M30 62 H104 V66 H30Z', 'wood', { ow: 3, bev: 1 }); I.part('M100 56 L118 64 L100 72 Z', 'steel', { bev: 1.4 });
    I.part('M18 56 L34 62 L34 66 L18 72 L24 64Z', 'red', { bev: 1.4 }); return I.svg(); },
  staff() { const I = Icon(), c = [64, 64], R = pts => P.poly(P.rot(pts, c, D45 * .9));
    I.part(R([[60, 34], [68, 34], [67, 124], [61, 124]]), 'wood', { ang: 0 });
    for (const y of [60, 92]) I.part(R([[58, y], [70, y], [70, y + 6], [58, y + 6]]), 'gold', { bev: 1.2 });
    const h = P.rot([[64, 22]], c, D45 * .9)[0];
    I.glow(h[0], h[1], 34, '#b46aff', .8);
    I.part(R([[50, 40], [64, 30], [78, 40], [74, 46], [64, 40], [54, 46]]), 'gold');
    I.part(R([[64, 2], [76, 20], [64, 38], [52, 20]]), 'violet', { bev: 2.2 });
    I.line(R([[64, 4], [64, 36]]).replace('Z', ''), '#ffffff', 1.2, { op: .5 });
    I.spark(h[0] + 16, h[1] - 16, 7); I.spark(h[0] - 18, h[1] + 10, 4, '#e8c8ff'); return I.svg(); },
  helm() { const I = Icon();
    I.part('M64 10 C96 10 110 34 110 64 L110 96 Q110 110 98 112 L82 112 L80 74 L48 74 L46 112 L30 112 Q18 110 18 96 L18 64 C18 34 32 10 64 10Z', 'steel');
    I.part('M58 74 L70 74 L70 102 L64 108 L58 102Z', 'steel', { bev: 1.6 }); // nasal guard
    I.part('M22 60 Q64 52 106 60 L106 70 Q64 62 22 70 Z', 'gold', { bev: 1.6 });
    I.part('M60 4 L68 4 L70 58 L58 58 Z', 'gold', { bev: 1.6 }); // crest ridge
    for (const x of [30, 44, 84, 98]) I.part(P.circle(x, 65, 2.6), 'gold', { ow: 2, bev: .8 });
    I.fill('M48 74 L58 74 L58 102 L46 112Z M80 74 L70 74 L70 102 L82 112Z', '#050403', { op: .85 });
    I.spark(40, 26, 5); return I.svg(); },
  armor() { const I = Icon();
    I.part('M40 14 L54 20 Q64 26 74 20 L88 14 L114 28 L108 58 L96 56 L96 112 Q64 122 32 112 L32 56 L20 58 L14 28Z', 'steel');
    I.part('M14 28 L40 14 L46 24 L22 40Z', 'gold', { bev: 1.4 }); I.part('M114 28 L88 14 L82 24 L106 40Z', 'gold', { bev: 1.4 });
    I.line('M64 30 L64 112', '#3a404a', 2.4); I.line('M40 60 Q64 72 88 60', '#3a404a', 2.4); I.line('M38 84 Q64 94 90 84', '#3a404a', 2.4);
    I.part('M30 96 Q64 108 98 96 L98 104 Q64 116 30 104Z', 'leather', { bev: 1.2 });
    I.part(P.rrect(58, 94, 12, 14, 2), 'gold', { bev: 1 });
    I.gem(64, 46, 6, 'red'); I.spark(36, 36, 5); return I.svg(); },
  boots() { const I = Icon();
    I.part('M30 12 L66 12 L66 76 Q66 82 72 84 L106 94 Q118 98 116 110 L114 116 L30 116 Q24 116 24 108 L24 80 L30 70Z', 'leather');
    I.part('M26 12 L70 12 L70 26 L26 26Z', 'dleather', { bev: 1.4 });
    I.part('M22 104 L118 104 L116 118 L26 118 Q22 118 22 112Z', 'dleather', { bev: 1.2 });
    I.part('M72 84 L106 94 Q118 98 116 108 L96 106 Q90 92 72 92Z', 'steel', { bev: 1.4 });
    for (let i = 0; i < 4; i++) I.line(`M32 ${36 + i * 10} L60 ${36 + i * 10}`, '#d8b58a', 2, { op: .55 });
    I.part(P.circle(46, 19, 3), 'gold', { ow: 2, bev: .8 }); return I.svg(); },
  ring() { const I = Icon();
    I.part(P.ring(64, 76, 40, 28), 'gold');
    I.part('M44 44 L52 30 L76 30 L84 44 L64 52Z', 'gold', { bev: 1.6 });
    I.gem(64, 30, 15, 'red'); I.spark(96, 18, 7); I.spark(26, 64, 4); return I.svg(); },
  amulet() { const I = Icon();
    I.line('M26 8 Q20 52 52 66', '#3a2c1c', 6); I.line('M102 8 Q108 52 76 66', '#3a2c1c', 6);
    I.line('M26 8 Q20 52 52 66', '#d8b060', 2.4, { op: .9 }); I.line('M102 8 Q108 52 76 66', '#d8b060', 2.4, { op: .9 });
    I.part('M64 52 L96 76 L84 116 L44 116 L32 76Z', 'gold');
    I.part('M64 60 L86 78 L78 106 L50 106 L42 78Z', 'dsteel', { bev: 1.2 });
    I.glow(64, 86, 30, '#3ad6e8', .55);
    I.gem(64, 85, 13, 'cyan'); I.spark(98, 50, 6); return I.svg(); },
};
