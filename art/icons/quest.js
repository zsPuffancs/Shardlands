'use strict';
// Quests and the Adventurer's Journal.
const { Icon, P } = require('./kit');
module.exports = {
  contract: () => { const I = Icon();
    I.part('M22 12 L98 12 Q108 12 108 22 L108 116 L22 116Z', 'parch'); for (let i = 0; i < 5; i++) I.line(`M34 ${32 + i * 13} L${i === 4 ? 70 : 94} ${32 + i * 13}`, '#6a5028', 3, { op: .75 });
    I.part('M70 96 L62 124 L74 116 L82 126 L84 98Z', 'red', { bev: 1 }); I.part(P.circle(82, 92, 15), 'red'); I.part(P.circle(82, 92, 8), 'red', { ow: 2, bev: 1.2 }); return I.svg(); },
  bestiary: () => { const I = Icon();
    I.part('M16 14 L104 14 Q112 14 112 22 L112 116 L24 116 Q16 116 16 108Z', 'dleather');
    I.part('M24 14 L28 14 L28 116 L24 116Z', 'gold', { ow: 2, bev: .8 });
    I.part('M68 36 C88 36 96 48 96 62 C96 72 90 76 86 78 L86 90 L50 90 L50 78 C46 76 40 72 40 62 C40 48 48 36 68 36Z', 'bone', { bev: 1.4 });
    I.fill('M52 58 Q60 54 64 62 Q60 70 54 68Z M84 58 Q76 54 72 62 Q76 70 82 68Z', '#0b0806'); return I.svg(); },
  reward: () => { const I = Icon(); I.glow(64, 70, 54, '#ffd86a', .4);
    I.part('M20 52 L108 52 L108 116 L20 116Z', 'wood'); I.part('M14 36 L114 36 L114 56 L14 56Z', 'wood', { bev: 1.4 });
    I.part('M58 36 L70 36 L70 116 L58 116Z', 'gold', { ow: 3, bev: 1 }); I.part('M14 44 L114 44 L114 50 L14 50Z', 'gold', { ow: 2, bev: .6 });
    I.part('M64 36 Q40 4 34 22 Q34 34 64 36 Q94 34 94 22 Q88 4 64 36Z', 'red', { bev: 1.2 }); return I.svg(); },
};
