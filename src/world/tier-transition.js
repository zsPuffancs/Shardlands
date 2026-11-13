'use strict';
const { performance } = require('node:perf_hooks');
const { attemptLimit } = require('./region-plan-retries');
const { createRegionPlanPreparer } = require('./region-plan-preparer');
const { MAX_ATLAS_TIER } = require('./region-blueprint');

function createTierTransitions({ state, save, makeRegion, makeInputs, recordVictory, activate, notify, maxAttempts,
  createPreparer = createRegionPlanPreparer }) {
  let job, preparer, finishing, suspended = false;
  const current = pending => !suspended && state.pendingUnlock === pending;
  const visibleTier = () => {
    const pending = state.pendingUnlock || finishing;
    return state.generatorVersion === 2 && pending && state.worldTier === pending.nextTier ? pending.beatenTier : state.worldTier;
  };
  const pendingEntryId = () => (state.pendingUnlock || finishing)?.entryId;
  const status = () => {
    const pending = state.pendingUnlock || finishing;
    return pending ? { status: pending.status, beatenTier: pending.beatenTier, nextTier: pending.nextTier,
      nextAttempt: pending.nextAttempt, diagnostics: pending.diagnostics, lastError: pending.lastError } : { status: 'idle' };
  };
  function diagnostic(pending, value) { pending.diagnostics = [...(pending.diagnostics || []), value].slice(-40); }
  async function run(pending) {
    const started = performance.now();
    try {
      if (pending.version !== 1 || !Number.isSafeInteger(pending.beatenTier) || pending.nextTier !== pending.beatenTier + 1 || ![pending.beatenTier, pending.nextTier].includes(state.worldTier)) throw Error('Invalid pending World Tier transition; entitlement preserved');
      // Flush the entitlement, kill receipt, player rewards and encounter state through
      // the existing coordinated save before starting any expensive preparation.
      await save(); if (!current(pending)) return { ok: false, status: 'paused' };
      if (pending.nextTier > MAX_ATLAS_TIER) throw Error('World Tier exceeds the coordinate runtime capacity; entitlement preserved');
      if (state.worldTier === pending.beatenTier) {
        if (!pending.region) pending.region = makeRegion(pending);
        if (!pending.inputs) pending.inputs = makeInputs(pending);
        if (pending.inputs.seed !== state.seed || pending.inputs.tier !== pending.nextTier || pending.region.tier !== pending.nextTier) throw Error('Pending generation inputs do not match this universe');
        await save(); if (!current(pending)) return { ok: false, status: 'paused' };
        preparer = createPreparer();
        const existing = pending.region.spawnPlan;
        if (existing) {
          const result = await preparer.attempt(pending.inputs, pending.region.generationAttempt || 0, 5000, existing);
          if (!current(pending)) return { ok: false, status: 'paused' };
          if (!result.ok) { diagnostic(pending, result.diagnostic); pending.lastError = { code: 'INVALID_SAVED_PLAN', message: 'Existing plan failed validation; it was preserved, not regenerated' }; pending.status = 'generation-failed'; await save(); return { ok: false, ...status() }; }
        } else {
          let accepted = false;
          for (let offset = 0; offset < attemptLimit(maxAttempts) && pending.nextAttempt < pending.attemptEnd; offset++) {
            if (performance.now() - started >= 30000) { const error = Error('World Tier preparation exceeded its 30 second deadline'); error.code = 'GENERATION_TIMEOUT'; throw error; }
            const attempt = pending.nextAttempt;
            if (!Number.isSafeInteger(attempt) || attempt < 0 || attempt >= Number.MAX_SAFE_INTEGER) throw Error('Generation attempt counter exhausted');
            const result = await preparer.attempt(pending.inputs, attempt, Math.min(5000, Math.max(1, 30000 - (performance.now() - started))));
            if (!current(pending)) return { ok: false, status: 'paused' };
            pending.nextAttempt = attempt + 1;
            if (result.ok) {
              pending.region.spawnPlan = result.plan; pending.region.generationAttempt = attempt;
              pending.region.generationValidation = { version: 1, generationAttempt: attempt };
              accepted = true; break;
            }
            diagnostic(pending, result.diagnostic); await save(); if (!current(pending)) return { ok: false, status: 'paused' };
          }
          if (!accepted) { pending.status = 'generation-failed'; pending.lastError = { code: 'GENERATION_EXHAUSTED', message: 'No valid candidate within this retry budget; progression entitlement retained' }; await save(); return { ok: false, ...status() }; }
        }
        pending.status = 'ready';
        await save(); if (!current(pending)) return { ok: false, status: 'paused' };
        // Keep already-generated region objects/state/identities authoritative. Runtime
        // closures may already reference a founding descriptor or a historical plan.
        const existingRegion = state.regions[pending.nextTier];
        if (existingRegion) {
          if (!existingRegion.spawnPlan) Object.assign(existingRegion, { spawnPlan: pending.region.spawnPlan,
            generationAttempt: pending.region.generationAttempt, generationValidation: pending.region.generationValidation });
        } else state.regions[pending.nextTier] = pending.region;
        state.worldTier = pending.nextTier; pending.status = 'committing';
        pending.entryId = recordVictory(pending).id;
      }
      // Never roll back an uncertain write: WAL/redo might already contain it.
      // Visibility and portal access stay at beatenTier until this save acknowledges.
      await save(); if (!current(pending)) return { ok: false, status: 'paused' };
      await activate(pending.nextTier); if (!current(pending)) return { ok: false, status: 'paused' };
      finishing = pending; delete state.pendingUnlock;
      try { await save(); } catch (error) { if (!state.pendingUnlock && state.worldTier === pending.nextTier) state.pendingUnlock = pending; throw error; }
      if (suspended || state.pendingUnlock || state.worldTier !== pending.nextTier) return { ok: false, status: 'paused' };
      finishing = null; notify(pending.entryId);
      return { ok: true, status: 'unlocked', tier: pending.nextTier };
    } catch (error) {
      if (!current(pending)) return { ok: false, status: 'paused' };
      pending.lastError = { code: error.code || 'PREPARATION_FAILED', message: String(error.message).slice(0, 300) };
      pending.status = state.worldTier === pending.nextTier ? 'committing' : 'generation-failed';
      // If persistence is unavailable, keep the in-memory entitlement too. The last
      // acknowledged pending/ready/commit record remains replayable after restart.
      try { await save(); } catch (saveError) { console.error('[tier transition save]', saveError.message); }
      console.error('[tier transition]', pending.lastError.message);
      return { ok: false, ...status() };
    } finally { finishing = null; await preparer?.close(); preparer = null; }
  }
  function resume({ retry = false } = {}) {
    if (state.generatorVersion !== 2) return Promise.resolve({ ok: false, status: 'legacy-v1' });
    if (job) return job;
    if (suspended || !state.pendingUnlock) return Promise.resolve({ ok: false, status: suspended ? 'paused' : 'idle' });
    const pending = state.pendingUnlock;
    if (pending.status === 'generation-failed' && !retry) return Promise.resolve({ ok: false, ...status() });
    if (retry && state.worldTier === pending.beatenTier) {
      pending.status = 'preparing'; pending.attemptEnd = Math.min(Number.MAX_SAFE_INTEGER, pending.nextAttempt + attemptLimit(maxAttempts)); delete pending.lastError;
    }
    job = run(pending).finally(() => { job = null; }); return job;
  }
  function stage({ players, boss, bossType, snapshot }) {
    if (state.pendingUnlock || finishing) return false;
    const beatenTier = state.worldTier;
    state.pendingUnlock = { version: 1, beatenTier, nextTier: beatenTier + 1, players: players.slice(), boss, bossType,
      snapshot: structuredClone(snapshot), generationSettings: structuredClone(state.generationSettings), nextAttempt: 0, attemptEnd: attemptLimit(maxAttempts), diagnostics: [], status: 'preparing' };
    // No generation, activation or worker startup inside the synchronous combat hook.
    setImmediate(() => { void resume().catch(error => console.error('[tier transition]', error)); });
    return true;
  }
  return { stage, resume, visibleTier, pendingEntryId, status, suspend() { suspended = true; void preparer?.close(); } };
}
module.exports = { createTierTransitions };
