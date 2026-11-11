'use strict';
// Optional Cloudflare quick tunnel: gives the local server a public https link friends can open.
// Started by the local launcher (start.bat / start.sh), so the link survives a server restart.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const LINK_FILE = path.join(__dirname, 'tunnel.json');
const LINK_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const MAX_RESTARTS = 3;

function findCloudflared(config) {
  const names = process.platform === 'win32'
    ? ['cloudflared.exe', 'cloudflared-windows-amd64.exe', 'cloudflared-windows-386.exe']
    : ['cloudflared', 'cloudflared-linux-amd64', 'cloudflared-darwin-amd64', 'cloudflared-darwin-arm64'];
  const folders = [path.join(__dirname, 'tools'), __dirname, path.join(__dirname, '..', 'cloud')];
  const candidates = [];
  if (config.tunnelPath) candidates.push(path.resolve(__dirname, String(config.tunnelPath)));
  for (const folder of folders) for (const name of names) candidates.push(path.join(folder, name));
  return candidates.find(file => { try { return fs.statSync(file).isFile(); } catch { return false; } }) || null;
}
const clearLink = () => { try { fs.unlinkSync(LINK_FILE); } catch {} };
// The web server reads the current link from here for the login page.
function readInviteLink() {
  try { const link = JSON.parse(fs.readFileSync(LINK_FILE, 'utf8')).url; return LINK_PATTERN.test(link) ? link : null; } catch { return null; }
}

function startTunnel({ config, port }) {
  clearLink();
  if (config.tunnel === false) return { stop() {} };
  const program = findCloudflared(config);
  if (!program) {
    console.log('  Invite link: off. Put cloudflared in the "tools" folder next to start.bat to get a public link for friends.');
    return { stop() {} };
  }
  let child = null, stopped = false, restarts = 0, announced = '';
  function launch() {
    child = spawn(program, ['tunnel', '--url', 'http://localhost:' + port, '--no-autoupdate'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const read = chunk => {
      const match = String(chunk).match(LINK_PATTERN);
      if (!match || match[0] === announced) return;
      announced = match[0];
      try { fs.writeFileSync(LINK_FILE, JSON.stringify({ url: announced, since: Date.now() })); } catch (error) { console.error('Could not save the invite link:', error.message); }
      console.log('\n  Invite link for friends: ' + announced + '\n  (It is also on the login page with a Copy button. The link changes every time you start the game.)\n');
    };
    child.stdout.on('data', read); child.stderr.on('data', read);
    child.on('error', error => { console.log('  Invite link: could not start cloudflared (' + error.message + ').'); });
    child.on('exit', () => {
      child = null; clearLink(); announced = '';
      if (stopped) return;
      if (restarts++ < MAX_RESTARTS) { console.log('  Invite link: the tunnel closed, reconnecting...'); setTimeout(() => { if (!stopped) launch(); }, 5000); }
      else console.log('  Invite link: the tunnel keeps closing. Restart the game to try again.');
    });
  }
  launch();
  return { stop() { stopped = true; clearLink(); if (child) try { child.kill(); } catch {} } };
}

module.exports = { startTunnel, readInviteLink, findCloudflared };
