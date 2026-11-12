"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SETTLEMENT_ECONOMY = exports.BASE_RATES = void 0;
const registry_1 = require("./registry");
exports.BASE_RATES = Object.freeze({ xpRate: 1, goldRate: 1, gearDropRate: .8, potionDropRate: 1, rarityBoost: 0, monsterHp: 1.6, monsterDamage: 1.4, deathZoneMonsters: 1800, deathGoldLoss: .05, deathGoldKillCap: 12, respawnSeconds: 11 });
exports.SETTLEMENT_ECONOMY = (0, registry_1.freeze)({ version: 1, baseCosts: { merchant: 250000, smith: 400000, mystic: 400000 }, startingTier: 8, scalingCoefficient: .06, scalingExponent: .7 });
