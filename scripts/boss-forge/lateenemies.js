'use strict';
// The later basic enemies, built on the Region Boss sculpts and rigs at an ordinary-enemy budget, each with its Alpha
// form (the features the old primitive Alphas had):
//   Ogre Brute    the Ogre Chieftain's body without a crown, a spiked club; Alpha: great curved horns, a nose ring
//   Wraith        a hooded, robed spirit without a staff; Alpha: the ascended form (halo rings, robe fading to light)
//   Shade         a shadow in robes of smoke; Alpha: crystal shards and growths
//   Ember Drake   the dragon rig: four legs, ribbed wings, a horned head; Alpha: plated, a crown of horns, a chest furnace
//   Magma Golem   the Colossus's chiselled body; Alpha: obsidian armour plates
//   Ice Golem     the same body in glacier ice with a cold glowing core; Alpha: a crown of ice spires
//   Yeti          the Yeti King's body without a crown; Alpha: ice crusts on shoulders and back
//   Void Weaver   the 8-legged rig as a crystal-backed weaver; Alpha: glowing crystal growths
//   Void Knight   the death-knight plate in void colours; Alpha: a crown of blades and horns, glowing runes
const O = require('./ogrechief'), VL = require('./voidlord'), DR = require('./drake'), IN = require('./infernal'), Y = require('./yetiking'), SP = require('./broodmother'), DL = require('./deathlord');
const w = (base, extra) => Object.assign({}, base, extra, { colors: Object.assign({}, base.colors, extra.colors || {}) });
const HUM = { res: [[1.1, 1.05, .8, .45], [1.9, 1.9, 1.4, .8]] }, ROBE = { res: [[1.4, 1.35, .8, .6], [2.2, 2.2, 1.4, 1]] };
const D = {
  ogre: [w(O.DESIGN[0], Object.assign({ seed: 8101, noCrown: 1, colors: { skin: [.5, .46, .36], skinDark: [.28, .24, .18] } }, HUM)),
         w(O.DESIGN[0], Object.assign({ seed: 8102, noCrown: 1, horns: 1, noseRing: 1, colors: { skin: [.44, .38, .3], skinDark: [.22, .18, .13], horn: [.82, .76, .6] } }, HUM))],
  wraith: [w(VL.DESIGN[0], Object.assign({ seed: 8201, noStaff: 1, colors: { skin: [.1, .1, .12], cloth: [.26, .3, .32], cloth2: [.12, .14, .16], trim: [.5, .7, .7], crystal: [.12, .14, .16], glow: [.5, .9, 1] }, eye: [.5, .95, 1] }, ROBE)),
           w(VL.DESIGN[2], Object.assign({ seed: 8202, noStaff: 1, colors: { skin: [.1, .1, .12], cloth: [.2, .26, .26], cloth2: [.08, .1, .1], trim: [.6, .9, .8], crystal: [.12, .16, .16], glow: [.45, 1, .75] }, eye: [.5, 1, .8] }, ROBE))],
  shade: [w(VL.DESIGN[0], Object.assign({ seed: 8301, noStaff: 1, colors: { skin: [.03, .02, .04], cloth: [.07, .05, .1], cloth2: [.03, .02, .05], trim: [.5, .3, .8], crystal: [.05, .03, .08], glow: [.7, .4, 1] }, eye: [.8, .5, 1] }, ROBE)),
          w(VL.DESIGN[1], Object.assign({ seed: 8302, noStaff: 1, colors: { skin: [.03, .02, .04], cloth: [.06, .04, .09], cloth2: [.02, .01, .04], trim: [.7, .3, 1], crystal: [.06, .03, .1], glow: [.8, .35, 1] }, eye: [.9, .4, 1] }, ROBE))],
  golem: [w(IN.DESIGN[0], { seed: 8501, res: [[1.3, .85], [2.1, 1.3]] }), w(IN.DESIGN[1], { seed: 8502, res: [[1.3, .85], [2.1, 1.3]] })],
  icegolem: [w(IN.DESIGN[0], { seed: 8601, rock: [.62, .74, .86], rockDark: [.3, .42, .58], lava: [.4, .8, 1], lavaHot: [.85, .97, 1], colors: { glow: [.5, .85, 1] }, res: [[1.3, .85], [2.1, 1.3]] }),
             w(IN.DESIGN[2], { seed: 8602, rock: [.56, .7, .84], rockDark: [.24, .36, .52], lava: [.35, .75, 1], lavaHot: [.8, .95, 1], colors: { glow: [.45, .85, 1] }, res: [[1.3, .85], [2.1, 1.3]] })],
  yeti: [w(Y.DESIGN[0], { seed: 8701, noCrown: 1, res: [[1.35, .75], [2.1, 1.2]] }), w(Y.DESIGN[1], { seed: 8702, noCrown: 1, res: [[1.35, .75], [2.1, 1.2]] })],
  voidweaver: [w(SP.DESIGN[2], { seed: 8801, noSac: 1, res: [[1, .8], [1.7, 1.3]] }), w(SP.DESIGN[2], { seed: 8802, body: [.2, .1, .3], colors: { glow: [.9, .4, 1] }, res: [[1, .85], [1.7, 1.3]] })],
  voidknight: [w(DL.DESIGN[0], { seed: 8901, colors: { metal: [.18, .14, .26], darkmetal: [.07, .05, .1], trim: [.6, .4, .9], cloth: [.12, .05, .18], glow: [.75, .35, 1] }, eye: [.8, .4, 1], res: [[.95, .8, .6], [1.8, 1.4, 1]] }),
               w(DL.DESIGN[2], { seed: 8902, colors: { metal: [.2, .16, .3], darkmetal: [.08, .05, .12], trim: [.8, .6, 1], cloth: [.14, .06, .2], glow: [.85, .4, 1] }, eye: [.9, .5, 1], res: [[.95, .8, .6], [1.8, 1.4, 1]] })],
};
const EMBER = { seed: 8400, horns: 'crown', crest: 'frill', breath: 'fire',
  V: [{ key: 'a', scale: [.5, .16, .1], belly: [.9, .6, .3], dark: [.16, .05, .04], membrane: [.5, .18, .1], horn: [.3, .22, .18], glow: [1, .5, .15], eye: [1, .7, .1] },
      { key: 'b', scale: [.4, .1, .06], belly: [.95, .55, .2], dark: [.1, .03, .02], membrane: [.4, .12, .06], horn: [.86, .7, .4], glow: [1, .45, .1], eye: [1, .5, .05], plates: 1, furnace: 1 }] };
const mk = (mod, id) => ({ build: (v, o) => mod.buildWith(D[id][v], o) });
module.exports = { ogre: mk(O, 'ogre'), wraith: mk(VL, 'wraith'), shade: mk(VL, 'shade'), golem: mk(IN, 'golem'), icegolem: mk(IN, 'icegolem'), yeti: mk(Y, 'yeti'),
  voidweaver: mk(SP, 'voidweaver'), voidknight: mk(DL, 'voidknight'), drake: DR.makeCustom('emberdrake', EMBER, [[1.25, 1.35, .7], [2.1, 2.2, 1.2]]) };
