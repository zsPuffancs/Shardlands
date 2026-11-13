'use strict';
// Electron main-process side of Saved GM Credentials. Shardlands has no desktop shell yet; when one is added, its
// main process calls registerVaultIpc(ipcMain, { isTrustedSender }) and loads desktop/preload.js into the game window.
// The renderer never touches the credential store: it can only invoke these five channels, every argument is
// validated here, and requests from any page other than the game's own are refused.
const { createCredentialVault } = require('./credential-vault');
const CHANNELS = Object.freeze({ status: 'gm-vault:status', list: 'gm-vault:list', save: 'gm-vault:save', reveal: 'gm-vault:reveal', remove: 'gm-vault:remove' });

function registerVaultIpc(ipcMain, { vault = createCredentialVault(), isTrustedSender } = {}) {
  if (typeof isTrustedSender !== 'function') throw new Error('registerVaultIpc needs isTrustedSender(event) to restrict callers to the game window.');
  const handle = (channel, fn) => ipcMain.handle(channel, async (event, ...args) => {
    if (!isTrustedSender(event)) return { ok: false, error: 'Not allowed.' };
    try { return { ok: true, value: await fn(...args) }; }
    catch (error) { return { ok: false, unavailable: !!error.unavailable, error: error.message }; }
  });
  const name = value => (typeof value === 'string' && value.length <= 32 ? value : '');
  handle(CHANNELS.status, () => vault.available());
  handle(CHANNELS.list, () => vault.list());
  handle(CHANNELS.save, (account, secret) => vault.save(name(account), typeof secret === 'string' ? secret : ''));
  handle(CHANNELS.reveal, account => vault.reveal(name(account)));
  handle(CHANNELS.remove, account => vault.remove(name(account)));
  return CHANNELS;
}

module.exports = { registerVaultIpc, CHANNELS };
