'use strict';
// Layout coordinates stay in CSS pixels. Device pixel ratio belongs to the 3D renderer.
// Match the media query in responsive-ui.css; do not scale the world-projected label layer.
window.ResponsiveUI = (() => {
  const query = matchMedia('(max-width: 760px), (pointer: coarse) and (max-width: 1100px), (max-height: 700px) and (max-width: 1100px)');
  let scheduled = false, lastViewport = '', wasCompact = query.matches;
  function update() {
    scheduled = false;
    const viewport = window.visualViewport, root = document.documentElement;
    const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    for (const [key, value] of Object.entries({ width, height, left, top, right: Math.max(0, innerWidth - left - width), bottom: Math.max(0, innerHeight - top - height) })) root.style.setProperty('--viewport-' + key, value + 'px');
    root.dataset.compactUi = String(query.matches);
    const frame = document.getElementById('pframe')?.getBoundingClientRect();
    root.style.setProperty('--hud-player-bottom', (frame?.bottom || top + 104) + 'px');
    const target = document.getElementById('tgt')?.getBoundingClientRect();
    root.style.setProperty('--hud-target-bottom', (target?.height ? target.bottom : frame?.bottom || top + 104) + 'px');
    const action = document.getElementById('actionbar')?.getBoundingClientRect();
    root.style.setProperty('--hud-action-height', (action?.height || 80) + 'px');
    root.style.setProperty('--hud-action-width', (action?.width || 320) + 'px');
    const navigation = document.getElementById('mapbtns')?.getBoundingClientRect();
    root.style.setProperty('--hud-nav-height', (navigation?.height || 40) + 'px');
    const chat = document.getElementById('chat')?.getBoundingClientRect();
    const occupiedTop = Math.min(...[action, navigation, chat].filter(bounds => bounds?.height).map(bounds => bounds.top));
    root.style.setProperty('--hud-bottom-clearance', (Number.isFinite(occupiedTop) ? Math.max(0, top + height - occupiedTop) + 8 : 160) + 'px');
    const identity = [width, height, left, top, query.matches].join('|'), changed = identity !== lastViewport; lastViewport = identity;
    if (!query.matches && changed) for (const node of document.querySelectorAll('.win')) if (node.style.display === 'flex') { if (wasCompact) restoreWindow(node); fitWindow(node); }
    wasCompact = query.matches;
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(update); } }
  const chatToggle = document.getElementById('chat-expand');
  chatToggle.addEventListener('click', () => {
    const expanded = chatToggle.getAttribute('aria-expanded') !== 'true';
    chatToggle.setAttribute('aria-expanded', String(expanded));
    document.getElementById('chat').classList.toggle('expanded', expanded);
    schedule();
  });
  const desktopFit = fitWindow;
  fitWindow = function (node) {
    // CSS owns compact window bounds, including keyboard and safe-area changes.
    // Leave desktop widths/positions intact so rotating back cannot overwrite saved placement.
    if (!query.matches) desktopFit(node);
  };
  addEventListener('resize', schedule); addEventListener('orientationchange', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  if (query.addEventListener) query.addEventListener('change', schedule); else query.addListener(schedule);
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(schedule);
    for (const id of ['pframe', 'tgt', 'actionbar', 'mapbtns', 'chat']) { const node = document.getElementById(id); if (node) observer.observe(node); }
  }
  update();
  return { compact: () => query.matches };
})();
