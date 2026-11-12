// Authoritative TypeScript source; generated CommonJS/declarations are committed for build-free server startup.
import type { DeepReadonly, Rates, SettlementEconomy } from './types';
import { freeze } from './registry';
export const BASE_RATES: Readonly<Rates> = Object.freeze({ xpRate: 1, goldRate: 1, gearDropRate: .8, potionDropRate: 1, rarityBoost: 0, monsterHp: 1.6, monsterDamage: 1.4, deathZoneMonsters: 1800, deathGoldLoss: .05, deathGoldKillCap: 12, respawnSeconds: 11 });
export const SETTLEMENT_ECONOMY: DeepReadonly<SettlementEconomy> = freeze({ version: 1, baseCosts: { merchant: 250000, smith: 400000, mystic: 400000 }, startingTier: 8, scalingCoefficient: .06, scalingExponent: .7 });
