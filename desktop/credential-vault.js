'use strict';
// Saved GM Credentials: a local vault in the operating system's own credential store.
//
//   Windows  Credential Manager (generic credentials "Shardlands GM/<account>", persisted on this computer only,
//            never roaming), through PowerShell and the Win32 Cred* API. Part of every Windows install.
//   macOS    the login Keychain, through /usr/bin/security.
//   Linux    the Secret Service (GNOME Keyring, KWallet), through secret-tool (libsecret-tools).
//
// Secrets travel only through the helper's stdin and stdout, never through command-line arguments, files, logs or
// the network. When no secure store is available the vault reports why and stores nothing: there is no plaintext
// fallback. Runs in a desktop process (the provisioning script now; the Electron main process later, see
// desktop/vault-ipc.js). Never in the game server and never in a renderer.
const { execFile } = require('node:child_process');
const { GM_ACCOUNTS } = require('../src/player/gm-accounts');

const SERVICE = 'Shardlands GM';
const MAX_SECRET = 256;
const accountOf = name => { const account = GM_ACCOUNTS.find(a => a.toLowerCase() === String(name || '').toLowerCase()); if (!account) throw new Error('Only the three GM accounts can be saved.'); return account; };
const secretOf = value => { if (typeof value !== 'string' || !value || value.length > MAX_SECRET || /[\0\r\n]/.test(value)) throw new Error('Enter a password of 1-' + MAX_SECRET + ' characters on one line.'); return value; };

function run(file, args, input, { timeout = 15000 } = {}) {
  return new Promise(resolve => {
    const child = execFile(file, args, { timeout, windowsHide: true, maxBuffer: 1 << 20, env: Object.assign({}, process.env, { LANG: 'C' }) }, (error, stdout, stderr) => resolve({ code: error ? (typeof error.code === 'number' ? error.code : -1) : 0, missing: !!error && error.code === 'ENOENT', stdout: String(stdout), stderr: String(stderr) }));
    child.stdin.on('error', () => {});
    child.stdin.end(input === undefined ? '' : input);
  });
}

// ---------- Windows: Credential Manager ----------
const WIN_HELPER = `$ErrorActionPreference = 'Stop'
$req = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class SlCred {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL { public int Flags; public int Type; public string TargetName; public string Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist; public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredWrite(ref CREDENTIAL c, int flags);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredRead(string target, int type, int flags, out IntPtr c);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredDelete(string target, int type, int flags);
  [DllImport("advapi32.dll")] static extern void CredFree(IntPtr c);
  public static void Write(string target, string user, string secret) {
    byte[] b = Encoding.Unicode.GetBytes(secret); CREDENTIAL c = new CREDENTIAL(); c.Type = 1; c.TargetName = target; c.UserName = user; c.Persist = 2;
    c.CredentialBlobSize = b.Length; c.CredentialBlob = Marshal.AllocHGlobal(b.Length);
    try { Marshal.Copy(b, 0, c.CredentialBlob, b.Length); if (!CredWrite(ref c, 0)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); }
    finally { for (int i = 0; i < b.Length; i++) b[i] = 0; Marshal.FreeHGlobal(c.CredentialBlob); } }
  public static string Read(string target) { IntPtr p; if (!CredRead(target, 1, 0, out p)) return null;
    try { CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL)); return Marshal.PtrToStringUni(c.CredentialBlob, c.CredentialBlobSize / 2); } finally { CredFree(p); } }
  public static bool Exists(string target) { IntPtr p; if (!CredRead(target, 1, 0, out p)) return false; CredFree(p); return true; }
  public static bool Delete(string target) { return CredDelete(target, 1, 0); }
}
"@
switch ($req.op) {
  'probe' { '{"ok":true}' }
  'set' { [SlCred]::Write($req.target, $req.user, $req.secret); '{"ok":true}' }
  'get' { $v = [SlCred]::Read($req.target); if ($v -eq $null) { '{"ok":true,"found":false}' } else { @{ ok = $true; found = $true; secret = $v } | ConvertTo-Json -Compress } }
  'has' { @{ ok = $true; found = [SlCred]::Exists($req.target) } | ConvertTo-Json -Compress }
  'del' { @{ ok = $true; found = [SlCred]::Delete($req.target) } | ConvertTo-Json -Compress }
}`;
function windowsBackend(runner) {
  const call = async (op, account, secret) => {
    const r = await runner('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WIN_HELPER], JSON.stringify({ op, target: account ? SERVICE + '/' + account : '', user: account || '', secret: secret || '' }));
    if (r.missing) throw Object.assign(new Error('PowerShell is not available, so Windows Credential Manager cannot be used.'), { unavailable: true });
    let out = null; try { out = JSON.parse(r.stdout.trim().split(/\r?\n/).pop()); } catch {}
    if (r.code !== 0 || !out || !out.ok) throw new Error('Windows Credential Manager refused the request.');
    return out;
  };
  return { name: 'Windows Credential Manager', probe: () => call('probe'), set: (a, s) => call('set', a, s).then(() => true), get: a => call('get', a).then(o => (o.found ? o.secret : null)), has: a => call('has', a).then(o => !!o.found), remove: a => call('del', a).then(o => !!o.found) };
}

// ---------- macOS: Keychain ----------
// /usr/bin/security reads commands from stdin with -i, which keeps the password out of the process list.
const quote = value => '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
function macBackend(runner) {
  const sec = (args, input) => runner('/usr/bin/security', args, input);
  return {
    name: 'macOS Keychain',
    async probe() { const r = await sec(['list-keychains']); if (r.missing || r.code !== 0) throw Object.assign(new Error('The macOS Keychain is not available.'), { unavailable: true }); },
    async set(account, secret) { const r = await sec(['-i'], 'add-generic-password -U -s ' + quote(SERVICE) + ' -a ' + quote(account) + ' -l ' + quote(SERVICE + '/' + account) + ' -w ' + quote(secret) + '\n'); if (r.code !== 0) throw new Error('The Keychain refused the request.'); return true; },
    async get(account) { const r = await sec(['find-generic-password', '-s', SERVICE, '-a', account, '-w']); return r.code === 0 ? r.stdout.replace(/\n$/, '') : null; },
    async has(account) { const r = await sec(['find-generic-password', '-s', SERVICE, '-a', account]); return r.code === 0; },
    async remove(account) { const r = await sec(['delete-generic-password', '-s', SERVICE, '-a', account]); return r.code === 0; },
  };
}

// ---------- Linux: Secret Service ----------
function linuxBackend(runner) {
  const tool = (args, input) => runner('secret-tool', args, input), attrs = account => ['service', SERVICE, 'account', account];
  return {
    name: 'Secret Service (secret-tool)',
    async probe() { const r = await tool(['search', 'service', SERVICE + ' probe']); if (r.missing) throw Object.assign(new Error('secret-tool is not installed (package libsecret-tools), so no secure credential store is available.'), { unavailable: true }); if (r.code !== 0 && r.code !== 1) throw Object.assign(new Error('The Secret Service (keyring) is not running or is locked.'), { unavailable: true }); },
    async set(account, secret) { const r = await tool(['store', '--label', SERVICE + '/' + account, ...attrs(account)], secret); if (r.code !== 0) throw new Error('The keyring refused the request.'); return true; },
    async get(account) { const r = await tool(['lookup', ...attrs(account)]); return r.code === 0 && r.stdout ? r.stdout.replace(/\n$/, '') : null; },
    async has(account) { const r = await tool(['lookup', ...attrs(account)]); return r.code === 0 && !!r.stdout; },
    async remove(account) { const r = await tool(['clear', ...attrs(account)]); return r.code === 0; },
  };
}

function createCredentialVault({ platform = process.platform, runner = run } = {}) {
  const backend = platform === 'win32' ? windowsBackend(runner) : platform === 'darwin' ? macBackend(runner) : linuxBackend(runner);
  let status = null;
  async function available() {
    if (status && status.ok) return status;
    try { await backend.probe(); status = { ok: true, store: backend.name }; }
    catch (error) { status = { ok: false, store: backend.name, reason: error.message }; }
    return status;
  }
  const guard = async () => { const s = await available(); if (!s.ok) throw Object.assign(new Error(s.reason), { unavailable: true }); };
  return {
    available,
    // which of the three GM accounts have a saved password (never the passwords themselves)
    async list() { await guard(); const out = {}; for (const account of GM_ACCOUNTS) out[account] = await backend.has(account); return out; },
    async save(name, secret) { await guard(); return backend.set(accountOf(name), secretOf(secret)); },
    async reveal(name) { await guard(); return backend.get(accountOf(name)); },
    async remove(name) { await guard(); return backend.remove(accountOf(name)); },
  };
}

module.exports = { createCredentialVault, SERVICE, WIN_HELPER };
