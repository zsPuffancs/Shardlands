'use strict';
// Game Master accounts: a credential store separate from player saves.
//
// - Exactly the three accounts in GM_ACCOUNTS can exist; there is no registration.
// - Passwords are stored only as scrypt hashes (per-account random salt, N = 2^15, r = 8, p = 1) in gm-accounts.json
//   at the repository root (git-ignored, never bundled). Plaintext never touches disk, logs or the network beyond the
//   login message itself.
// - Hashing runs on libuv's thread pool (async scrypt), so logins never stall the game tick.
// - Provisioning (scripts/gm-provision.js) creates missing accounts and never overwrites an existing one unless asked
//   to reset that account explicitly. New and reset accounts must change their password on first login.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { replaceFile } = require('../server/durable-files');

const GM_ACCOUNTS = Object.freeze(['zsPuffancs', 'ColdSteel', 'MaxyKing']);
const SCRYPT = Object.freeze({ N: 1 << 15, r: 8, p: 1, keylen: 64, maxmem: 96 * 1024 * 1024 });
const MIN_PASSWORD = 12, MAX_PASSWORD = 128;
const FILE_NAME = 'gm-accounts.json';

const canonical = name => GM_ACCOUNTS.find(account => account.toLowerCase() === String(name || '').trim().toLowerCase()) || null;
const isGmName = name => canonical(name) !== null;

function scrypt(password, salt, params = SCRYPT) {
  return new Promise((resolve, reject) => crypto.scrypt(String(password).normalize('NFKC'), salt, params.keylen, { N: params.N, r: params.r, p: params.p, maxmem: params.maxmem || SCRYPT.maxmem }, (error, key) => (error ? reject(error) : resolve(key))));
}
async function hashPassword(password) {
  const salt = crypto.randomBytes(16), key = await scrypt(password, salt);
  return { alg: 'scrypt', N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, keylen: SCRYPT.keylen, salt: salt.toString('base64'), hash: key.toString('base64') };
}
// A strong random password: 24 characters from an unambiguous alphabet (~139 bits).
function generatePassword(length = 24) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_!@#%+=';
  let out = '';
  while (out.length < length) { const byte = crypto.randomBytes(1)[0]; if (byte < Math.floor(256 / alphabet.length) * alphabet.length) out += alphabet[byte % alphabet.length]; }
  return out;
}
// Password rules for a GM-chosen password. Returns an error message or null.
function passwordProblem(password, account, previous) {
  const value = String(password || '');
  if (value.length < MIN_PASSWORD) return 'Use at least ' + MIN_PASSWORD + ' characters.';
  if (value.length > MAX_PASSWORD) return 'Use at most ' + MAX_PASSWORD + ' characters.';
  if (account && value.toLowerCase().includes(account.toLowerCase())) return 'The password must not contain the account name.';
  if (new Set(value).size < 6) return 'Use a less repetitive password.';
  if (previous !== undefined && value === previous) return 'Choose a password different from the current one.';
  return null;
}

function createGmAccountStore({ directory, file = path.join(directory, FILE_NAME) }) {
  let data = { version: 1, accounts: {} };
  const load = () => {
    try { const parsed = JSON.parse(fs.readFileSync(file, 'utf8')); if (parsed && typeof parsed === 'object' && parsed.accounts && typeof parsed.accounts === 'object') data = parsed; }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('gm-accounts.json is unreadable: ' + error.message); }
    return data;
  };
  load();
  const persist = () => { replaceFile(file, JSON.stringify(data, null, 2)); try { fs.chmodSync(file, 0o600); } catch {} };
  const record = name => { const account = canonical(name); return account && Object.hasOwn(data.accounts, account) ? data.accounts[account] : null; };
  // a hash of a random password: unknown accounts take as long to reject as wrong passwords
  let decoy = null;
  const decoyRecord = async () => decoy || (decoy = await hashPassword(crypto.randomBytes(24).toString('base64')));

  async function verify(name, password) {
    const account = canonical(name), stored = account ? record(account) : null;
    const entry = stored || await decoyRecord();
    if (typeof password !== 'string' || password.length > MAX_PASSWORD) { await scrypt('x', Buffer.alloc(16), SCRYPT); return { ok: false }; }
    const key = await scrypt(password, Buffer.from(entry.salt, 'base64'), entry);
    const expected = Buffer.from(entry.hash, 'base64');
    const match = key.length === expected.length && crypto.timingSafeEqual(key, expected);
    if (!stored || !match) return { ok: false };
    return { ok: true, account, mustChange: !!stored.mustChange };
  }
  async function setPassword(name, password, { mustChange = false, provisioned = false } = {}) {
    const account = canonical(name); if (!account) throw new Error('not a GM account');
    const previous = record(account);
    data.accounts[account] = Object.assign({}, previous, await hashPassword(password), { mustChange, updatedAt: new Date().toISOString() }, provisioned ? { provisionedAt: new Date().toISOString() } : {});
    persist();
  }
  async function changePassword(name, current, next) {
    const check = await verify(name, current); if (!check.ok) return { ok: false, error: 'The current password is wrong.' };
    const problem = passwordProblem(next, check.account, current); if (problem) return { ok: false, error: problem };
    await setPassword(check.account, next, { mustChange: false }); return { ok: true };
  }
  return {
    file, reload: load, verify, setPassword, changePassword,
    has: name => !!record(name), provisioned: () => GM_ACCOUNTS.filter(account => record(account)),
    mustChange: name => !!(record(name) || {}).mustChange,
  };
}

// Repeated-guess protection, keyed both by account and by client address (the tunnel forwards the visitor's
// address). After 5 failures inside 15 minutes the key is locked, doubling from 30 s up to 15 minutes.
function createLoginLimiter({ now = () => Date.now(), window = 15 * 60000, free = 5, base = 30000, max = 15 * 60000 } = {}) {
  const entries = new Map();
  const get = key => { let e = entries.get(key); const t = now(); if (!e || t - e.first > window && t >= e.until) { e = { first: t, fails: 0, until: 0 }; entries.set(key, e); } return e; };
  return {
    // milliseconds until another attempt is allowed for any of the keys (0 = allowed)
    wait(keys) { const t = now(); return Math.max(0, ...keys.map(key => (entries.get(key)?.until || 0) - t)); },
    fail(keys) { for (const key of keys) { const e = get(key); e.fails++; if (e.fails >= free) e.until = now() + Math.min(max, base * 2 ** (e.fails - free)); } },
    succeed(keys) { for (const key of keys) entries.delete(key); },
    size: () => entries.size,
  };
}

module.exports = { GM_ACCOUNTS, FILE_NAME, SCRYPT, MIN_PASSWORD, canonical, isGmName, hashPassword, generatePassword, passwordProblem, createGmAccountStore, createLoginLimiter };
