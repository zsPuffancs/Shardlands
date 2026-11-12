// Authoritative TypeScript source; generated CommonJS/declarations are committed for build-free server startup.
import type { DeepReadonly, Rates, SettlementEconomy, ProgressionPolicy, GoldPolicy, LootPolicy, CombatPolicy, MonsterPolicy } from './types';
export { DEFAULT_FORGE_POLICY } from '../../shared/generated/forge';
import { freeze } from './registry';
export const BASE_RATES: Readonly<Rates> = Object.freeze({ xpRate: 1, goldRate: 1, gearDropRate: .8, potionDropRate: 1, rarityBoost: 0, monsterHp: 1.6, monsterDamage: 1.4, deathZoneMonsters: 1800, deathGoldLoss: .05, deathGoldKillCap: 12, respawnSeconds: 11 });
export const SETTLEMENT_ECONOMY: DeepReadonly<SettlementEconomy> = freeze({ version: 1, baseCosts: { merchant: 250000, smith: 400000, mystic: 400000 }, startingTier: 8, scalingCoefficient: .06, scalingExponent: .7 });
export const PROGRESSION_POLICY: Readonly<ProgressionPolicy> = Object.freeze({ wisdomMultiplier: 1.5 });
export const GOLD_POLICY: Readonly<GoldPolicy> = Object.freeze({ normalCostFraction: .065, variation: .20 });
export const LOOT_POLICY: Readonly<LootPolicy> = Object.freeze({ gearBaseChance: .14, gearTierIncrement: .02 });
export const COMBAT_POLICY: Readonly<CombatPolicy> = Object.freeze({ recoveryDamageMultiplier: 1.25 });
export const MONSTER_POLICY: Readonly<MonsterPolicy> = Object.freeze({ hpPerDepth: .05, damagePerDepth: .08, worldExponent: .7 });
