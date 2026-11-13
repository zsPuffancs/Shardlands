'use strict';
const fs = require('node:fs');
const path = require('node:path');
function syncDirectory(directory) {
  // Windows does not expose directory fsync through Node. File handles are still flushed.
  if (process.platform === 'win32') return;
  const fd = fs.openSync(directory, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function replaceFile(file, text) {
  const temporary = file + '.durable.tmp';
  const fd = fs.openSync(temporary, 'w', 0o600);
  try { fs.writeFileSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temporary, file); syncDirectory(path.dirname(file));
}
module.exports = { replaceFile, syncDirectory };
