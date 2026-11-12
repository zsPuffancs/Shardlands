(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ForgeMath = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  // Shared display/charge policy; the server alone validates and executes attempts.
  const UP_RATE = Object.freeze([1.00, .95, .90, .80, .70, .60, .50, .40, .30]);
  const upCostFor = item => item ? Math.round(100 * (item.plus + 1) ** 1.3 * (1 + item.ilvl / 12) * (item.slot === 'weapon' ? 1 : .8)) : 0;
  function upgradeOutcome(plus, roll) {
    const success = roll < UP_RATE[plus], drop = !success && plus >= 5;
    return { success, drop, plus: success ? Number(plus) + 1 : drop ? plus - 1 : plus };
  }
  return { UP_RATE, upCostFor, upgradeOutcome };
});
