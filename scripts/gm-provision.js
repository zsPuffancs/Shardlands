#!/usr/bin/env node
'use strict';
// One-time provisioning of the three Game Master accounts, run by the server administrator on the server computer.
//
//   node scripts/gm-provision.js                   create the accounts that do not exist yet
//   node scripts/gm-provision.js --vault           ... and save their passwords in this computer's credential store
//   node scripts/gm-provision.js --reset ColdSteel --yes    replace one account's password (it must be changed again)
//   node scripts/gm-provision.js --status          show which accounts exist (no secrets)
//
// Each new password is random (24 characters), stored only as a salted scrypt hash in gm-accounts.json, and shown
// once in this terminal. Existing accounts are never changed without --reset <name> --yes. Passwords are printed only
// to an interactive terminal, never to a pipe or file, and never written to any log.
const path = require('node:path');
const { GM_ACCOUNTS, canonical, createGmAccountStore, generatePassword } = require('../src/player/gm-accounts');

async function main(argv = process.argv.slice(2), { out = process.stdout, directory = path.join(__dirname, '..'), vaultFactory = () => require('../desktop/credential-vault').createCredentialVault() } = {}) {
  const flag = name => argv.includes(name), value = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const store = createGmAccountStore({ directory }), write = text => out.write(text + '\n');
  if (flag('--status')) { for (const account of GM_ACCOUNTS) write('  ' + account.padEnd(11) + (store.has(account) ? (store.mustChange(account) ? 'provisioned, password change pending' : 'provisioned') : 'not provisioned')); return 0; }
  let targets;
  if (argv.includes('--reset')) {
    const account = canonical(value('--reset'));
    if (!account) { write('Unknown GM account. Accounts: ' + GM_ACCOUNTS.join(', ')); return 2; }
    if (!flag('--yes')) { write('This replaces the password of ' + account + '. Run again with --yes to confirm.'); return 2; }
    targets = [account];
  } else targets = GM_ACCOUNTS.filter(account => !store.has(account));
  if (!targets.length) { write('All three GM accounts are already provisioned; nothing was changed. Use --reset <name> --yes to replace a password.'); return 0; }
  if (!out.isTTY && !flag('--allow-non-interactive')) { write('Refusing to print new passwords to a pipe or file. Run this in an interactive terminal.'); return 3; }
  const created = [];
  for (const account of targets) { const password = generatePassword(); await store.setPassword(account, password, { mustChange: true, provisioned: true }); created.push([account, password]); }
  let vaultNote = '';
  if (flag('--vault')) {
    const vault = vaultFactory(), status = await vault.available();
    if (!status.ok) vaultNote = 'Not saved to a local vault: ' + status.reason;
    else { const saved = []; for (const [account, password] of created) { try { await vault.save(account, password); saved.push(account); } catch (error) { vaultNote += account + ': ' + error.message + ' '; } } if (saved.length) vaultNote = 'Saved in ' + status.store + ': ' + saved.join(', ') + '. ' + vaultNote; }
  }
  write('');
  write('  New GM credentials - shown only now. Each account must choose a new password on first login (F10).');
  write('');
  for (const [account, password] of created) write('    ' + account.padEnd(11) + '  ' + password);
  write('');
  if (vaultNote) write('  ' + vaultNote.trim());
  write('  Hashes written to ' + path.basename(store.file) + ' (keep it out of backups you share; it is git-ignored).');
  write('  Clear this terminal when you are done.');
  return 0;
}

if (require.main === module) main().then(code => { process.exitCode = code; }, error => { console.error('GM provisioning failed: ' + error.message); process.exitCode = 1; });
module.exports = { main };
