'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork, spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');

test('relocated backend starts with plugins, checkpoints and restarts from isolated existing saves', { timeout: 30000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shardlands-architecture-'));
  const children = [];
  try {
    for (const entry of fs.readdirSync(root)) if (entry.endsWith('.js')) fs.copyFileSync(path.join(root, entry), path.join(directory, entry));
    for (const entry of ['src', 'plugins']) fs.cpSync(path.join(root, entry), path.join(directory, entry), { recursive: true });
    fs.mkdirSync(path.join(directory, 'public'));
    // Shared modules only; no real local settings, player saves or art assets.
    for (const entry of fs.readdirSync(path.join(root, 'public'))) if (entry.endsWith('.js')) fs.copyFileSync(path.join(root, 'public', entry), path.join(directory, 'public', entry));
    fs.writeFileSync(path.join(directory, 'config.json'), JSON.stringify({ serverName: 'Architecture fixture', disabledPlugins: [] }));
    async function startAndSave() {
      const child = fork(path.join(directory, 'server.js'), ['--local-console'], { cwd: directory, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
      children.push(child);
      let output = '', requested = false;
      child.stdout.on('data', data => {
        output += data;
        if (!requested && output.includes('Server is running!')) { requested = true; child.send('shutdown'); }
      });
      child.stderr.on('data', data => { output += data; });
      const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
      assert.equal(code, 0, output);
      assert.ok(requested, output);
      assert.match(output, /\+ admin v/);
      assert.match(output, /Save complete/);
      return JSON.parse(fs.readFileSync(path.join(directory, 'universe.json'), 'utf8'));
    }
    const first = await startAndSave();
    const second = await startAndSave();
    assert.equal(second.seed, first.seed);
    assert.equal(second.generatorVersion, first.generatorVersion);
    assert.deepEqual(second.regions, first.regions);
    fs.writeFileSync(path.join(directory, 'config.json'), JSON.stringify({ tunnel: false, balance: { ruleset: 'Custom', overrides: { rates: { goldRate: 2 } } } }));
    const launcher = spawn(process.execPath, [path.join(directory, 'local-server.js')], { cwd: directory, env: { ...process.env, PORT: '0' }, stdio: ['pipe', 'pipe', 'pipe'] });
    children.push(launcher);
    let launcherOutput = '', stopped = false;
    launcher.stdout.on('data', data => {
      launcherOutput += data;
      if (!stopped && launcherOutput.includes('Server is running!')) { stopped = true; launcher.stdin.write('stop\n'); }
    });
    launcher.stderr.on('data', data => { launcherOutput += data; });
    const launcherCode = await new Promise((resolve, reject) => { launcher.once('error', reject); launcher.once('exit', resolve); });
    assert.equal(launcherCode, 0, launcherOutput);
    assert.equal(stopped, true);
    assert.match(launcherOutput, /Save complete/);
    for (const file of ['saves.json', 'plugin-data.json', 'rates.json']) assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')), file);
    assert.equal(fs.existsSync(path.join(directory, 'src', 'server', 'universe.json')), false);
  } finally {
    for (const child of children) if (child.exitCode === null) child.kill();
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('shardlands-architecture-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
