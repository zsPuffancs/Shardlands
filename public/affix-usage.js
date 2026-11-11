(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.AffixUsage = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  function evaluate(equipment, item, key, value, caps) {
    const cap = caps?.[key];
    if (!Number.isFinite(cap) || !item || !Number.isFinite(value)) return null;
    const total = Object.values(equipment).reduce((sum, gear) => sum + (gear?.afx?.k === key && Number.isFinite(gear.afx.v) ? gear.afx.v : 0), 0);
    const others = Object.values(equipment).reduce((sum, gear) => sum + (gear && gear.uid !== item.uid && gear.slot !== item.slot && gear.afx?.k === key && Number.isFinite(gear.afx.v) ? gear.afx.v : 0), 0);
    return { cap, before: Math.min(cap, total), after: Math.min(cap, others + value), contribution: Math.max(0, Math.min(value, cap - others)), wasted: Math.max(0, others + value - cap) };
  }
  return { evaluate };
});
