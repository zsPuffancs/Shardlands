export type RulesetName = 'Normal' | 'Hardcore' | 'Accelerated' | 'Custom';
export type SettingMode = 'live' | 'restart-required' | 'generation-locked' | 'save-sensitive';
export interface Rates {
    xpRate: number;
    goldRate: number;
    gearDropRate: number;
    potionDropRate: number;
    rarityBoost: number;
    monsterHp: number;
    monsterDamage: number;
    deathZoneMonsters: number;
    deathGoldLoss: number;
    deathGoldKillCap: number;
    respawnSeconds: number;
}
export interface SettlementEconomy {
    version: number;
    baseCosts: {
        merchant: number;
        smith: number;
        mystic: number;
    };
    startingTier: number;
    scalingCoefficient: number;
    scalingExponent: number;
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
}
export type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
export type DeepReadonly<T> = {
    readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};
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
