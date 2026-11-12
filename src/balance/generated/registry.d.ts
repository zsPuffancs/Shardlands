import type { Balance, BalanceEnvironment, DeepPartial, DeepReadonly, ResolvedBalance, RulesetName, SettingMode } from './types';
export declare const RULESETS: Readonly<Record<RulesetName, DeepPartial<Balance>>>;
export declare function settingMode(path: string): SettingMode;
export declare function freeze<T>(value: T): DeepReadonly<T>;
export declare function resolveBalance(environment: BalanceEnvironment, input?: unknown): ResolvedBalance;
export declare function resolveLiveUpdate(environment: BalanceEnvironment, current: ResolvedBalance, patch: unknown): ResolvedBalance;
