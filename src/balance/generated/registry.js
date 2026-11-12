"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RULESETS = void 0;
exports.settingMode = settingMode;
exports.freeze = freeze;
exports.resolveBalance = resolveBalance;
exports.resolveLiveUpdate = resolveLiveUpdate;
// Preset names reserve configuration identities, not unapproved balance changes.
exports.RULESETS = Object.freeze({
    Normal: Object.freeze({}), Hardcore: Object.freeze({}), Accelerated: Object.freeze({}), Custom: Object.freeze({}),
});
const modes = {
    'rates.deathZoneMonsters': 'restart-required',
    'settlement.version': 'save-sensitive',
};
function settingMode(path) {
    if (modes[path])
        return modes[path];
    if (path.startsWith('rates.'))
        return 'live';
    if (path.startsWith('worldGeneration.') || path.startsWith('settlement.'))
        return 'generation-locked';
    throw new RangeError('Unknown setting path: ' + path);
}
function record(value, path) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
        throw new TypeError('Expected plain configuration object: ' + path);
    return value;
}
function number(value, path, min, max, integer = false) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value)))
        throw new RangeError('Invalid balance value: ' + path);
    return value;
}
function merge(target, patch, path = '') {
    for (const [key, value] of Object.entries(record(patch, path || 'balance'))) {
        if (!Object.hasOwn(target, key))
            throw new RangeError('Unknown balance setting: ' + path + key);
        const existing = target[key];
        if (value === undefined)
            throw new TypeError('Undefined balance value: ' + path + key);
        if (existing && typeof existing === 'object')
            merge(existing, value, path + key + '.');
        else
            target[key] = value;
    }
}
function freeze(value) {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value))
            freeze(child);
        Object.freeze(value);
    }
    return value;
}
function resolveBalance(environment, input = {}) {
    const request = record(input, 'request');
    for (const key of Object.keys(request))
        if (!['ruleset', 'overrides'].includes(key))
            throw new RangeError('Unknown resolution option: ' + key);
    const name = request.ruleset === undefined ? 'Normal' : request.ruleset;
    if (typeof name !== 'string' || !Object.hasOwn(exports.RULESETS, name))
        throw new RangeError('Unknown Server Ruleset: ' + String(name));
    const ruleset = name;
    const values = structuredClone(environment.base);
    // Optional generation entries need a known schema even when the base is empty.
    const optionalGeneration = {
        budgets: Object.fromEntries(Object.keys(environment.generationBudgets).map(key => [key, undefined])),
        spacing: Object.fromEntries(['camp', 'stone', 'alpha', 'boss', 'resource'].map(key => [key, undefined])),
        danger: { baseline: undefined, noise: undefined },
    };
    values.worldGeneration = Object.fromEntries(Object.entries(optionalGeneration).map(([key, schema]) => [key, { ...schema, ...values.worldGeneration[key] }]));
    merge(values, exports.RULESETS[ruleset]);
    if (request.overrides !== undefined)
        merge(values, request.overrides);
    for (const [key, value] of Object.entries(values.rates))
        number(value, 'rates.' + key, 0, environment.rateBounds[key]);
    const settlement = values.settlement;
    // Existing persisted cost schema is version 1. New versions require a migration.
    number(settlement.version, 'settlement.version', environment.base.settlement.version, environment.base.settlement.version, true);
    number(settlement.startingTier, 'settlement.startingTier', 1, Number.MAX_SAFE_INTEGER, true);
    number(settlement.scalingCoefficient, 'settlement.scalingCoefficient', 0, 1e6);
    number(settlement.scalingExponent, 'settlement.scalingExponent', 0, 4);
    for (const [key, value] of Object.entries(settlement.baseCosts))
        number(value, 'settlement.baseCosts.' + key, 1, environment.maxCurrency, true);
    for (const [domain, entries] of Object.entries(values.worldGeneration))
        for (const [key, value] of Object.entries(entries)) {
            if (value === undefined) {
                delete entries[key];
                continue;
            }
            const max = domain === 'budgets' ? environment.generationBudgets[key] : domain === 'spacing' ? 10000 : key === 'baseline' ? .65 : .25;
            const min = domain === 'danger' ? key === 'baseline' ? .25 : .05 : 0;
            number(value, 'worldGeneration.' + domain + '.' + key, min, max, domain === 'budgets');
        }
    return freeze({ ruleset, values });
}
function resolveLiveUpdate(environment, current, patch) {
    const check = (value, path = '') => {
        for (const [key, child] of Object.entries(record(value, path || 'patch'))) {
            const next = path ? path + '.' + key : key;
            if (child && typeof child === 'object')
                check(child, next);
            else if (settingMode(next) !== 'live')
                throw new RangeError('Setting requires restart or a new persisted snapshot: ' + next);
        }
    };
    check(patch);
    const values = structuredClone(current.values);
    merge(values, patch);
    return resolveBalance(environment, { ruleset: current.ruleset, overrides: values });
}
