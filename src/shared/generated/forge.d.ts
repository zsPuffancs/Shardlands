export interface ForgeItem {
    ilvl: number;
    plus: number;
    slot: string;
}
export interface ForgePolicy {
    costBase: number;
    costExponent: number;
    levelDivisor: number;
    nonWeaponMultiplier: number;
    successRates: readonly number[];
}
export declare const DEFAULT_FORGE_POLICY: Readonly<ForgePolicy>;
export declare const UP_RATE: readonly number[];
export declare function upCostFor(item: ForgeItem | null | undefined, policy?: ForgePolicy): number;
export declare function upgradeOutcome(plus: number, roll: number, policy?: ForgePolicy): {
    success: boolean;
    drop: boolean;
    plus: number;
};
export interface ForgeClientConfig {
    forgePolicy: ForgePolicy;
    upRate: readonly number[];
}
export declare function forgeClientConfig(policy?: ForgePolicy): ForgeClientConfig;
