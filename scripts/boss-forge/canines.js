'use strict';
// The canine basic enemies (Wild Wolf, Frost Wolf, Hellhound, Frost Fang), sculpted on the Alpha Wolf's body and rig
// at an ordinary-enemy budget, each with its Alpha form (the features the old primitive Alphas had).
const A = require('./alphawolf');
const RES = { res: [[.85, .45], [1.6, .9]], lockRes: 1.9 };
const base = (o) => Object.assign({ key: 'a' }, RES, o);
const SPECIES = {
  wolf: [base({ seed: 5101, colors: { fur: [.55, .56, .58], glow: [1, .8, .3] }, coat: [.5, .5, .5], back: [.3, .3, .32], pale: [.86, .84, .8], eye: [1, .8, .25] }),
         base({ seed: 5102, fur: 1.3, hackles: 1, colors: { fur: [.45, .45, .48], glow: [1, .5, .2] }, coat: [.38, .38, .4], back: [.18, .18, .2], pale: [.92, .9, .86], eye: [1, .45, .1] })],
  frostwolf: [base({ seed: 5201, colors: { fur: [.82, .88, .95], glow: [.5, .85, 1] }, coat: [.78, .84, .92], back: [.55, .64, .76], pale: [.95, .97, 1], eye: [.4, .8, 1] }),
              base({ seed: 5202, fur: 1.3, hackles: 1, iceSpine: 1, colors: { fur: [.78, .86, .94], glow: [.5, .9, 1] }, coat: [.74, .82, .9], back: [.45, .55, .7], pale: [.96, .98, 1], eye: [.5, .9, 1] })],
  hellhound: [base({ seed: 5301, horns: 1, maneFlames: 1, seams: 1, fur: .8, colors: { fur: [.16, .12, .11], glow: [1, .45, .1], horn: [.18, .14, .12] }, coat: [.16, .12, .11], back: [.07, .05, .05], pale: [.35, .2, .14], eye: [1, .55, .1] }),
              base({ seed: 5302, horns: 1, maneFlames: 1, seams: 1, hackles: 1, colors: { fur: [.12, .08, .08], glow: [1, .35, .05], horn: [.1, .08, .07] }, coat: [.12, .08, .08], back: [.05, .03, .03], pale: [.4, .18, .1], eye: [1, .4, .05] })],
  frostfang: [base({ seed: 5401, fur: 1.4, sabre: 1, iceSpine: 1, colors: { fur: [.86, .9, .96], glow: [.5, .85, 1] }, coat: [.84, .88, .94], back: [.6, .66, .74], pale: [.96, .98, 1], eye: [.35, .75, 1] }),
              base({ seed: 5402, fur: 1.6, sabre: 1, iceSpine: 1, horns: 1, hackles: 1, colors: { fur: [.8, .86, .94], glow: [.45, .85, 1], horn: [.75, .88, 1] }, coat: [.78, .84, .92], back: [.5, .58, .7], pale: [.96, .98, 1], eye: [.4, .85, 1] })],
};
const make = id => ({ build: (v, o) => A.buildWith(SPECIES[id][v], o) });
module.exports = { make, SPECIES };
