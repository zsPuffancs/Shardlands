export type RulesetName = 'Normal' | 'Hardcore' | 'Accelerated' | 'Custom';
export type SettingMode = 'live' | 'restart-required' | 'generation-locked' | 'save-sensitive';
import type { ForgePolicy } from '../../shared/generated/forge';
export interface ProgressionPolicy { wisdomMultiplier: number }
export interface GoldPolicy { normalCostFraction: number; variation: number }
export interface LootPolicy { gearBaseChance: number; gearTierIncrement: number }
export interface CombatPolicy { recoveryDamageMultiplier: number }
export interface MonsterPolicy { hpPerDepth: number; damagePerDepth: number; worldExponent: number }
export interface Rates {
  xpRate: number; goldRate: number; gearDropRate: number; potionDropRate: number;
  rarityBoost: number; monsterHp: number; monsterDamage: number; deathZoneMonsters: number;
  deathGoldLoss: number; deathGoldKillCap: number; respawnSeconds: number;
}
export interface SettlementEconomy {
  version: number;
  baseCosts: { merchant: number; smith: number; mystic: number };
  startingTier: number; scalingCoefficient: number; scalingExponent: number;
}
export interface GenerationConfig {
  budgets: Partial<Record<'monsters' | 'stones' | 'alphas' | 'bosses' | 'resources', number>>;
  spacing: Partial<Record<'camp' | 'stone' | 'alpha' | 'boss' | 'resource', number>>;
  danger: Partial<Record<'baseline' | 'noise', number>>;
}
export interface Balance {
  rates: Rates;
  settlement: SettlementEconomy;
  worldGeneration: GenerationConfig;
  forging: ForgePolicy;
  progression: ProgressionPolicy;
  gold: GoldPolicy;
  loot: LootPolicy;
  combat: CombatPolicy;
  monsters: MonsterPolicy;
}
export type DeepPartial<T> = T extends readonly (infer U)[] ? readonly U[] : { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type DeepReadonly<T> = { readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K] };
export interface BalanceEnvironment {
  base: Balance;
  rateBounds: Rates;
  generationBudgets: Record<string, number>;
  maxCurrency: number;
}
export interface ResolvedBalance {
  readonly ruleset: RulesetName;
  readonly values: DeepReadonly<Balance>;
}
