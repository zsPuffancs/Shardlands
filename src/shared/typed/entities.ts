// Structural records remain JSON-compatible; these helpers never construct saved class instances.
export type SpawnCategory = 'normal' | 'alpha' | 'stone' | 'boss' | 'worldBoss';
export type RewardCategory = SpawnCategory | 'summoned' | 'anomaly';
export type CategorizedEncounter =
  | { kind: 'summoned'; source: 'boss' | 'stone' | 'plugin' }
  | { kind: 'anomaly' }
  | { kind: SpawnCategory };
export interface TemplateFlags { stone?: unknown; boss?: unknown; worldBoss?: unknown; anomaly?: unknown }
export interface MonsterFlags { summoned?: unknown; alpha?: unknown; anomaly?: unknown }
export const WORLD_BOSS_SIZE = 1.5;
export function spawnCategory(template: TemplateFlags = {}, alpha: unknown = false): SpawnCategory {
  return template.stone ? 'stone' : template.worldBoss ? 'worldBoss' : template.boss ? 'boss' : alpha ? 'alpha' : 'normal';
}
export function rewardCategory(monster: MonsterFlags = {}, template: TemplateFlags = {}): RewardCategory {
  return monster.summoned ? 'summoned' : monster.anomaly || template.anomaly ? 'anomaly' : spawnCategory(template, monster.alpha);
}
export function markWorldBossTemplate<T extends { r: number; worldBoss?: unknown }>(template: T | undefined): void {
  if (!template || template.worldBoss) return;
  template.worldBoss = true; template.r = Math.round(template.r * WORLD_BOSS_SIZE);
}
export interface BossIdentity { type: string; archetype: string; name: string; signature: string }
export const worldBossId = (tier: number): string => 'wb' + tier;
export const worldBossIdentity = (tier: number, archetype: string, name: string, signature: string): BossIdentity => ({ type: worldBossId(tier), archetype, name, signature });
export function worldBossTemplate<T extends { r: number }>(template: T, identity: { name: string; archetype: string; element: string }): T & { name: string; archetype: string; element: string; worldBoss: true } {
  return { ...template, r: Math.round(template.r * WORLD_BOSS_SIZE), name: identity.name, archetype: identity.archetype, element: identity.element, worldBoss: true };
}
export function canAdvanceWorldTier(tier: number, region: { playable?: unknown; worldBoss: { type: string } }, monster: { ty: string; tier: number }): boolean {
  return tier < Number.MAX_SAFE_INTEGER && !!region.playable && region.worldBoss.type === monster.ty && monster.tier === tier - 1;
}
