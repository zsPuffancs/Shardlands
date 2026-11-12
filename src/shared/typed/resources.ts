// Shared pure resource arithmetic and DOM presentation; build emits Node and browser artifacts.
export interface ResourceSnapshot { value: number; maximum: number; percent: number }
export interface BarOptions { step?: number; label?: string }
// Authoritative arithmetic deliberately preserves overkill/fractional health.
// Display normalization must never be substituted into damage/death processing.
export const subtractResource = (current: number, amount: number): number => current - amount;
export const restoreResource = (current: number, maximum: number, amount: number): number => Math.min(maximum, current + amount);
export function normalizeResource(value: number, maximum: number): ResourceSnapshot {
  maximum = Number.isFinite(maximum) && maximum > 0 ? maximum : 0;
  value = Number.isFinite(value) ? Math.max(0, Math.min(maximum, value)) : 0;
  return { value, maximum, percent: maximum ? value / maximum * 100 : 0 };
}
export function resourcePercent(value: number, maximum: number, step = 1): number {
  if (!Number.isFinite(step) || step <= 0) throw new RangeError('Invalid resource percentage step');
  return Math.round(normalizeResource(value, maximum).percent / step) * step;
}
export class ResourceBar {
  private readonly fill: HTMLElement;
  private percent = -1;
  private renderedText: string | undefined;
  private readonly attributes = new Map<string, string>();
  constructor(private readonly host: HTMLElement) {
    if (!host.firstElementChild) throw new TypeError('Resource bar requires an existing fill element');
    this.fill = host.firstElementChild as HTMLElement;
    this.attribute('role', 'progressbar');
    this.attribute('aria-valuemin', '0');
  }
  private attribute(name: string, value: string): void {
    if (this.attributes.get(name) !== value) { this.attributes.set(name, value); this.host.setAttribute(name, value); }
  }
  update(value: number, maximum: number, text?: string, options: BarOptions = {}): ResourceSnapshot {
    const snapshot = normalizeResource(value, maximum), percent = resourcePercent(value, maximum, options.step ?? 1);
    if (percent !== this.percent) { this.percent = percent; this.fill.style.width = percent + '%'; }
    if (text !== undefined && text !== this.renderedText) {
      this.renderedText = text;
      if (this.host.lastElementChild && this.host.lastElementChild !== this.fill) this.host.lastElementChild.textContent = text;
      this.attribute('aria-valuetext', text);
    }
    this.attribute('aria-valuenow', String(snapshot.value));
    this.attribute('aria-valuemax', String(snapshot.maximum));
    if (options.label) this.attribute('aria-label', options.label);
    return snapshot;
  }
}
const presenters = new WeakMap<HTMLElement, ResourceBar>();
export function updateResourceBar(host: HTMLElement, value: number, maximum: number, text?: string, options?: BarOptions): ResourceSnapshot {
  let bar = presenters.get(host);
  if (!bar) { bar = new ResourceBar(host); presenters.set(host, bar); }
  return bar.update(value, maximum, text, options);
}
