// GENERATED from src/shared/typed/resources.ts by npm run build. Do not edit.
(function(root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.SharedResources = factory(); })(typeof globalThis === "object" ? globalThis : this, function() {
const exports = {};
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourceBar = exports.restoreResource = exports.subtractResource = void 0;
exports.normalizeResource = normalizeResource;
exports.resourcePercent = resourcePercent;
exports.updateResourceBar = updateResourceBar;
// Authoritative arithmetic deliberately preserves overkill/fractional health.
// Display normalization must never be substituted into damage/death processing.
const subtractResource = (current, amount) => current - amount;
exports.subtractResource = subtractResource;
const restoreResource = (current, maximum, amount) => Math.min(maximum, current + amount);
exports.restoreResource = restoreResource;
function normalizeResource(value, maximum) {
    maximum = Number.isFinite(maximum) && maximum > 0 ? maximum : 0;
    value = Number.isFinite(value) ? Math.max(0, Math.min(maximum, value)) : 0;
    return { value, maximum, percent: maximum ? value / maximum * 100 : 0 };
}
function resourcePercent(value, maximum, step = 1) {
    if (!Number.isFinite(step) || step <= 0)
        throw new RangeError('Invalid resource percentage step');
    return Math.round(normalizeResource(value, maximum).percent / step) * step;
}
class ResourceBar {
    host;
    fill;
    percent = -1;
    renderedText;
    attributes = new Map();
    constructor(host) {
        this.host = host;
        if (!host.firstElementChild)
            throw new TypeError('Resource bar requires an existing fill element');
        this.fill = host.firstElementChild;
        this.attribute('role', 'progressbar');
        this.attribute('aria-valuemin', '0');
    }
    attribute(name, value) {
        if (this.attributes.get(name) !== value) {
            this.attributes.set(name, value);
            this.host.setAttribute(name, value);
        }
    }
    update(value, maximum, text, options = {}) {
        const snapshot = normalizeResource(value, maximum), percent = resourcePercent(value, maximum, options.step ?? 1);
        if (percent !== this.percent) {
            this.percent = percent;
            this.fill.style.width = percent + '%';
        }
        if (text !== undefined && text !== this.renderedText) {
            this.renderedText = text;
            if (this.host.lastElementChild && this.host.lastElementChild !== this.fill)
                this.host.lastElementChild.textContent = text;
            this.attribute('aria-valuetext', text);
        }
        this.attribute('aria-valuenow', String(snapshot.value));
        this.attribute('aria-valuemax', String(snapshot.maximum));
        if (options.label)
            this.attribute('aria-label', options.label);
        return snapshot;
    }
}
exports.ResourceBar = ResourceBar;
const presenters = new WeakMap();
function updateResourceBar(host, value, maximum, text, options) {
    let bar = presenters.get(host);
    if (!bar) {
        bar = new ResourceBar(host);
        presenters.set(host, bar);
    }
    return bar.update(value, maximum, text, options);
}

return exports;
});
