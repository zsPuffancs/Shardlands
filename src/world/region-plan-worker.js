'use strict';
const { parentPort } = require('node:worker_threads');
const { generateRegionAttempt, validatePreparedPlan } = require('./region-plan-retries');
parentPort.on('message', ({ inputs, generationAttempt, plan }) => {
  if (!plan) { parentPort.postMessage(generateRegionAttempt(inputs, generationAttempt)); return; }
  try {
    const validation = validatePreparedPlan(plan, inputs);
    parentPort.postMessage(validation.valid ? { ok: true, plan, generationAttempt, reused: true } : { ok: false, diagnostic: { generationAttempt, code: 'INVALID_SAVED_PLAN', errors: validation.errors.slice(0, 32) } });
  } catch (error) { parentPort.postMessage({ ok: false, diagnostic: { generationAttempt, code: 'INVALID_SAVED_PLAN', errors: [error.message] } }); }
});
