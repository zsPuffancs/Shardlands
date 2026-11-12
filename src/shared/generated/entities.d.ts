export type SpawnCategory = 'normal' | 'alpha' | 'stone' | 'boss' | 'worldBoss';
export type RewardCategory = SpawnCategory | 'summoned' | 'anomaly';
export type CategorizedEncounter = {
    kind: 'summoned';
    source: 'boss' | 'stone' | 'plugin';
} | {
    kind: 'anomaly';
} | {
    kind: SpawnCategory;
};
export interface TemplateFlags {
    stone?: unknown;
    boss?: unknown;
    worldBoss?: unknown;
    anomaly?: unknown;
}
export interface MonsterFlags {
    summoned?: unknown;
    alpha?: unknown;
    anomaly?: unknown;
}
export declare const WORLD_BOSS_SIZE = 1.5;
export declare function spawnCategory(template?: TemplateFlags, alpha?: unknown): SpawnCategory;
export declare function rewardCategory(monster?: MonsterFlags, template?: TemplateFlags): RewardCategory;
export declare function markWorldBossTemplate<T extends {
    r: number;
    worldBoss?: unknown;
}>(template: T | undefined): void;
export interface BossIdentity {
    type: string;
    archetype: string;
    name: string;
    signature: string;
}
export declare const worldBossId: (tier: number) => string;
export declare const worldBossIdentity: (tier: number, archetype: string, name: string, signature: string) => BossIdentity;
export declare function worldBossTemplate<T extends {
    r: number;
}>(template: T, identity: {
    name: string;
    archetype: string;
    element: string;
}): T & {
    name: string;
    archetype: string;
    element: string;
    worldBoss: true;
};
export declare function canAdvanceWorldTier(tier: number, region: {
    playable?: unknown;
    worldBoss: {
        type: string;
    };
}, monster: {
    ty: string;
    tier: number;
}): boolean;
