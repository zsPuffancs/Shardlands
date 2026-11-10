const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const OUT = process.argv[2]; const man = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json')));
(async () => {
  const b = await chromium.launch();
  for (const sc of [1, 2]) {
    const ctx = await b.newContext({ deviceScaleFactor: sc }); const p = await ctx.newPage();
    for (const n in man) {
      const a = man[n], dir = path.join(OUT, sc === 1 ? 'png' : 'png@2x', path.dirname(n)); fs.mkdirSync(dir, { recursive: true });
      await p.setViewportSize({ width: a.w, height: a.h });
      await p.setContent('<html><body style="margin:0;background:transparent">' + fs.readFileSync(path.resolve(OUT, 'svg', n + '.svg'), 'utf8').replace('<svg ', '<svg style="display:block" ') + '</body></html>');
      await p.screenshot({ path: path.join(dir, path.basename(n) + '.png'), omitBackground: true, clip: { x: 0, y: 0, width: a.w, height: a.h } });
    }
    await ctx.close();
  }
  await b.close();
})();
