'use strict';
const CRASH_EXIT_CODE = 70;
const SAVE_FAILURE_EXIT_CODE = 74;
function createRestartPolicy({ limit = 5, windowMs = 600000, baseDelayMs = 500, maxDelayMs = 30000 } = {}) {
  let failures = [];
  return {
    nextDelay(now) {
      failures = failures.filter(time => now - time < windowMs);
      if (failures.length >= limit) return null;
      failures.push(now); return Math.min(maxDelayMs, baseDelayMs * 2 ** (failures.length - 1));
    },
  };
}
module.exports = { CRASH_EXIT_CODE, SAVE_FAILURE_EXIT_CODE, createRestartPolicy };
