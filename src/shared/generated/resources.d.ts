export interface ResourceSnapshot {
    value: number;
    maximum: number;
    percent: number;
}
export interface BarOptions {
    step?: number;
    label?: string;
}
export declare const subtractResource: (current: number, amount: number) => number;
export declare const restoreResource: (current: number, maximum: number, amount: number) => number;
export declare function normalizeResource(value: number, maximum: number): ResourceSnapshot;
export declare function resourcePercent(value: number, maximum: number, step?: number): number;
export declare class ResourceBar {
    private readonly host;
    private readonly fill;
    private percent;
    private renderedText;
    private readonly attributes;
    constructor(host: HTMLElement);
    private attribute;
    update(value: number, maximum: number, text?: string, options?: BarOptions): ResourceSnapshot;
}
export declare function updateResourceBar(host: HTMLElement, value: number, maximum: number, text?: string, options?: BarOptions): ResourceSnapshot;
