'use strict';
// NPCs and interaction points (world labels, window titles, journal).
const { Icon, P } = require('./kit');
module.exports = {
  merchant: () => { const I = Icon();
    I.part('M30 36 Q30 22 46 22 L82 22 Q98 22 98 36 L104 50 L24 50Z', 'dleather', { bev: 1.4 });
    I.part('M22 50 Q64 40 106 50 L116 96 Q118 118 96 118 L32 118 Q10 118 12 96Z', 'leather');
    I.line('M40 22 Q64 6 88 22', '#2a180a', 5); I.part(P.circle(64, 84, 20), 'gold'); I.part('M58 74 L70 74 L70 94 L58 94Z', 'gold', { ow: 2.5, bev: .8 });
    I.spark(104, 20, 7); return I.svg(); },
  smith: () => { const I = Icon();
    I.part('M12 92 L116 92 L104 104 L104 116 L24 116 L24 104Z', 'dsteel');
    I.part('M8 76 L120 76 L120 92 L8 92Z', 'dsteel', { bev: 1.6 });
    I.part('M84 10 L98 24 L60 62 L46 48Z', 'wood', { ow: 4 }); I.part('M30 20 L60 6 L78 24 L64 38 L50 30Z', 'steel');
    I.spark(100, 52, 6, '#ffd86a'); I.spark(84, 62, 4, '#ffd86a'); return I.svg(); },
  mystic: () => { const I = Icon();
    I.part('M30 100 L98 100 L110 118 L18 118Z', 'gold'); I.glow(64, 56, 54, '#b46aff', .7);
    I.part(P.circle(64, 56, 42), 'violet'); I.raw('<path d="M44 42 Q64 26 84 42" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="6" stroke-linecap="round"/>');
    I.spark(64, 60, 12, '#f4e6ff'); I.spark(84, 72, 5, '#f4e6ff'); return I.svg(); },
  portal: () => { const I = Icon();
    I.part('M20 118 L20 56 Q20 10 64 10 Q108 10 108 56 L108 118 L90 118 L90 58 Q90 28 64 28 Q38 28 38 58 L38 118Z', 'stone');
    I.glow(64, 74, 40, '#3ad6e8', .8); I.part('M38 118 L38 58 Q38 28 64 28 Q90 28 90 58 L90 118Z', 'cyan', { ow: 0, bev: 2.2 });
    I.line('M64 50 Q80 60 70 76 Q60 92 76 104', '#e8ffff', 4, { op: .8 }); I.gem(64, 18, 6, 'amber'); return I.svg(); },
  camp: () => { const I = Icon();
    I.part('M64 12 L118 110 L10 110Z', 'cloth'); I.part('M64 12 L84 110 L44 110Z', 'dleather', { bev: 1.4 }); I.fill('M56 110 L64 66 L72 110Z', '#0b0806');
    I.part('M60 4 L68 4 L66 20 L62 20Z', 'wood', { ow: 3, bev: 1 }); I.part('M68 4 L94 10 L68 18Z', 'red', { ow: 3, bev: 1 }); I.part(P.rrect(4, 108, 120, 10, 3), 'wood', { bev: 1 }); return I.svg(); },
  board: () => { const I = Icon();
    I.part('M24 70 L34 70 L34 122 L24 122Z M94 70 L104 70 L104 122 L94 122Z', 'wood');
    I.part(P.rrect(10, 10, 108, 72, 4), 'wood'); I.part(P.rrect(18, 18, 92, 56, 2), 'bronze', { bev: 1.2 });
    I.part('M26 24 L58 22 L60 66 L28 68Z', 'parch', { bev: 1.2 }); I.part('M68 26 L100 28 L98 58 L66 56Z', 'parch', { bev: 1.2 });
    for (const [x, y] of [[42, 26], [84, 30]]) I.part(P.circle(x, y, 3.5), 'red', { ow: 2, bev: .8 }); return I.svg(); },
};
