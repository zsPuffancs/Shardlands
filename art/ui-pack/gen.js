// Shardlands UI pack generator: writes standalone SVGs, renders PNG @1x/@2x, builds a preview sheet.
// usage: node gen.js <outDir> <icons.js>
const fs = require('fs'), path = require('path'), vm = require('vm');
const OUT = process.argv[2], ICONS_JS = process.argv[3];
const P = { gold: '#e8bf55', goldL: '#fff0b8', goldD: '#8a5a12', bronze: '#6b5233', bronzeD: '#3a2c1c', ink: '#120d08', in1: '#2a2119', in2: '#16110c', txt: '#f1e7d4' };
const RAR = { common: '#c9ccd2', uncommon: '#4ee26a', rare: '#4da3ff', epic: '#b25cff', legendary: '#ff9d2e', mythic: '#ff4560', set: '#38e0a8', unique: '#ffd35a' };

const DEFS = `
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.goldL}"/><stop offset=".45" stop-color="${P.gold}"/><stop offset="1" stop-color="${P.goldD}"/></linearGradient>
<linearGradient id="goldH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${P.goldD}"/><stop offset=".5" stop-color="${P.goldL}"/><stop offset="1" stop-color="${P.goldD}"/></linearGradient>
<linearGradient id="bronze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a6a42"/><stop offset="1" stop-color="${P.bronzeD}"/></linearGradient>
<linearGradient id="inner" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.in1}"/><stop offset="1" stop-color="${P.in2}"/></linearGradient>
<radialGradient id="vign" cx=".5" cy=".42" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>
<linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".5" stop-color="#fff" stop-opacity=".06"/><stop offset=".51" stop-color="#000" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>
<radialGradient id="gemShine" cx=".35" cy=".3" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></radialGradient>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .4  0 0 0 0 .3  0 0 0 .09 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>`;
const svg = (w, h, body, extraDefs = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${DEFS}${extraDefs}</defs>${body}</svg>`;
const gem = (x, y, r, c) => `<circle cx="${x}" cy="${y}" r="${r + 1.2}" fill="${P.ink}"/><circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${x}" cy="${y}" r="${r}" fill="url(#gemShine)"/>`;
// one corner ornament drawn in the top-left corner (mirrored for the others)
const cornerOrn = (s, c) => `<path d="M4 ${s * .62} L4 10 Q4 4 10 4 L${s * .62} 4" fill="none" stroke="url(#gold)" stroke-width="3"/>
  <path d="M9 ${s * .5} Q9 9 ${s * .5} 9" fill="none" stroke="${P.goldD}" stroke-width="1.4"/>
  <path d="M5 5 L${s * .33} 5 L${s * .2} ${s * .2} L5 ${s * .33} Z" fill="url(#gold)" stroke="${P.ink}" stroke-width="1"/>${gem(s * .17, s * .17, s * .07, c)}`;
const corners = (w, h, s, c) => ['', `translate(${w} 0) scale(-1 1)`, `translate(0 ${h}) scale(1 -1)`, `translate(${w} ${h}) scale(-1 -1)`].map(t => `<g transform="${t}">${cornerOrn(s, c)}</g>`).join('');

const A = {}; // name -> {w,h,svg,slice?,note}
const add = (name, w, h, body, meta = {}, defs = '') => { A[name] = Object.assign({ w, h, svg: svg(w, h, body, defs) }, meta); };

// ---------- frames (9-slice) ----------
function frame(name, S, cut, gemC, opts = {}) {
  const r = opts.r || 10, pad = 3;
  add(name, S, S, `
  <rect x="1" y="1" width="${S - 2}" height="${S - 2}" rx="${r + 2}" fill="${P.ink}"/>
  <rect x="${pad}" y="${pad}" width="${S - pad * 2}" height="${S - pad * 2}" rx="${r}" fill="url(#inner)"/>
  <rect x="${pad}" y="${pad}" width="${S - pad * 2}" height="${S - pad * 2}" rx="${r}" fill="#000" filter="url(#grain)"/>
  <rect x="${pad}" y="${pad}" width="${S - pad * 2}" height="${S - pad * 2}" rx="${r}" fill="url(#vign)"/>
  <rect x="${pad + .5}" y="${pad + .5}" width="${S - pad * 2 - 1}" height="${S - pad * 2 - 1}" rx="${r}" fill="none" stroke="url(#bronze)" stroke-width="3"/>
  <rect x="${pad + 4}" y="${pad + 4}" width="${S - pad * 2 - 8}" height="${S - pad * 2 - 8}" rx="${r - 3}" fill="none" stroke="${P.gold}" stroke-opacity=".35" stroke-width="1"/>
  <line x1="${cut}" y1="${pad + 1.2}" x2="${S - cut}" y2="${pad + 1.2}" stroke="#ffe9a8" stroke-opacity=".35" stroke-width="1"/>
  ${opts.noCorners ? '' : corners(S, S, cut, gemC)}`, { slice: cut, note: '9-slice: border-image-slice ' + cut + ' fill; border-width ' + cut + 'px' });
}
frame('panel', 128, 40, '#d8423a');
frame('panel-plain', 96, 24, '', { noCorners: true, r: 8 });
frame('tooltip', 96, 28, '#4da3ff', { r: 7 });

// window title plate (3-slice horizontally)
add('panel-header', 192, 40, `
  <path d="M14 4 L178 4 L188 20 L178 36 L14 36 L4 20 Z" fill="${P.ink}"/>
  <path d="M16 7 L176 7 L184 20 L176 33 L16 33 L8 20 Z" fill="url(#bronze)"/>
  <path d="M16 7 L176 7 L184 20 L176 33 L16 33 L8 20 Z" fill="none" stroke="url(#gold)" stroke-width="2"/>
  <path d="M22 11 L170 11" stroke="#fff" stroke-opacity=".25"/>${gem(16, 20, 3.4, '#d8423a')}${gem(176, 20, 3.4, '#d8423a')}`, { slice: '0 30', note: '3-slice: border-image-slice 0 30 fill' });

// ---------- buttons ----------
function button(name, top, bot, rim, txtGlow) {
  add(name, 96, 36, `
  <rect x="1" y="1" width="94" height="34" rx="8" fill="${P.ink}"/>
  <rect x="2.5" y="2.5" width="91" height="31" rx="7" fill="url(#b_${name})"/>
  <rect x="2.5" y="2.5" width="91" height="31" rx="7" fill="url(#gloss)" opacity=".7"/>
  <rect x="2.5" y="2.5" width="91" height="31" rx="7" fill="none" stroke="${rim}" stroke-width="1.6"/>
  <path d="M10 4.6 L86 4.6" stroke="#fff" stroke-opacity="${txtGlow}" stroke-width="1"/>`, { slice: 12, note: '9-slice: border-image-slice 12 fill' },
  `<linearGradient id="b_${name}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient>`);
}
button('button', '#4a3a28', '#241a11', P.bronze, .25);
button('button-hover', '#5e4a32', '#2e2216', P.gold, .35);
button('button-pressed', '#1e160e', '#3a2c1c', P.goldD, .05);
button('button-disabled', '#2a2622', '#1a1816', '#4a4440', .08);
button('button-primary', '#d9a63e', '#7a4f12', P.goldL, .6);
button('button-danger', '#a8382e', '#4a120c', '#ff9a7a', .4);
// round icon button + close
add('button-round', 40, 40, `<circle cx="20" cy="20" r="19" fill="${P.ink}"/><circle cx="20" cy="20" r="17" fill="url(#bronze)"/><circle cx="20" cy="20" r="17" fill="url(#gloss)" opacity=".6"/><circle cx="20" cy="20" r="17" fill="none" stroke="url(#gold)" stroke-width="2"/><circle cx="20" cy="20" r="13" fill="url(#inner)"/>`);
add('close', 28, 28, `<circle cx="14" cy="14" r="13" fill="${P.ink}"/><circle cx="14" cy="14" r="11.5" fill="#6a1a14"/><circle cx="14" cy="14" r="11.5" fill="url(#gloss)" opacity=".6"/><circle cx="14" cy="14" r="11.5" fill="none" stroke="url(#gold)" stroke-width="1.6"/><path d="M9.5 9.5 L18.5 18.5 M18.5 9.5 L9.5 18.5" stroke="${P.txt}" stroke-width="2.6" stroke-linecap="round"/>`);
// tabs
add('tab', 96, 32, `<path d="M2 32 L2 10 Q2 3 9 3 L87 3 Q94 3 94 10 L94 32" fill="url(#inner)" stroke="${P.bronze}" stroke-width="2"/>`, { slice: '12 12 4 12', note: '9-slice: border-image-slice 12 12 4 12 fill' });
add('tab-active', 96, 32, `<path d="M2 32 L2 10 Q2 3 9 3 L87 3 Q94 3 94 10 L94 32" fill="url(#bronze)" stroke="url(#gold)" stroke-width="2"/><path d="M10 6 L86 6" stroke="#fff" stroke-opacity=".3"/>`, { slice: '12 12 4 12', note: '9-slice: border-image-slice 12 12 4 12 fill' });

// ---------- bars ----------
add('bar-frame', 160, 22, `<rect x="1" y="1" width="158" height="20" rx="6" fill="${P.ink}"/><rect x="2.5" y="2.5" width="155" height="17" rx="5" fill="#0a0806"/><rect x="2.5" y="2.5" width="155" height="17" rx="5" fill="none" stroke="url(#gold)" stroke-width="1.5"/>`, { slice: 8, note: '9-slice frame; put the fill image inside with 3px inset' });
function fill(name, top, mid, bot) {
  add(name, 160, 16, `<rect width="160" height="16" fill="url(#f_${name})"/><rect width="160" height="7" fill="#fff" opacity=".22"/><rect y="14.5" width="160" height="1.5" fill="#000" opacity=".35"/>`, { note: 'stretch horizontally (background-size:100% 100%)' },
    `<linearGradient id="f_${name}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset=".5" stop-color="${mid}"/><stop offset="1" stop-color="${bot}"/></linearGradient>`);
}
fill('bar-fill-hp', '#ff7a6a', '#c8261c', '#6a0c08');
fill('bar-fill-mp', '#7ab8ff', '#2a62d0', '#0c2462');
fill('bar-fill-xp', '#ffe48a', '#d9a32e', '#6a4a0c');
fill('bar-fill-stamina', '#a8f08a', '#3aa83a', '#0c4a12');
fill('bar-fill-boss', '#ff9a4a', '#c8401c', '#5a0c08');
fill('bar-fill-shield', '#e0f4ff', '#8ab8d8', '#2a4a62');
// globes (Diablo-style HP / MP orbs, liquid drawn by the game as a clipped circle)
function globe(name, c1, c2) {
  add(name, 128, 128, `<circle cx="64" cy="64" r="62" fill="${P.ink}"/><circle cx="64" cy="64" r="56" fill="url(#g_${name})"/>
  <ellipse cx="50" cy="40" rx="28" ry="18" fill="#fff" opacity=".22"/><circle cx="64" cy="64" r="56" fill="url(#vign)"/>
  <circle cx="64" cy="64" r="58" fill="none" stroke="url(#gold)" stroke-width="5"/><circle cx="64" cy="64" r="53" fill="none" stroke="${P.goldD}" stroke-width="1.5"/>
  ${[0, 90, 180, 270].map(a => `<g transform="rotate(${a} 64 64)"><path d="M58 2 L64 12 L70 2 Z" fill="url(#gold)" stroke="${P.ink}"/></g>`).join('')}`, { note: 'full globe; overlay globe-glass on top of a clipped liquid fill' },
  `<radialGradient id="g_${name}" cx=".5" cy=".6" r=".6"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient>`);
}
globe('globe-hp', '#ff4a3a', '#5a0806'); globe('globe-mp', '#4a8aff', '#06184a');
add('globe-frame', 128, 128, `<circle cx="64" cy="64" r="58" fill="none" stroke="${P.ink}" stroke-width="9"/><circle cx="64" cy="64" r="58" fill="none" stroke="url(#gold)" stroke-width="5"/><circle cx="64" cy="64" r="53" fill="none" stroke="${P.goldD}" stroke-width="1.5"/><ellipse cx="48" cy="38" rx="26" ry="15" fill="#fff" opacity=".18"/>${[0, 90, 180, 270].map(a => `<g transform="rotate(${a} 64 64)"><path d="M58 2 L64 12 L70 2 Z" fill="url(#gold)" stroke="${P.ink}"/></g>`).join('')}`, { note: 'transparent centre: draw your own liquid below it' });

// ---------- slots ----------
function slot(name, c, glow) {
  add(name, 64, 64, `<rect x="1" y="1" width="62" height="62" rx="9" fill="${P.ink}"/>
  <rect x="3" y="3" width="58" height="58" rx="8" fill="url(#s_${name})"/>
  ${glow ? `<rect x="5" y="5" width="54" height="54" rx="7" fill="none" stroke="${c}" stroke-width="6" opacity=".35" filter="url(#glow)"/>` : ''}
  <rect x="3.5" y="3.5" width="57" height="57" rx="8" fill="none" stroke="${c}" stroke-width="2"/>
  <rect x="6.5" y="6.5" width="51" height="51" rx="6" fill="none" stroke="#000" stroke-opacity=".5"/>
  <path d="M3 13 L3 3 L13 3 M51 3 L61 3 L61 13 M61 51 L61 61 L51 61 M13 61 L3 61 L3 51" fill="none" stroke="url(#gold)" stroke-width="2.4"/>`, {},
  `<radialGradient id="s_${name}" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="${glow ? c : '#3a2c1e'}" stop-opacity="${glow ? .28 : 1}"/><stop offset=".5" stop-color="#2a2016"/><stop offset="1" stop-color="#0e0a07"/></radialGradient>`);
}
slot('slot', P.bronze, false);
for (const k in RAR) slot('slot-' + k, RAR[k], k !== 'common');
add('slot-hover', 64, 64, `<rect x="2.5" y="2.5" width="59" height="59" rx="8.5" fill="#fff" opacity=".08"/><rect x="2.5" y="2.5" width="59" height="59" rx="8.5" fill="none" stroke="${P.goldL}" stroke-width="2"/>`, { note: 'overlay' });
add('slot-cooldown', 64, 64, `<rect x="3" y="3" width="58" height="58" rx="8" fill="#000" opacity=".6"/>`, { note: 'overlay; mask it with a conic-gradient for the sweep' });
// hotbar
add('hotbar', 512, 80, `<path d="M20 8 L492 8 Q504 8 504 20 L504 72 L8 72 L8 20 Q8 8 20 8 Z" fill="${P.ink}"/>
  <path d="M22 11 L490 11 Q501 11 501 22 L501 70 L11 70 L11 22 Q11 11 22 11 Z" fill="url(#inner)"/><path d="M22 11 L490 11 Q501 11 501 22 L501 70 L11 70 L11 22 Q11 11 22 11 Z" fill="#000" filter="url(#grain)"/>
  <path d="M22 11 L490 11 Q501 11 501 22 L501 70 L11 70 L11 22 Q11 11 22 11 Z" fill="none" stroke="url(#gold)" stroke-width="2.5"/>
  <path d="M236 8 L256 0 L276 8" fill="url(#gold)" stroke="${P.ink}"/>${gem(256, 6, 3.6, '#d8423a')}`, { slice: '24', note: '9-slice: border-image-slice 24 fill' });
add('keycap', 22, 18, `<rect x=".5" y=".5" width="21" height="17" rx="4" fill="${P.ink}"/><rect x="1.5" y="1.5" width="19" height="14" rx="3" fill="url(#bronze)"/><rect x="1.5" y="1.5" width="19" height="14" rx="3" fill="none" stroke="url(#gold)"/>`, { slice: 6, note: 'key label background, 9-slice 6' });

// ---------- minimap, portrait, nameplate ----------
add('minimap-frame', 256, 256, `<circle cx="128" cy="128" r="120" fill="none" stroke="${P.ink}" stroke-width="14"/><circle cx="128" cy="128" r="120" fill="none" stroke="url(#gold)" stroke-width="8"/>
  <circle cx="128" cy="128" r="113" fill="none" stroke="${P.goldD}" stroke-width="2"/><circle cx="128" cy="128" r="126" fill="none" stroke="${P.goldD}" stroke-width="1.5"/>
  ${Array.from({ length: 36 }, (_, i) => `<line x1="128" y1="${i % 9 ? 6 : 2}" x2="128" y2="${i % 9 ? 11 : 14}" stroke="${P.goldL}" stroke-width="${i % 9 ? 1.2 : 2.4}" transform="rotate(${i * 10} 128 128)"/>`).join('')}
  <path d="M116 0 L128 20 L140 0 Z" fill="#d8423a" stroke="${P.ink}" stroke-width="1.5"/>
  <g transform="translate(128 0)"><text y="16" text-anchor="middle" font-family="Georgia,serif" font-size="13" font-weight="700" fill="${P.ink}">N</text></g>`, { note: 'transparent centre (radius 112): draw the map underneath, clip to a circle' });
add('portrait-frame', 112, 112, `<circle cx="56" cy="56" r="50" fill="none" stroke="${P.ink}" stroke-width="10"/><circle cx="56" cy="56" r="50" fill="none" stroke="url(#gold)" stroke-width="5"/><circle cx="56" cy="56" r="45" fill="none" stroke="${P.goldD}" stroke-width="1.5"/>
  <circle cx="90" cy="92" r="16" fill="${P.ink}"/><circle cx="90" cy="92" r="14" fill="url(#bronze)"/><circle cx="90" cy="92" r="14" fill="none" stroke="url(#gold)" stroke-width="2"/>`, { note: 'transparent centre; level number goes in the badge at (90,92)' });
add('nameplate', 160, 28, `<path d="M10 2 L150 2 L158 14 L150 26 L10 26 L2 14 Z" fill="${P.ink}" opacity=".85"/><path d="M12 4.5 L148 4.5 L154.5 14 L148 23.5 L12 23.5 L5.5 14 Z" fill="none" stroke="url(#goldH)" stroke-width="1.4"/>`, { slice: '0 16', note: '3-slice: border-image-slice 0 16 fill' });
add('badge-level', 40, 40, `<path d="M20 1 L37 10 L37 30 L20 39 L3 30 L3 10 Z" fill="${P.ink}"/><path d="M20 4 L34 11.5 L34 28.5 L20 36 L6 28.5 L6 11.5 Z" fill="url(#bronze)" stroke="url(#gold)" stroke-width="2"/>`);
add('badge-boss', 40, 40, `<path d="M4 30 L8 10 L15 20 L20 6 L25 20 L32 10 L36 30 Z" fill="url(#gold)" stroke="${P.ink}" stroke-width="1.6" stroke-linejoin="round"/>${gem(20, 25, 3, '#d8423a')}${gem(11, 26, 2, '#4da3ff')}${gem(29, 26, 2, '#4da3ff')}`);

// ---------- small controls ----------
add('divider', 240, 14, `<line x1="10" y1="7" x2="230" y2="7" stroke="url(#goldH)" stroke-width="1.4"/><path d="M110 7 L120 1 L130 7 L120 13 Z" fill="url(#gold)" stroke="${P.ink}"/>${gem(120, 7, 2.4, '#d8423a')}<circle cx="10" cy="7" r="2" fill="${P.gold}"/><circle cx="230" cy="7" r="2" fill="${P.gold}"/>`, { note: 'stretch the line or use as-is' });
add('checkbox', 24, 24, `<rect x="1" y="1" width="22" height="22" rx="5" fill="${P.ink}"/><rect x="2.5" y="2.5" width="19" height="19" rx="4" fill="url(#inner)" stroke="url(#gold)" stroke-width="1.5"/>`);
add('checkbox-on', 24, 24, `<rect x="1" y="1" width="22" height="22" rx="5" fill="${P.ink}"/><rect x="2.5" y="2.5" width="19" height="19" rx="4" fill="url(#inner)" stroke="url(#gold)" stroke-width="1.5"/><path d="M6.5 12.5 L10.5 16.5 L18 7.5" fill="none" stroke="${P.goldL}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`);
add('slider-track', 160, 12, `<rect x="1" y="2" width="158" height="8" rx="4" fill="${P.ink}"/><rect x="2" y="3" width="156" height="6" rx="3" fill="#0a0806" stroke="${P.bronze}"/>`, { slice: '0 6', note: '3-slice 0 6' });
add('slider-knob', 22, 22, `<circle cx="11" cy="11" r="10" fill="${P.ink}"/><circle cx="11" cy="11" r="8.5" fill="url(#gold)"/><circle cx="11" cy="11" r="8.5" fill="url(#gloss)" opacity=".6"/>${gem(11, 11, 3, '#d8423a')}`);
add('scroll-track', 12, 64, `<rect x="2" y="1" width="8" height="62" rx="4" fill="#0a0806" stroke="${P.bronzeD}"/>`, { slice: '6 0', note: '3-slice vertical 6 0' });
add('scroll-thumb', 12, 48, `<rect x="2" y="1" width="8" height="46" rx="4" fill="url(#goldH)" stroke="${P.ink}"/>`, { slice: '6 0', note: '3-slice vertical 6 0' });
add('input', 96, 32, `<rect x="1" y="1" width="94" height="30" rx="6" fill="${P.ink}"/><rect x="2.5" y="2.5" width="91" height="27" rx="5" fill="#0c0906" stroke="${P.bronze}" stroke-width="1.4"/><path d="M6 5 L90 5" stroke="#000" stroke-opacity=".6" stroke-width="2"/>`, { slice: 10, note: '9-slice 10 fill' });
// cursors (hotspot top-left)
add('cursor', 32, 32, `<path d="M3 2 L3 26 L9 20 L13 30 L18 28 L14 18 L23 18 Z" fill="url(#gold)" stroke="${P.ink}" stroke-width="2" stroke-linejoin="round"/><path d="M6 8 L6 19" stroke="#fff" stroke-opacity=".6" stroke-width="1.5"/>`, { note: 'CSS: cursor:url(cursor.png) 3 2, auto' });
add('cursor-attack', 32, 32, `<path d="M3 3 L9 3 L24 18 L18 24 L3 9 Z" fill="#e8ecf2" stroke="${P.ink}" stroke-width="1.8" stroke-linejoin="round"/><path d="M17 26 L26 17 L29 20 L20 29 Z" fill="url(#gold)" stroke="${P.ink}" stroke-width="1.5"/><path d="M24 26 L29 31" stroke="#5a3a1a" stroke-width="4" stroke-linecap="round"/>`, { note: 'hotspot 3 3' });
add('cursor-talk', 32, 32, `<path d="M3 4 Q3 2 5 2 L27 2 Q29 2 29 4 L29 19 Q29 21 27 21 L13 21 L6 28 L7 21 L5 21 Q3 21 3 19 Z" fill="url(#bronze)" stroke="url(#gold)" stroke-width="2"/><circle cx="10" cy="11.5" r="2" fill="${P.goldL}"/><circle cx="16" cy="11.5" r="2" fill="${P.goldL}"/><circle cx="22" cy="11.5" r="2" fill="${P.goldL}"/>`, { note: 'hotspot 3 2' });
add('cursor-loot', 32, 32, `<path d="M8 14 Q8 6 16 6 Q24 6 24 14 L26 28 L6 28 Z" fill="url(#bronze)" stroke="${P.ink}" stroke-width="1.8"/><path d="M10 10 Q16 14 22 10" fill="none" stroke="url(#gold)" stroke-width="2.4"/><circle cx="16" cy="20" r="3.2" fill="url(#gold)" stroke="${P.ink}"/>`, { note: 'hotspot 16 16' });

// ---------- icons (from the game's icon set) ----------
const soulsIcon = '<path d="M32 4 C40 16 50 22 48 38 C47 50 40 58 32 60 C24 58 17 50 16 38 C14 26 24 20 26 10 C30 18 30 22 34 24 C36 16 34 10 32 4 Z" fill="#7a3aff" stroke="#140d08" stroke-width="2" stroke-linejoin="round"/>' +
  '<path d="M32 22 C37 30 42 34 41 42 C40 50 36 54 32 55 C28 54 24 50 23 42 C22 36 28 32 32 22 Z" fill="#c9a0ff"/><circle cx="27.5" cy="42" r="2.6" fill="#140d08"/><circle cx="36.5" cy="42" r="2.6" fill="#140d08"/><path d="M28 49 Q32 52 36 49" fill="none" stroke="#140d08" stroke-width="2" stroke-linecap="round"/>' +
  '<circle cx="32" cy="34" r="26" fill="url(#gShine)" opacity=".35"/>';
const box = { innerHTML: '', style: {} };
const sandbox = { window: {}, document: { createElement: () => box, body: { appendChild() {} }, documentElement: { appendChild() {} } } };
vm.runInNewContext(fs.readFileSync(ICONS_JS, 'utf8'), sandbox);
const ICON = sandbox.window.ICON, iconDefs = box.innerHTML.replace(/^.*?<defs>/s, '').replace(/<\/defs>.*$/s, '');
const ico = (name, s) => { const body = s.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, ''); const ghost = name.startsWith('slot-empty'); A['icons/' + name] = { w: 64, h: 64, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs>${iconDefs}</defs>${ghost ? '<g opacity=".38">' + body + '</g>' : body}</svg>`, icon: 1 }; };
const fams = { sword: 'weapon', bow: 'weapon', staff: 'weapon' };
for (const r of ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']) {
  const rar = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'].indexOf(r);
  for (const k of ['sword', 'bow', 'staff', 'helm', 'armor', 'boots', 'ring', 'amulet']) ico(`gear-${k}-${r}`, ICON.gear(fams[k] ? { slot: 'weapon', fam: k, rar } : { slot: k, rar }));
}
ico('item-souls', '<svg>' + soulsIcon + '</svg>');
for (const [k, c] of [['hp', '#e24a4a'], ['mp', '#3d86d8'], ['hp2', '#ff6a9a'], ['atk', '#ff8a3a'], ['def', '#8ab8d8'], ['spd', '#6ae0d0'], ['xp', '#ffd35a'], ['ret', '#ffffff'], ['reset', '#555566']]) ico('item-' + k, ICON.cons(k, c));
for (const k of ['blade', 'archer', 'mage', 'mend', 'frenzy', 'vit', 'might', 'swift', 'crit', 'critdmg', 'lifesteal', 'guard', 'haste', 'focus', 'fortune']) ico('skill-' + k, ICON.skill(k, k));
for (const k of ['weapon', 'helm', 'armor', 'boots', 'ring', 'amulet']) ico('slot-empty-' + k, ICON.slot(k));

// ---------- write SVGs ----------
fs.mkdirSync(path.join(OUT, 'svg', 'icons'), { recursive: true });
for (const n in A) fs.writeFileSync(path.join(OUT, 'svg', n + '.svg'), A[n].svg);
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(Object.fromEntries(Object.entries(A).map(([n, a]) => [n, { w: a.w, h: a.h, slice: a.slice, note: a.note }])), null, 1));
console.log(Object.keys(A).length, 'assets');
