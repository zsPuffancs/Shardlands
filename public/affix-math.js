(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.AffixMath = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const clamp = value => Math.max(0, Math.min(1, value));
  const rollValue = (base, spread, unit) => Math.round(base * (spread[0] + unit * (spread[1] - spread[0])) * 10) / 10;
  function estimate({ low, high, base, spread, minimum, attempts, budget, souls, cost, current, key }) {
    if (![low, high, minimum].every(Number.isFinite) || low < 0 || high < low || minimum < 0 || !Number.isSafeInteger(attempts) || attempts < 1 || ![budget, souls].every(value => Number.isSafeInteger(value) && value >= 0) || !Number.isSafeInteger(cost) || cost < 1) return { valid: false };
    // Invert the actual rounded production function, including floating-point boundary behavior.
    // This consumes no randomness. Bisection error is below double-precision unit resolution.
    const valueAt = Number.isFinite(base) && Array.isArray(spread) && spread.length === 2 && spread.every(Number.isFinite) ? unit => rollValue(base, spread, unit) : unit => Math.round((low + unit * (high - low)) * 10) / 10;
    const minValue = valueAt(0), maxValue = valueAt(1 - Number.EPSILON / 2);
    let probability;
    if (minimum <= minValue) probability = 1;
    else if (minimum > maxValue) probability = 0;
    else { let left = 0, right = 1; for (let i = 0; i < 56; i++) { const middle = (left + right) / 2; if (valueAt(middle) >= minimum) right = middle; else left = middle; } probability = clamp(1 - right); }
    const effectiveAttempts = Math.min(attempts, Math.floor(Math.min(budget, souls) / cost));
    const alreadySatisfied = !!current && current.k === key && Number.isFinite(current.v) && current.v >= minimum;
    const chanceWithin = alreadySatisfied ? 1 : !effectiveAttempts || !probability ? 0 : probability === 1 ? 1 : -Math.expm1(effectiveAttempts * Math.log1p(-probability));
    const expectedAttempts = alreadySatisfied ? 0 : probability > 0 && Number.isFinite(1 / probability) ? 1 / probability : null;
    const expectedLimitedAttempts = alreadySatisfied ? 0 : probability > 0 ? chanceWithin / probability : effectiveAttempts;
    return { valid: true, minValue, maxValue, probability, effectiveAttempts, alreadySatisfied, impossible: !alreadySatisfied && probability === 0, guaranteed: probability === 1, chanceWithin, expectedAttempts, expectedLimitedAttempts, expectedSouls: Math.min(budget, souls, expectedLimitedAttempts * cost), expectedSoulsToSuccess: expectedAttempts === null || !Number.isFinite(expectedAttempts * cost) ? null : expectedAttempts * cost };
  }
  return { estimate, rollValue };
});
