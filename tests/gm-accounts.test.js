'use strict';
// GM credential store, rate limiter, provisioning script, local vault and its desktop IPC bridge.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { GM_ACCOUNTS, createGmAccountStore, createLoginLimiter, generatePassword, passwordProblem, isGmName } = require('../src/player/gm-accounts');
const { main: provision } = require('../scripts/gm-provision');
const { createCredentialVault } = require('../desktop/credential-vault');
const { registerVaultIpc, CHANNELS } = require('../desktop/vault-ipc');
const root = path.join(__dirname, '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'shardlands-gmunit-'));
const sink = (tty = true) => { const lines = []; return { isTTY: tty, lines, write: t => lines.push(t), text: () => lines.join('') }; };

test('exactly three GM accounts; names are reserved case-insensitively', () => {
  assert.deepEqual(GM_ACCOUNTS, ['zsPuffancs', 'ColdSteel', 'MaxyKing']);
  for (const n of ['zspuffancs', 'COLDSTEEL', ' MaxyKing ']) assert.equal(isGmName(n), true);
  for (const n of ['Alice', 'zsPuffancs2', '']) assert.equal(isGmName(n), false);
});

test('passwords are stored only as salted scrypt hashes and verified in constant time', async () => {
  const dir = tmp();
  try {
    const store = createGmAccountStore({ directory: dir }), pw = generatePassword();
    assert.ok(pw.length >= 24);
    await store.setPassword('ColdSteel', pw, { mustChange: true });
    const raw = fs.readFileSync(path.join(dir, 'gm-accounts.json'), 'utf8'), rec = JSON.parse(raw).accounts.ColdSteel;
    assert.equal(raw.includes(pw), false); assert.equal(rec.alg, 'scrypt'); assert.ok(rec.N >= 1 << 15); assert.ok(Buffer.from(rec.salt, 'base64').length >= 16);
    await store.setPassword('MaxyKing', pw); assert.notEqual(JSON.parse(fs.readFileSync(path.join(dir, 'gm-accounts.json'), 'utf8')).accounts.MaxyKing.hash, rec.hash, 'per-account salt');
    assert.deepEqual(await store.verify('coldsteel', pw), { ok: true, account: 'ColdSteel', mustChange: true });
    assert.equal((await store.verify('ColdSteel', pw + 'x')).ok, false);
    assert.equal((await store.verify('Alice', pw)).ok, false);
    assert.equal((await store.verify('zsPuffancs', pw)).ok, false, 'an account that was never provisioned cannot sign in');
    assert.equal((await store.changePassword('ColdSteel', 'wrong', 'A-much-better-pass9')).ok, false);
    assert.match((await store.changePassword('ColdSteel', pw, 'ColdSteel-pass-123')).error, /account name/);
    assert.equal((await store.changePassword('ColdSteel', pw, 'A-much-better-pass9')).ok, true);
    assert.deepEqual(await store.verify('ColdSteel', 'A-much-better-pass9'), { ok: true, account: 'ColdSteel', mustChange: false });
    assert.equal(passwordProblem('aaaaaaaaaaaaaa'), 'Use a less repetitive password.');
    await assert.rejects(store.setPassword('Alice', pw), /not a GM account/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('login limiter locks after five failures, doubling the lock, and clears on success', () => {
  let t = 0; const L = createLoginLimiter({ now: () => t }), keys = ['account:x', 'address:1'];
  for (let i = 0; i < 4; i++) L.fail(keys); assert.equal(L.wait(keys), 0);
  L.fail(keys); assert.equal(L.wait(keys), 30000);
  t += 30001; assert.equal(L.wait(keys), 0); L.fail(keys); assert.equal(L.wait(keys), 60000);
  assert.ok(L.wait(['address:1']) > 0, 'the address is locked for other accounts too');
  t += 60001; L.succeed(keys); assert.equal(L.wait(keys), 0);
});

test('provisioning: one-time display, never overwrites, explicit reset, refuses pipes, optional vault', async () => {
  const dir = tmp();
  try {
    const out = sink(); assert.equal(await provision([], { out, directory: dir }), 0);
    const shown = GM_ACCOUNTS.map(a => out.text().match(new RegExp(a + '\\s+(\\S{24})'))[1]);
    const store = createGmAccountStore({ directory: dir });
    for (const [i, a] of GM_ACCOUNTS.entries()) assert.equal((await store.verify(a, shown[i])).mustChange, true);
    const before = fs.readFileSync(path.join(dir, 'gm-accounts.json'), 'utf8');
    const again = sink(); await provision([], { out: again, directory: dir }); assert.match(again.text(), /nothing was changed/);
    const noYes = sink(); assert.equal(await provision(['--reset', 'ColdSteel'], { out: noYes, directory: dir }), 2);
    assert.equal(fs.readFileSync(path.join(dir, 'gm-accounts.json'), 'utf8'), before, 'no silent overwrite');
    const pipe = sink(false); assert.equal(await provision(['--reset', 'ColdSteel', '--yes'], { out: pipe, directory: dir }), 3); assert.match(pipe.text(), /Refusing/);
    const saved = {}, fakeVault = () => ({ available: async () => ({ ok: true, store: 'Test store' }), save: async (a, p) => { saved[a] = p; } });
    const reset = sink(); await provision(['--reset', 'ColdSteel', '--yes', '--vault'], { out: reset, directory: dir, vaultFactory: fakeVault });
    const fresh = reset.text().match(/ColdSteel\s+(\S{24})/)[1];
    assert.equal(saved.ColdSteel, fresh); assert.match(reset.text(), /Saved in Test store: ColdSteel/);
    assert.equal((await createGmAccountStore({ directory: dir }).verify('ColdSteel', shown[1])).ok, false);
    assert.equal((await createGmAccountStore({ directory: dir }).verify('MaxyKing', shown[2])).ok, true, 'other accounts untouched');
    const status = sink(); await provision(['--status'], { out: status, directory: dir }); assert.equal(/\S{24}/.test(status.text().replace(/password change pending|not provisioned|provisioned/g, '')), false, 'status shows no secrets');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('vault: native store through stdin only, restricted to the three accounts, no plaintext fallback', async () => {
  // a stand-in for secret-tool that keeps entries in a temporary file, so persistence across vault instances shows
  const dir = tmp(), db = path.join(dir, 'keyring.json'), calls = [];
  const runner = async (file, args, input) => {
    calls.push({ file, args, input }); const store = fs.existsSync(db) ? JSON.parse(fs.readFileSync(db, 'utf8')) : {}, key = args.slice(-1)[0];
    if (args[0] === 'search') return { code: 1, stdout: '', stderr: '' };
    if (args[0] === 'store') { store[key] = input; fs.writeFileSync(db, JSON.stringify(store)); return { code: 0, stdout: '' }; }
    if (args[0] === 'lookup') return store[key] ? { code: 0, stdout: store[key] + '\n' } : { code: 1, stdout: '' };
    if (args[0] === 'clear') { delete store[key]; fs.writeFileSync(db, JSON.stringify(store)); return { code: 0, stdout: '' }; }
  };
  try {
    const vault = createCredentialVault({ platform: 'linux', runner });
    assert.deepEqual(await vault.available(), { ok: true, store: 'Secret Service (secret-tool)' });
    await vault.save('zsPuffancs', 'Secret-Value-123');
    assert.ok(calls.every(c => !c.args.join(' ').includes('Secret-Value-123')), 'the secret never appears in arguments');
    const restarted = createCredentialVault({ platform: 'linux', runner });
    assert.equal(await restarted.reveal('zspuffancs'), 'Secret-Value-123', 'persists across restarts');
    assert.deepEqual(await restarted.list(), { zsPuffancs: true, ColdSteel: false, MaxyKing: false });
    await restarted.save('zsPuffancs', 'Updated-Value-456'); assert.equal(await restarted.reveal('zsPuffancs'), 'Updated-Value-456');
    await restarted.remove('zsPuffancs'); assert.equal(await restarted.reveal('zsPuffancs'), null);
    await assert.rejects(restarted.save('Alice', 'x'), /three GM accounts/);
    await assert.rejects(restarted.save('ColdSteel', 'two\nlines'), /one line/);
    // no secure store: explain and store nothing
    const none = createCredentialVault({ platform: 'linux', runner: async () => ({ code: -1, missing: true, stdout: '', stderr: '' }) });
    const s = await none.available(); assert.equal(s.ok, false); assert.match(s.reason, /secret-tool is not installed/);
    await assert.rejects(none.save('ColdSteel', 'abc'), /secret-tool/);
    // Windows: Credential Manager via PowerShell, secret in the stdin JSON, local (non-roaming) persistence
    const win = []; const wv = createCredentialVault({ platform: 'win32', runner: async (file, args, input) => { win.push({ file, args, input }); return { code: 0, stdout: '{"ok":true}\n' }; } });
    await wv.save('MaxyKing', 'Win-Secret-789');
    assert.equal(win.at(-1).file, 'powershell.exe'); assert.ok(!win.at(-1).args.join(' ').includes('Win-Secret-789')); assert.equal(JSON.parse(win.at(-1).input).secret, 'Win-Secret-789');
    assert.match(win.at(-1).args.join(' '), /c\.Persist = 2/); assert.match(win.at(-1).args.join(' '), /CredWrite/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('desktop IPC bridge validates the caller and every argument', async () => {
  const handlers = {}, ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } }, saved = {};
  const vault = { available: async () => ({ ok: true, store: 'X' }), list: async () => ({}), save: async (a, s) => { if (!a) throw new Error('Only the three GM accounts can be saved.'); saved[a] = s; return true; }, reveal: async a => saved[a] || null, remove: async a => delete saved[a] };
  assert.throws(() => registerVaultIpc(ipcMain, { vault }), /isTrustedSender/);
  registerVaultIpc(ipcMain, { vault, isTrustedSender: e => e.trusted === true });
  assert.deepEqual(Object.keys(handlers).sort(), Object.values(CHANNELS).sort());
  assert.deepEqual(await handlers[CHANNELS.reveal]({ trusted: false }, 'ColdSteel'), { ok: false, error: 'Not allowed.' });
  assert.equal((await handlers[CHANNELS.save]({ trusted: true }, 'ColdSteel', 'abc')).ok, true);
  assert.equal((await handlers[CHANNELS.save]({ trusted: true }, { evil: 1 }, 'abc')).ok, false);
  assert.deepEqual(await handlers[CHANNELS.reveal]({ trusted: true }, 'ColdSteel'), { ok: true, value: 'abc' });
  const preload = fs.readFileSync(path.join(root, 'desktop/preload.js'), 'utf8');
  assert.match(preload, /contextBridge\.exposeInMainWorld\('shardlandsVault'/); assert.doesNotMatch(preload, /exposeInMainWorld\([^)]*ipcRenderer\b(?!\.invoke)/);
});

test('no GM secrets or browser storage in the client; credential files are git-ignored', () => {
  const gm = fs.readFileSync(path.join(root, 'public/gm.js'), 'utf8');
  for (const api of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie']) assert.equal(gm.includes(api + '.') || gm.includes(api + '['), false, api);
  assert.equal(/admin\s*[:=]\s*true|gmAuth\s*=/.test(gm), false, 'the client never grants itself GM state');
  const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  for (const f of ['/gm-accounts.json', '/gm-audit.log']) assert.ok(ignore.includes(f), f);
  assert.equal(fs.readdirSync(root).includes('gm-accounts.json') && !ignore.includes('/gm-accounts.json'), false);
});
