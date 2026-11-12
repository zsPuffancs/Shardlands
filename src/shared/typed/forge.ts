// Canonical production/server/browser forge policy. No inventory or persistence dependencies.
export interface ForgeItem { ilvl: number; plus: number; slot: string }
export interface ForgePolicy { costBase: number; costExponent: number; levelDivisor: number; nonWeaponMultiplier: number; successRates: readonly number[] }
export const DEFAULT_FORGE_POLICY: Readonly<ForgePolicy> = Object.freeze({ costBase: 100, costExponent: 1.3, levelDivisor: 12, nonWeaponMultiplier: .8, successRates: Object.freeze([1, .95, .90, .80, .70, .60, .50, .40, .30]) });
export const UP_RATE = DEFAULT_FORGE_POLICY.successRates;
export function upCostFor(item: ForgeItem | null | undefined, policy: ForgePolicy = DEFAULT_FORGE_POLICY): number {
  return item ? Math.round(policy.costBase * (item.plus + 1) ** policy.costExponent * (1 + item.ilvl / policy.levelDivisor) * (item.slot === 'weapon' ? 1 : policy.nonWeaponMultiplier)) : 0;
}
export function upgradeOutcome(plus: number, roll: number, policy: ForgePolicy = DEFAULT_FORGE_POLICY): { success: boolean; drop: boolean; plus: number } {
  const success = roll < policy.successRates[plus]!, drop = !success && plus >= 5;
  return { success, drop, plus: success ? Number(plus) + 1 : drop ? plus - 1 : plus };
}
export interface ForgeClientConfig { forgePolicy: ForgePolicy; upRate: readonly number[] }
export function forgeClientConfig(policy: ForgePolicy = DEFAULT_FORGE_POLICY): ForgeClientConfig {
  return { forgePolicy: { ...policy, successRates: [...policy.successRates] }, upRate: [...policy.successRates] };
}
