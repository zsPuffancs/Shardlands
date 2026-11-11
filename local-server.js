'use strict';
const { fork } = require('node:child_process');
const path = require('node:path');
const { RESTART_EXIT_CODE } = require('./server-console');
const { startTunnel } = require('./tunnel');

let config = {};
try { config = JSON.parse(require('node:fs').readFileSync(path.join(__dirname, 'config.json'), 'utf8')); } catch {}
const tunnel = startTunnel({ config, port: process.env.PORT || config.port || 3000 });

let child, stopping = false;

function launch() {
  child = fork(path.join(__dirname, 'server.js'), ['--local-console'], {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  });
  child.on('error', error => {
    stopping = true;
    tunnel.stop();
    console.error('Could not launch the Shardlands server:', error);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    child = null;
    if (!stopping && code === RESTART_EXIT_CODE) {
      launch();
      return;
    }
    tunnel.stop();
    process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
  });
}

function stop() {
  if (stopping) return;
  stopping = true;
  if (child?.connected) {
    child.send('shutdown', error => {
      if (error && child?.connected) console.error('Could not request server shutdown:', error);
    });
  }
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
launch();
