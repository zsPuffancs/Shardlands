'use strict';
// Offline Git-report compatibility only. Never install a process-wide require hook.
const path = require('node:path');
const manifest = require('../docs/module-domains.json');
const ROOT = path.resolve(__dirname, '..');
const paths = new Map(Object.entries(manifest.domains).flatMap(([domain, names]) => names.map(name => [name, path.join(ROOT, 'src', domain, name + '.js')])));
function createHistoricalRequire(historicalModule, pinned = {}) {
  const nativeRequire = historicalModule.require.bind(historicalModule);
  return request => {
    if (Object.hasOwn(pinned, request)) return pinned[request]();
    if (request.startsWith('.') || path.isAbsolute(request)) {
      const absolute = path.resolve(path.dirname(historicalModule.filename), request);
      if (path.dirname(absolute) === ROOT) {
        const name = path.basename(absolute).replace(/\.js$/, '');
        if (paths.has(name)) return nativeRequire(paths.get(name));
      }
    }
    return nativeRequire(request);
  };
}
module.exports = { createHistoricalRequire };
