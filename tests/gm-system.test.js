'use strict';
// Game Master system end to end, on an isolated server copy with temporary saves and runtime-generated passwords:
// separate authentication, reserved GM names, forced password change, rate limiting, server-checked commands,
// emblem replication, revocation on logout/disconnect, audit log, and no plaintext anywhere on disk or in logs.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { fork } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const { GM_ACCOUNTS, createGmAccountStore, generatePassword } = require('../src/player/gm-accounts');

const wait = ms => new Promise(r => setTimeout(r, ms));
function client(port) {
  const ws = new WebSocket('ws://127.0.0.1:' + port), inbox = [];
  const c = { ws, inbox, send: m => ws.send(JSON.stringify(m)),
    next: (pred, ms = 8000) => new Promise((resolve, reject) => { const t0 = Date.now(); (function poll() { const i = inbox.findIndex(pred); if (i >= 0) return resolve(inbox.splice(i, 1)[0]); if (Date.now() - t0 > ms) return reject(new Error('timeout waiting for message; got ' + inbox.map(m => m.t).join(','))); setTimeout(poll, 20); })(); }),
    none: async (pred, ms = 700) => { await wait(ms); return !inbox.some(pred); } };
  ws.onmessage = e => inbox.push(JSON.parse(e.data));
  c.open = new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  return c;
}

test('GM accounts: separate login, reserved characters, server-checked commands, emblem, revocation', { timeout: 120000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shardlands-gm-'));
  let child, output = '';
  try {
    for (const entry of fs.readdirSync(root)) if (entry.endsWith('.js')) fs.copyFileSync(path.join(root, entry), path.join(directory, entry));
    for (const entry of ['src', 'plugins']) fs.cpSync(path.join(root, entry), path.join(directory, entry), { recursive: true });
    fs.mkdirSync(path.join(directory, 'public'));
    for (const entry of fs.readdirSync(path.join(root, 'public'))) if (entry.endsWith('.js')) fs.copyFileSync(path.join(root, 'public', entry), path.join(directory, 'public', entry));
    fs.writeFileSync(path.join(directory, 'config.json'), JSON.stringify({ serverName: 'GM fixture', disabledPlugins: [], tunnel: false }));
    // provisioning as scripts/gm-provision.js does it: random passwords, hashes only, change required
    const store = createGmAccountStore({ directory }), initial = {};
    for (const account of GM_ACCOUNTS) { initial[account] = generatePassword(); await store.setPassword(account, initial[account], { mustChange: true, provisioned: true }); }
    const free = await new Promise(resolve => { const s = require('node:net').createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
    child = fork(path.join(directory, 'server.js'), ['--local-console'], { cwd: directory, env: { ...process.env, PORT: String(free) }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    child.stdout.on('data', d => { output += d; }); child.stderr.on('data', d => { output += d; });
    const t0 = Date.now(); while (!/localhost:(\d+)/.test(output) && Date.now() - t0 < 30000) await wait(50);
    const port = +output.match(/localhost:(\d+)/)[1];
    const chosen = {};

    // a normal player with a password
    const alice = client(port); await alice.open; alice.send({ t: 'join', name: 'Alice', pw: 'alice-secret-1', cls: 'blade', listDeltas: false });
    await alice.next(m => m.t === 'init');

    // 1. player login rejects GM names and credentials, in any spelling
    for (const name of ['zsPuffancs', 'coldsteel', 'MAXYKING']) {
      const c = client(port); await c.open; c.send({ t: 'join', name, pw: initial.ColdSteel });
      const err = await c.next(m => m.t === 'err'); assert.match(JSON.stringify(err), /reserved/i); c.ws.close();
    }
    // 2. GM login rejects player credentials, unknown accounts and wrong passwords
    const probe = client(port); await probe.open;
    probe.send({ t: 'gmLogin', user: 'Alice', pw: 'alice-secret-1' }); assert.equal((await probe.next(m => m.t === 'gmAuth')).ok, false);
    await wait(2100); probe.send({ t: 'gmLogin', user: 'zsPuffancs', pw: 'wrong-password-123' }); assert.equal((await probe.next(m => m.t === 'gmAuth')).ok, false);
    // without GM authentication nothing GM-related happens
    probe.send({ t: 'gmEnter' }); probe.send({ t: 'gm', op: 'giveGold', args: { amount: 5 } }); assert.ok(await probe.none(m => m.t === 'init' || m.t === 'gmResult'));
    probe.ws.close();

    // 3. each account signs in, must change its password, then enters its own character
    const gms = {};
    for (const [i, account] of GM_ACCOUNTS.entries()) {
      const c = client(port); await c.open; gms[account] = c;
      c.send({ t: 'gmLogin', user: account.toLowerCase(), pw: initial[account] });
      const auth = await c.next(m => m.t === 'gmAuth'); assert.equal(auth.ok, true); assert.equal(auth.account, account); assert.equal(auth.mustChange, true);
      c.send({ t: 'gmEnter', cls: 'blade' }); assert.equal((await c.next(m => m.t === 'gmAuth')).ok, false, 'cannot enter before changing the initial password');
      c.send({ t: 'gmChangePassword', current: initial[account], next: 'short' }); assert.equal((await c.next(m => m.t === 'gmPassword')).ok, false);
      chosen[account] = 'Chosen-' + crypto.randomBytes(9).toString('base64url');
      await wait(2100); c.send({ t: 'gmChangePassword', current: initial[account], next: chosen[account] }); assert.equal((await c.next(m => m.t === 'gmPassword')).ok, true);
      c.send({ t: 'gmEnter', cls: ['blade', 'archer', 'mage'][i], listDeltas: false });
      const init = await c.next(m => m.t === 'init'); assert.equal(init.name, account); assert.equal(init.gm, i + 1); assert.equal(init.admin, true);
      await c.next(m => m.t === 'gmState');
    }
    // the same account cannot be signed in twice
    { const c = client(port); await c.open; c.send({ t: 'gmLogin', user: 'ColdSteel', pw: chosen.ColdSteel }); const a = await c.next(m => m.t === 'gmAuth'); assert.equal(a.ok, false); assert.match(a.error, /already/); c.ws.close(); }

    // 4. other players see every GM character with its emblem index
    alice.inbox.length = 0;
    const seen = await alice.next(m => Array.isArray(m.pl) && GM_ACCOUNTS.every(n => m.pl.some(r => r.n === n)), 10000);
    for (const [i, account] of GM_ACCOUNTS.entries()) assert.equal(seen.pl.find(r => r.n === account).gm, i + 1);
    assert.ok(seen.pl.every(r => r.n === 'Alice' || r.gm), 'normal players carry no GM mark');

    // 5. commands run on the server; destructive ones need confirmation; normal players are refused
    const zs = gms.zsPuffancs;
    zs.send({ t: 'gm', op: 'giveGold', args: { amount: 777 } }); assert.match((await zs.next(m => m.t === 'gmResult')).msg, /777/);
    zs.send({ t: 'gm', op: 'giveGold', args: { target: 'Alice', amount: 50 } }); assert.match((await zs.next(m => m.t === 'gmResult')).msg, /Alice/);
    zs.send({ t: 'gm', op: 'setLevel', args: { level: 20 } }); assert.match((await zs.next(m => m.t === 'gmResult')).msg, /confirmation/);
    zs.send({ t: 'gm', op: 'setLevel', args: { level: 20 }, confirm: true }); assert.match((await zs.next(m => m.t === 'gmResult')).msg, /level 20/);
    zs.send({ t: 'gm', op: 'god' }); assert.match((await zs.next(m => m.t === 'gmResult')).msg, /God mode on/);
    zs.send({ t: 'gm', op: 'spawnItem', args: { item: 'hp', count: 5 } }); assert.equal((await zs.next(m => m.t === 'gmResult')).ok, true);
    zs.send({ t: 'gm', op: 'spawnGear', args: { slot: 'any', ilvl: 10, rarity: 3, count: 2 } }); assert.match((await zs.next(m => m.t === 'gmResult')).msg, /2 item/);
    zs.send({ t: 'gm', op: 'killMap', confirm: true }); assert.equal((await zs.next(m => m.t === 'gmResult')).ok, true);
    alice.send({ t: 'gm', op: 'giveGold', args: { amount: 1e6 } }); alice.send({ t: 'gm', op: 'god' }); alice.send({ t: 'gmEnter' });
    assert.ok(await alice.none(m => m.t === 'gmResult' || m.t === 'gmState'), 'a normal character cannot run GM commands');
    alice.send({ t: 'chat', m: '/god' }); await alice.next(m => m.t === 'msg' && /admins only/.test(JSON.stringify(m)));

    // 6. signing out ends GM rights at once; a disconnected GM leaves nothing behind
    zs.send({ t: 'gmLogout' }); await zs.next(m => m.t === 'gmLoggedOut');
    zs.send({ t: 'gm', op: 'giveGold', args: { amount: 1 } }); assert.ok(await zs.none(m => m.t === 'gmResult'));
    gms.MaxyKing.ws.close(); await wait(400); alice.inbox.length = 0;
    const after = await alice.next(m => Array.isArray(m.pl) && !m.pl.some(r => r.n === 'zsPuffancs' || r.n === 'MaxyKing'), 10000);
    assert.ok(after.pl.some(r => r.n === 'ColdSteel'));
    // signing in again needs the password; the new one works, the initial one no longer does
    { const c = client(port); await c.open; c.send({ t: 'gmLogin', user: 'MaxyKing', pw: initial.MaxyKing }); assert.equal((await c.next(m => m.t === 'gmAuth')).ok, false);
      await wait(2100); c.send({ t: 'gmLogin', user: 'MaxyKing', pw: chosen.MaxyKing }); const a = await c.next(m => m.t === 'gmAuth'); assert.equal(a.ok, true); assert.equal(a.mustChange, false); assert.equal(a.hasCharacter, true); c.ws.close(); }

    // 7. repeated guessing locks the account (5 failures), even with the right password afterwards
    { const c = client(port); await c.open; let locked = null;
      for (let k = 0; k < 7 && !locked; k++) { c.send({ t: 'gmLogin', user: 'ColdSteel', pw: 'guess-' + k }); const a = await c.next(m => m.t === 'gmAuth'); if (/Too many/.test(a.error || '')) locked = a; await wait(2100); }
      assert.ok(locked, 'locked out after repeated failures');
      c.send({ t: 'gmLogin', user: 'ColdSteel', pw: chosen.ColdSteel }); assert.match((await c.next(m => m.t === 'gmAuth')).error, /Too many/); c.ws.close(); }

    child.send('shutdown'); await new Promise(r => child.once('exit', r));
    // 8. GM characters are saved apart from player names; no plaintext password anywhere on disk or in the log
    const saves = JSON.parse(fs.readFileSync(path.join(directory, 'saves.json'), 'utf8'));
    for (const account of GM_ACCOUNTS) { assert.ok(saves['gm:' + account.toLowerCase()], account + ' saved under its GM key'); assert.equal(saves[account.toLowerCase()], undefined); }
    const audit = fs.readFileSync(path.join(directory, 'gm-audit.log'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.ok(audit.some(e => e.account === 'zsPuffancs' && e.action === 'giveGold' && e.target === 'Alice' && e.at));
    assert.ok(audit.some(e => e.action === 'login-failed') && audit.some(e => e.action === 'logout'));
    const disk = fs.readdirSync(directory).filter(f => fs.statSync(path.join(directory, f)).isFile() && !f.endsWith('.js')).map(f => fs.readFileSync(path.join(directory, f), 'utf8')).join('\n') + output;
    for (const secret of [...Object.values(initial), ...Object.values(chosen)]) assert.equal(disk.includes(secret), false, 'no plaintext password on disk or in logs');
  } finally {
    if (child && child.exitCode === null) child.kill();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
