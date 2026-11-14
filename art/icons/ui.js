'use strict';
// Interface markers: confirmations, ratings, warnings, leadership. Simple strong shapes for 14-20 px.
const { Icon, P } = require('./kit');
const star = (r1, r2) => { const pts = []; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? r2 : r1; pts.push([64 + Math.cos(a) * r, 66 + Math.sin(a) * r]); } return P.poly(pts.map(p => p.map(v => +v.toFixed(2)))); };
module.exports = {
  check: () => { const I = Icon(); I.part('M14 66 L34 46 L54 66 L96 20 L116 40 L54 106Z', 'green'); return I.svg(); },
  cross: () => { const I = Icon(); I.part('M20 36 L36 20 L64 48 L92 20 L108 36 L80 64 L108 92 L92 108 L64 80 L36 108 L20 92 L48 64Z', 'red'); return I.svg(); },
  star: () => { const I = Icon(); I.glow(64, 66, 52, '#ffd86a', .45); I.part(star(56, 24), 'gold'); return I.svg(); },
  'star-empty': () => { const I = Icon(); I.part(star(56, 24), 'dsteel'); I.part(star(38, 16), 'ink', { ow: 0, bev: 1 }); return I.svg(); },
  warning: () => { const I = Icon(); I.part('M64 8 L122 112 Q124 118 116 118 L12 118 Q4 118 6 112Z', 'amber'); I.part('M58 40 L70 40 L68 84 L60 84Z', 'ink', { ow: 0, bev: .6 }); I.part(P.circle(64, 98, 7), 'ink', { ow: 0, bev: .6 }); return I.svg(); },
  merge: () => { const I = Icon(); I.glow(64, 74, 44, '#b46aff', .45);
    I.part('M10 14 L40 14 L64 52 L88 14 L118 14 L76 74 L76 116 L52 116 L52 74Z', 'steel'); I.gem(64, 92, 12, 'violet'); return I.svg(); },
  compass: () => { const I = Icon(); I.part(P.circle(64, 64, 56), 'bronze'); I.part(P.circle(64, 64, 44), 'parch', { bev: 1.6 });
    I.part('M64 18 L76 64 L64 110 L52 64Z', 'steel', { ow: 3, bev: 1.2 }); I.part('M64 18 L76 64 L52 64Z', 'red', { ow: 0, bev: 1 }); I.part(P.circle(64, 64, 6), 'gold', { ow: 2.5, bev: 1 }); return I.svg(); },
  crown: () => { const I = Icon(); I.glow(64, 70, 54, '#ffd86a', .35);
    I.part('M12 40 L38 64 L64 22 L90 64 L116 40 L104 104 L24 104Z', 'gold'); I.part(P.rrect(20, 98, 88, 16, 4), 'gold', { bev: 1.4 });
    I.gem(64, 76, 9, 'red'); I.gem(38, 82, 5.5, 'blue'); I.gem(90, 82, 5.5, 'blue'); for (const [x, y] of [[12, 40], [64, 22], [116, 40]]) I.part(P.circle(x, y, 6), 'gold', { ow: 3, bev: 1 }); return I.svg(); },
  search: () => { const I = Icon(); I.part('M76 82 L88 70 L120 102 L108 114Z', 'wood'); I.part(P.ring(54, 54, 42, 30), 'steel'); I.part(P.circle(54, 54, 30), '#58b8ff', { ow: 0, bev: 1 }); I.raw('<circle cx="44" cy="44" r="8" fill="#fff" fill-opacity=".6"/>'); return I.svg(); },
  info: () => { const I = Icon(); I.part(P.circle(64, 64, 56), 'blue'); I.part(P.rrect(56, 54, 16, 44, 3), 'parch', { ow: 2.5, bev: 1 }); I.part(P.circle(64, 36, 9), 'parch', { ow: 2.5, bev: 1 }); return I.svg(); },
};
