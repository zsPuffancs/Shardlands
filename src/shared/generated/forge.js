"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UP_RATE = exports.DEFAULT_FORGE_POLICY = void 0;
exports.upCostFor = upCostFor;
exports.upgradeOutcome = upgradeOutcome;
exports.forgeClientConfig = forgeClientConfig;
exports.DEFAULT_FORGE_POLICY = Object.freeze({ costBase: 100, costExponent: 1.3, levelDivisor: 12, nonWeaponMultiplier: .8, successRates: Object.freeze([1, .95, .90, .80, .70, .60, .50, .40, .30]) });
exports.UP_RATE = exports.DEFAULT_FORGE_POLICY.successRates;
function upCostFor(item, policy = exports.DEFAULT_FORGE_POLICY) {
    return item ? Math.round(policy.costBase * (item.plus + 1) ** policy.costExponent * (1 + item.ilvl / policy.levelDivisor) * (item.slot === 'weapon' ? 1 : policy.nonWeaponMultiplier)) : 0;
}
function upgradeOutcome(plus, roll, policy = exports.DEFAULT_FORGE_POLICY) {
    const success = roll < policy.successRates[plus], drop = !success && plus >= 5;
    return { success, drop, plus: success ? Number(plus) + 1 : drop ? plus - 1 : plus };
}
function forgeClientConfig(policy = exports.DEFAULT_FORGE_POLICY) {
    return { forgePolicy: { ...policy, successRates: [...policy.successRates] }, upRate: [...policy.successRates] };
}
