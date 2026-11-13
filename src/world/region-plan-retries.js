'use strict';
const { generateSpawnPlan, validateSpawnPlan } = require('./world-generation');
const MAX_GENERATION_ATTEMPTS = 20;
function attemptLimit(value = MAX_GENERATION_ATTEMPTS) { return Number.isSafeInteger(value) ? Math.max(1, Math.min(MAX_GENERATION_ATTEMPTS, value)) : MAX_GENERATION_ATTEMPTS; }
function validatePreparedPlan(plan, inputs) {
  const validation = validateSpawnPlan(plan), expected = inputs.zone.worldBoss;
  if (plan.version !== 2) validation.errors.push('unsupported-plan-version');
  if (plan.tier !== inputs.tier) validation.errors.push('plan-tier-mismatch');
  if (plan.danger && plan.danger.version !== 1) validation.errors.push('unsupported-danger-version');
  if (!plan.requiredLocations?.some(required => required.type === expected) || !plan.spawns.some(spawn => spawn.kind === 'boss' && spawn.type === expected)) validation.errors.push('missing-required-world-boss');
  if (inputs.progressionVersion && !plan.progression) validation.errors.push('missing-progression-policy');
  if (inputs.progressionVersion && plan.progression && plan.progression.version !== inputs.progressionVersion) validation.errors.push('unsupported-progression-policy');
  validation.valid = !validation.errors.length; return validation;
}
function failure(error, generationAttempt) {
  return { generationAttempt, code: error.code || 'INVALID_GENERATION', errors: (error.diagnostics?.errors || [error.message]).slice(0, 32).map(text => String(text).slice(0, 240)) };
}
function generateRegionAttempt(inputs, generationAttempt, generate = generateSpawnPlan) {
  try {
    const plan = generate({ ...inputs, generationAttempt }), validation = validatePreparedPlan(plan, inputs);
    if (!validation.valid) return { ok: false, diagnostic: { generationAttempt, code: 'INVALID_PLAN', errors: validation.errors.slice(0, 32) } };
    return { ok: true, generationAttempt, plan };
  } catch (error) { return { ok: false, diagnostic: failure(error, generationAttempt) }; }
}
// Pure bounded helper for tooling/tests. Live unlocks run these same attempts off-thread.
function generateValidRegionPlan(inputs, { startAttempt = 0, maxAttempts = MAX_GENERATION_ATTEMPTS, generate } = {}) {
  if (!Number.isSafeInteger(startAttempt) || startAttempt < 0 || startAttempt > Number.MAX_SAFE_INTEGER - MAX_GENERATION_ATTEMPTS) throw new RangeError('Invalid starting attempt');
  const diagnostics = [];
  for (let offset = 0; offset < attemptLimit(maxAttempts); offset++) {
    const result = generateRegionAttempt(inputs, startAttempt + offset, generate);
    if (result.ok) return { ...result, diagnostics, nextAttempt: result.generationAttempt + 1 };
    diagnostics.push(result.diagnostic);
  }
  return { ok: false, code: 'GENERATION_EXHAUSTED', diagnostics, nextAttempt: startAttempt + diagnostics.length };
}
module.exports = { MAX_GENERATION_ATTEMPTS, attemptLimit, validatePreparedPlan, generateRegionAttempt, generateValidRegionPlan };
