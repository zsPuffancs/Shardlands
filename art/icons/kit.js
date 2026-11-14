'use strict';
// Shardlands icon kit: painted-metal fantasy icons drawn as SVG code (original work, CC0).
// One family: 128 px canvas, 8 px safe padding, light from the top left, a dark ink outline, a soft drop shadow,
// bevelled edges (light inner rim top-left, dark inner rim bottom-right) and material gradients from one table.
let uid = 0;
const MAT = {
  steel:   ['#f4f6f8', '#b9c0c8', '#6b7480', '#2c323a'],
  dsteel:  ['#a9b0ba', '#6c7480', '#3a404a', '#16191e'],
  gold:    ['#fff4c4', '#f2c35a', '#b07a1e', '#5a3a08'],
  bronze:  ['#f0c896', '#b98450', '#7a4f26', '#3a240e'],
  wood:    ['#c08a58', '#8a5a32', '#5a3618', '#2a180a'],
  leather: ['#b07a50', '#7e5232', '#54341c', '#28180a'],
  dleather:['#7a5a44', '#523a28', '#33231a', '#170f0a'],
  red:     ['#ff9a8a', '#d23a32', '#8a1a18', '#3a0808'],
  blue:    ['#a8d8ff', '#3c8ae8', '#1a4a9a', '#081a40'],
  green:   ['#b8ffb0', '#3cc85a', '#1a7a32', '#08300f'],
  violet:  ['#e8c8ff', '#a45cf0', '#5a24a8', '#22083f'],
  amber:   ['#fff0b0', '#ffb43a', '#c2620e', '#5a2804'],
  cyan:    ['#c8fbff', '#3ad6e8', '#14809a', '#06303a'],
  parch:   ['#fff6dc', '#ecd6a4', '#bf9e62', '#6a5028'],
  bone:    ['#fffaf0', '#e4d8bc', '#a8977a', '#4a4030'],
  cloth:   ['#d8c4a4', '#9c8466', '#6a5640', '#2e2418'],
  stone:   ['#c8c4bc', '#8e8a82', '#5a5650', '#26241f'],
  ink:     ['#4a4a52', '#2a2a30', '#18181c', '#08080a'],
  flame:   ['#fffbe0', '#ffc23a', '#ff6a1a', '#a01a04'],
  frost:   ['#ffffff', '#c8ecff', '#6ab4e8', '#1a4a7a'],
};
const INK = '#0b0806';
// a four-stop ramp from one hex colour (for one-off materials)
const hx = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), toH = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const ramp = h => { const c = hx(h); return [toH(c.map(v => v + (255 - v) * .55)), h, toH(c.map(v => v * .6)), toH(c.map(v => v * .25))]; };
const M = m => MAT[m] || ramp(m);
function Icon() {
  const defs = [], body = [], id = p => p + (++uid);
  const grad = (m, ang = 35) => { const g = id('g'), c = M(m), a = ang * Math.PI / 180, x = Math.cos(a) * .5, y = Math.sin(a) * .5;
    defs.push(`<linearGradient id="${g}" x1="${.5 - x}" y1="${.5 - y}" x2="${.5 + x}" y2="${.5 + y}"><stop offset="0" stop-color="${c[0]}"/><stop offset=".3" stop-color="${c[1]}"/><stop offset=".72" stop-color="${c[2]}"/><stop offset="1" stop-color="${c[3]}"/></linearGradient>`); return g; };
  const api = {
    MAT,
    // a solid part: outline, material fill, bevel rims, form shading. d = SVG path data.
    part(d, m, o = {}) {
      const c = M(m), g = grad(m, o.ang ?? 55), cp = id('c'), w = o.ow ?? 5, bev = o.bev ?? 2.4;
      defs.push(`<clipPath id="${cp}"><path d="${d}"/></clipPath>`);
      const t = o.tf ? ` transform="${o.tf}"` : '';
      body.push(`<g${t}>` + (w ? `<path d="${d}" fill="${INK}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"/>` : '') +
        `<path d="${d}" fill="url(#${g})"/>` +
        `<g clip-path="url(#${cp})"><path d="${d}" fill="none" stroke="${c[0]}" stroke-opacity="${o.hi ?? .75}" stroke-width="${bev * 2}" transform="translate(${bev * .9} ${bev * .9})"/>` +
        `<path d="${d}" fill="none" stroke="${c[3]}" stroke-opacity=".8" stroke-width="${bev * 2}" transform="translate(${-bev * .9} ${-bev * .9})"/></g>` +
        (o.shine ? `<g clip-path="url(#${cp})">${o.shine}</g>` : '') + `</g>`);
      return cp;
    },
    // detail strokes that sit on a part (engraving, seams), optionally clipped to a part
    line(d, col = INK, w = 2, o = {}) { body.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${o.op ? ` stroke-opacity="${o.op}"` : ''}${o.clip ? ` clip-path="url(#${o.clip})"` : ''}/>`); },
    fill(d, col, o = {}) { body.push(`<path d="${d}" fill="${col}"${o.op ? ` fill-opacity="${o.op}"` : ''}${o.clip ? ` clip-path="url(#${o.clip})"` : ''}/>`); },
    // a cut gem: ink ring, faceted fill, sparkle
    gem(x, y, r, m) { const c = M(m), g = id('r'); defs.push(`<radialGradient id="${g}" cx=".38" cy=".34" r=".75"><stop offset="0" stop-color="${c[0]}"/><stop offset=".35" stop-color="${c[1]}"/><stop offset=".8" stop-color="${c[2]}"/><stop offset="1" stop-color="${c[3]}"/></radialGradient>`);
      body.push(`<circle cx="${x}" cy="${y}" r="${r + 2.4}" fill="${INK}"/><circle cx="${x}" cy="${y}" r="${r}" fill="url(#${g})"/><path d="M${x - r * .7} ${y} L${x} ${y - r * .7} L${x + r * .7} ${y} L${x} ${y + r * .7} Z" fill="#fff" fill-opacity=".14"/><circle cx="${x - r * .38}" cy="${y - r * .4}" r="${r * .26}" fill="#fff" fill-opacity=".9"/>`); },
    // soft coloured light (magic): additive-looking blurred blob
    glow(x, y, r, col, op = .7) { const g = id('l'); defs.push(`<radialGradient id="${g}"><stop offset="0" stop-color="${col}" stop-opacity="${op}"/><stop offset=".45" stop-color="${col}" stop-opacity="${op * .45}"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>`); body.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${g})"/>`); },
    spark(x, y, s, col = '#fff') { body.push(`<path d="M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s}Z" fill="${col}"/>`); },
    raw(s) { body.push(s); },
    svg(size = 128) { const sh = id('s');
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128"><defs><filter id="${sh}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceAlpha" stdDeviation="2.6"/><feOffset dx="1.5" dy="3" result="b"/><feComponentTransfer><feFuncA type="linear" slope=".55"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>${defs.join('')}</defs><g filter="url(#${sh})">${body.join('')}</g></svg>`; },
  };
  return api;
}
// path helpers
const P = {
  circle: (x, y, r) => `M${x - r} ${y} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0Z`,
  ring: (x, y, R, r) => P.circle(x, y, R) + ` M${x - r} ${y} a${r} ${r} 0 1 1 ${r * 2} 0 a${r} ${r} 0 1 1 ${-r * 2} 0Z`,
  rrect: (x, y, w, h, r) => `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`,
  poly: pts => 'M' + pts.map(p => p.join(' ')).join('L') + 'Z',
  // rotate a list of points about c by a (radians)
  rot: (pts, c, a) => pts.map(([x, y]) => [c[0] + (x - c[0]) * Math.cos(a) - (y - c[1]) * Math.sin(a), c[1] + (x - c[0]) * Math.sin(a) + (y - c[1]) * Math.cos(a)].map(v => +v.toFixed(2))),
};
module.exports = { Icon, P, MAT, INK };
