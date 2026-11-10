'use strict';
const fs = require('node:fs');
const { basename } = require('node:path');

function openJsonStore(file) {
  const data = Object.create(null);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Expected a JSON object');
    }
    Object.assign(data, parsed);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error('Could not load ' + basename(file) + '. The existing file was preserved.', { cause: error });
    }
  }

  async function save() {
    const temporaryFile = file + '.' + process.pid + '.tmp';
    try {
      await fs.promises.writeFile(temporaryFile, JSON.stringify(data), { mode: 0o600 });
      await fs.promises.rename(temporaryFile, file);
    } catch (error) {
      await fs.promises.unlink(temporaryFile).catch(() => {});
      throw new Error('Could not save ' + basename(file), { cause: error });
    }
  }
  return { data, save };
}

module.exports = { openJsonStore };
