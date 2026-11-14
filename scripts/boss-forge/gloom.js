'use strict';
// Gloomwood basic enemies built on the Region Boss sculpts at an ordinary-enemy budget: the Orc Raider (the Orc
// Warlord's body without its iron pauldrons, with a spiked club; Alpha: bone spikes on the shoulders, white war
// paint) and the Cave Spider (the Broodmother's body and 8-legged rig without the egg sac; Alpha: a glowing red
// hourglass on the abdomen, bristling spikes, longer fangs).
const W = require('./warlord'), S = require('./broodmother');
const res = r => ({ res: r });
const ORC = [
  Object.assign({}, W.DESIGN[0], { seed: 7201, noPauldrons: 1, club: 1 }, res([[1.15, 1.2, .8, .45], [1.9, 1.9, 1.4, .8]])),
  Object.assign({}, W.DESIGN[0], { seed: 7202, noPauldrons: 1, club: 1, boneSpikes: 1, paint: [.9, .88, .82] }, res([[1.15, 1.2, .8, .45], [1.9, 1.9, 1.4, .8]])),
];
ORC[0].colors = Object.assign({}, ORC[0].colors, { skin: [.42, .5, .26], skinDark: [.2, .26, .12] });
ORC[1].colors = Object.assign({}, ORC[1].colors, { skin: [.36, .44, .22], skinDark: [.16, .22, .1] });
const SPIDER = [
  Object.assign({}, S.DESIGN[0], { seed: 7301, noSac: 1, body: [.24, .16, .3], pale: [.7, .62, .5] }, res([[.75, .55], [1.5, 1]])),
  Object.assign({}, S.DESIGN[1], { seed: 7302, colors: Object.assign({}, S.DESIGN[1].colors, { glow: [1, .15, .1] }), pale: [1, .2, .1] }, res([[.85, .75], [1.6, 1.2]])),
];
module.exports = { orc: { build: (v, o) => W.buildWith(ORC[v], o) }, spider: { build: (v, o) => S.buildWith(SPIDER[v], o) } };
