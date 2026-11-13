'use strict';
const { Worker } = require('node:worker_threads');
const path = require('node:path');
// One serial, short-lived worker per pending unlock, not a pool or future-tier scheduler.
function createRegionPlanPreparer() {
  let worker, waiting, stopped = false;
  function reject(error) { if (waiting) { clearTimeout(waiting.timer); waiting.reject(error); waiting = null; } }
  return {
    attempt(inputs, generationAttempt, timeoutMs = 5000, plan) {
      if (stopped) return Promise.reject(Error('Region preparation was stopped'));
      if (waiting) return Promise.reject(Error('Overlapping generation attempts are not supported'));
      if (!worker) {
        worker = new Worker(path.join(__dirname, 'region-plan-worker.js'));
        worker.on('error', reject); worker.on('exit', code => reject(Error('Region generation worker exited: ' + code)));
        worker.on('message', result => { const job = waiting; if (!job) return; waiting = null; clearTimeout(job.timer); job.resolve(result); });
      }
      return new Promise((resolve, rejectJob) => {
        waiting = { resolve, reject: rejectJob, timer: setTimeout(() => { const error = Error('Region generation deadline exceeded'); error.code = 'GENERATION_TIMEOUT'; reject(error); void worker.terminate(); }, timeoutMs) };
        worker.postMessage({ inputs, generationAttempt, plan });
      });
    },
    async close() { stopped = true; reject(Error('Region preparation was stopped')); if (worker) await worker.terminate(); },
  };
}
module.exports = { createRegionPlanPreparer };
