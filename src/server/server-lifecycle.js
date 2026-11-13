'use strict';

const { startServerConsole, RESTART_EXIT_CODE } = require('./server-console');
const { CRASH_EXIT_CODE, SAVE_FAILURE_EXIT_CODE } = require('./restart-policy');

function startServer({ server, transport, port, saveAll, reseed, tick, tickIntervalMs, getStatus, monsterCount, width, height, zoneCount, beforeShutdown = () => {}, shutdownTimeoutMs = 10000 }) {
  let pendingSave, stopping = false, serverConsole;
  const localLauncher = typeof process.send === 'function' && process.argv.includes('--local-console');
  function requestSave() {
    if (!pendingSave) pendingSave = Promise.resolve().then(saveAll).catch(error => { console.error('[autosave]', error); return false; }).finally(() => { pendingSave = null; });
    return pendingSave;
  }
  const autosave = setInterval(requestSave, 10000);
  let simulationTimer;
  function scheduleTick() {
    const startedAt = performance.now();
    try { tick(); } catch (error) { crash(error); return; }
    if (!stopping) simulationTimer = setTimeout(scheduleTick, Math.max(1, tickIntervalMs - (performance.now() - startedAt)));
  }
  simulationTimer = setTimeout(scheduleTick, tickIntervalMs);

  function crash(error) {
    if (stopping) { console.error('[fatal during shutdown]', error); process.exit(CRASH_EXIT_CODE); return; }
    stopping = true; clearInterval(autosave); clearTimeout(simulationTimer);
    try { serverConsole?.close(); server.close(); transport.close(); } catch (closeError) { console.error('[fatal close]', closeError); }
    // A thrown tick may have partially mutated a multi-step operation. Never persist
    // that uncertain state or continue simulating it; recover the last durable transaction.
    console.error('[fatal] Server stopped; recovering the last durable checkpoint on restart:', error);
    process.exit(CRASH_EXIT_CODE);
  }
  process.on('uncaughtException', crash);
  process.on('unhandledRejection', crash);

  async function shutdown({ restart = false } = {}) {
    if (stopping) return;
    stopping = true;
    console.log(restart ? 'Saving server data before restart...' : 'Saving server data before shutdown...');
    serverConsole?.close();
    clearInterval(autosave);
    clearTimeout(simulationTimer);
    const finalSave = async () => { await pendingSave; if (!(await saveAll())) throw Error('Final save failed'); await saveAll.checkpoint?.(); };
    let timeout;
    try {
      beforeShutdown(); server.close(); transport.close();
      await Promise.race([finalSave(), new Promise((resolve, reject) => { timeout = setTimeout(() => reject(Error('Shutdown save deadline exceeded')), shutdownTimeoutMs); })]);
      clearTimeout(timeout);
    } catch (error) {
      console.error('[shutdown save]', error);
      console.error('Server stopped after a save failure. Automatic restart was skipped.');
      process.exit(SAVE_FAILURE_EXIT_CODE);
      return;
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
    clearTimeout(simulationTimer);
    transport.close();
    const message = error.code === 'EADDRINUSE'
      ? 'Port ' + port + ' is already in use. Stop the other server or choose a different port.'
      : 'Could not start the server: ' + error.message;
    process.stderr.write(message + '\n', () => process.exit(SAVE_FAILURE_EXIT_CODE));
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
