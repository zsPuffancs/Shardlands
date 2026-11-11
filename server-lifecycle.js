'use strict';

const { startServerConsole, RESTART_EXIT_CODE } = require('./server-console');

function startServer({ server, transport, port, saveAll, reseed, tick, tickIntervalMs, getStatus, monsterCount, width, height, zoneCount }) {
  let pendingSave, stopping = false, serverConsole;
  const localLauncher = typeof process.send === 'function' && process.argv.includes('--local-console');
  function requestSave() {
    if (!pendingSave) pendingSave = saveAll().finally(() => { pendingSave = null; });
    return pendingSave;
  }
  const autosave = setInterval(requestSave, 10000);
  const simulationTimer = setInterval(tick, tickIntervalMs);

  async function shutdown({ restart = false } = {}) {
    if (stopping) return;
    stopping = true;
    console.log(restart ? 'Saving server data before restart...' : 'Saving server data before shutdown...');
    serverConsole?.close();
    clearInterval(autosave);
    clearInterval(simulationTimer);
    server.close();
    transport.close();
    await pendingSave;
    if (!(await saveAll())) {
      console.error('Server stopped after a save failure. Automatic restart was skipped.');
      process.exit(1);
    }
    console.log(restart ? 'Save complete. Restarting the server.' : 'Save complete. Server stopped.');
    process.exit(restart ? RESTART_EXIT_CODE : 0);
  }
  process.on('SIGINT', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });
  if (localLauncher) process.on('message', message => {
    if (message === 'shutdown') void shutdown();
  });

  function onStartupError(error) {
    clearInterval(autosave);
    clearInterval(simulationTimer);
    transport.close();
    const message = error.code === 'EADDRINUSE'
      ? 'Port ' + port + ' is already in use. Stop the other server or choose a different port.'
      : 'Could not start the server: ' + error.message;
    process.stderr.write(message + '\n', () => process.exit(1));
  }
  server.once('error', onStartupError);
  server.listen(port, () => {
    server.off('error', onStartupError);
    console.log('\n  Server is running!  Open http://localhost:' + port + '\n  Friends on your network can join via http://<your-LAN-IP>:' + port + '\n  (' + monsterCount() + ' monsters, map ' + width + 'x' + height + ', ' + zoneCount + ' zones)  Edit rates.json any time to change XP / gold / drops.\n');
    if (localLauncher || process.stdin.isTTY) {
      serverConsole = startServerConsole({ getStatus: getStatus, save: requestSave, shutdown, canRestart: localLauncher, reseed });
    }
  });
}

module.exports = { startServer };
