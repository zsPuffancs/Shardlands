'use strict';
// Small presentation helpers for the design system (no game logic):
//  - range sliders show their filled part through the --fill custom property
(function () {
  const fill = r => { const min = +r.min || 0, max = +r.max || 100; r.style.setProperty('--fill', ((+r.value - min) / (max - min) * 100) + '%'); };
  const all = () => document.querySelectorAll('input[type=range]').forEach(fill);
  document.addEventListener('input', e => { if (e.target && e.target.type === 'range') fill(e.target); }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', all); else all();
  setTimeout(all, 1500); // values restored from saved settings after start-up
  window.SLui = { refreshRanges: all };
})();
