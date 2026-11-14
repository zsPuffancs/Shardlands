'use strict';
// Render every icon source to public/icons/<category>/<name>.png (128 px) and write the registry data.
// usage: node art/icons/render.js [category ...]
const fs = require('fs'), path = require('path'), { chromium } = require('playwright');
const CATS = ['gear', 'item', 'currency', 'menu', 'stat', 'skill', 'npc', 'boss', 'quest', 'ui', 'gm'];
const OUT = path.join(__dirname, '../../public/icons');
(async () => {
  const want = process.argv.slice(2), b = await chromium.launch(), p = await b.newPage({ viewport: { width: 128, height: 128 } });
  for (const cat of CATS) { const f = path.join(__dirname, cat + '.js'); if (!fs.existsSync(f) || (want.length && !want.includes(cat))) continue;
    const set = require(f); fs.mkdirSync(path.join(OUT, cat), { recursive: true });
    for (const [name, fn] of Object.entries(set)) { const svg = fn();
      await p.setContent('<html><body style="margin:0;background:transparent">' + svg.replace('<svg ', '<svg style="display:block" ') + '</body></html>');
      await p.screenshot({ path: path.join(OUT, cat, name + '.png'), omitBackground: true, clip: { x: 0, y: 0, width: 128, height: 128 } }); } }
  await b.close();
})();
