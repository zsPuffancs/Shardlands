// Authoritative TypeScript source; edit this file rather than generated/registry.js.
import type { Balance, BalanceEnvironment, DeepPartial, DeepReadonly, ResolvedBalance, RulesetName, SettingMode } from './types';

// Preset names reserve configuration identities, not unapproved balance changes.
export const RULESETS: Readonly<Record<RulesetName, DeepPartial<Balance>>> = Object.freeze({
  Normal: Object.freeze({}), Hardcore: Object.freeze({}), Accelerated: Object.freeze({}), Custom: Object.freeze({}),
});
const modes: Record<string, SettingMode> = {
  'rates.deathZoneMonsters': 'restart-required',
  'settlement.version': 'save-sensitive',
};
export function settingMode(path: string): SettingMode {
  if (modes[path]) return modes[path];
  if (path.startsWith('rates.')) return 'live';
  if (path.startsWith('worldGeneration.') || path.startsWith('settlement.')) return 'generation-locked';
  throw new RangeError('Unknown setting path: ' + path);
}
function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('Expected plain configuration object: ' + path);
  return value as Record<string, unknown>;
}
function number(value: unknown, path: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) throw new RangeError('Invalid balance value: ' + path);
  return value;
}
function merge(target: Record<string, unknown>, patch: unknown, path = ''): void {
  for (const [key, value] of Object.entries(record(patch, path || 'balance'))) {
    if (!Object.hasOwn(target, key)) throw new RangeError('Unknown balance setting: ' + path + key);
    const existing = target[key];
    if (value === undefined) throw new TypeError('Undefined balance value: ' + path + key);
    if (existing && typeof existing === 'object') merge(existing as Record<string, unknown>, value, path + key + '.');
    else target[key] = value;
  }
}
export function freeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}
export function resolveBalance(environment: BalanceEnvironment, input: unknown = {}): ResolvedBalance {
  const request = record(input, 'request');
  for (const key of Object.keys(request)) if (!['ruleset', 'overrides'].includes(key)) throw new RangeError('Unknown resolution option: ' + key);
  const name = request.ruleset === undefined ? 'Normal' : request.ruleset;
  if (typeof name !== 'string' || !Object.hasOwn(RULESETS, name)) throw new RangeError('Unknown Server Ruleset: ' + String(name));
  const ruleset = name as RulesetName;
  const values = structuredClone(environment.base);
  // Optional generation entries need a known schema even when the base is empty.
  const optionalGeneration = {
    budgets: Object.fromEntries(Object.keys(environment.generationBudgets).map(key => [key, undefined])),
    spacing: Object.fromEntries(['camp', 'stone', 'alpha', 'boss', 'resource'].map(key => [key, undefined])),
    danger: { baseline: undefined, noise: undefined },
  };
  values.worldGeneration = Object.fromEntries(Object.entries(optionalGeneration).map(([key, schema]) => [key, { ...schema, ...values.worldGeneration[key as keyof typeof optionalGeneration] }])) as unknown as Balance['worldGeneration'];
  merge(values as unknown as Record<string, unknown>, RULESETS[ruleset]);
  if (request.overrides !== undefined) merge(values as unknown as Record<string, unknown>, request.overrides);
  for (const [key, value] of Object.entries(values.rates)) number(value, 'rates.' + key, 0, environment.rateBounds[key as keyof Balance['rates']]);
  const settlement = values.settlement;
  // Existing persisted cost schema is version 1. New versions require a migration.
  number(settlement.version, 'settlement.version', environment.base.settlement.version, environment.base.settlement.version, true);
  number(settlement.startingTier, 'settlement.startingTier', 1, Number.MAX_SAFE_INTEGER, true);
  number(settlement.scalingCoefficient, 'settlement.scalingCoefficient', 0, 1e6);
  number(settlement.scalingExponent, 'settlement.scalingExponent', 0, 4);
  for (const [key, value] of Object.entries(settlement.baseCosts)) number(value, 'settlement.baseCosts.' + key, 1, environment.maxCurrency, true);
  for (const [domain, entries] of Object.entries(values.worldGeneration)) for (const [key, value] of Object.entries(entries)) {
    if (value === undefined) { delete (entries as Record<string, unknown>)[key]; continue; }
    const max = domain === 'budgets' ? environment.generationBudgets[key]! : domain === 'spacing' ? 10000 : key === 'baseline' ? .65 : .25;
    const min = domain === 'danger' ? key === 'baseline' ? .25 : .05 : 0;
    number(value, 'worldGeneration.' + domain + '.' + key, min, max, domain === 'budgets');
  }
  return freeze({ ruleset, values });
}
export function resolveLiveUpdate(environment: BalanceEnvironment, current: ResolvedBalance, patch: unknown): ResolvedBalance {
  const check = (value: unknown, path = ''): void => {
    for (const [key, child] of Object.entries(record(value, path || 'patch'))) {
      const next = path ? path + '.' + key : key;
      if (child && typeof child === 'object') check(child, next);
      else if (settingMode(next) !== 'live') throw new RangeError('Setting requires restart or a new persisted snapshot: ' + next);
    }
  };
  check(patch);
  const values = structuredClone(current.values);
  merge(values as unknown as Record<string, unknown>, patch);
  return resolveBalance(environment, { ruleset: current.ruleset, overrides: values });
}
