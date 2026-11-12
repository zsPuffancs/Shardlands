"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.worldBossIdentity = exports.worldBossId = exports.WORLD_BOSS_SIZE = void 0;
exports.spawnCategory = spawnCategory;
exports.rewardCategory = rewardCategory;
exports.markWorldBossTemplate = markWorldBossTemplate;
exports.worldBossTemplate = worldBossTemplate;
exports.canAdvanceWorldTier = canAdvanceWorldTier;
exports.WORLD_BOSS_SIZE = 1.5;
function spawnCategory(template = {}, alpha = false) {
    return template.stone ? 'stone' : template.worldBoss ? 'worldBoss' : template.boss ? 'boss' : alpha ? 'alpha' : 'normal';
}
function rewardCategory(monster = {}, template = {}) {
    return monster.summoned ? 'summoned' : monster.anomaly || template.anomaly ? 'anomaly' : spawnCategory(template, monster.alpha);
}
function markWorldBossTemplate(template) {
    if (!template || template.worldBoss)
        return;
    template.worldBoss = true;
    template.r = Math.round(template.r * exports.WORLD_BOSS_SIZE);
}
const worldBossId = (tier) => 'wb' + tier;
exports.worldBossId = worldBossId;
const worldBossIdentity = (tier, archetype, name, signature) => ({ type: (0, exports.worldBossId)(tier), archetype, name, signature });
exports.worldBossIdentity = worldBossIdentity;
function worldBossTemplate(template, identity) {
    return { ...template, r: Math.round(template.r * exports.WORLD_BOSS_SIZE), name: identity.name, archetype: identity.archetype, element: identity.element, worldBoss: true };
}
function canAdvanceWorldTier(tier, region, monster) {
    return tier < Number.MAX_SAFE_INTEGER && !!region.playable && region.worldBoss.type === monster.ty && monster.tier === tier - 1;
}
