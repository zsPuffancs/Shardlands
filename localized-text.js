'use strict';

function localizedText(key, fallback, values = {}) {
  return { key, fallback, values };
}

function isLocalizedText(message) {
  return Boolean(message && typeof message === 'object' && typeof message.key === 'string' && typeof message.fallback === 'string');
}

function englishText(message) {
  if (!isLocalizedText(message)) return String(message ?? '');
  return message.fallback.replace(/\{(\w+)\}/g, (token, name) =>
    Object.hasOwn(message.values || {}, name) ? englishText(message.values[name]) : token);
}

function withLocalizedText(payload, field) {
  const message = payload[field];
  if (!isLocalizedText(message)) return payload;
  return { ...payload, [field]: englishText(message), text: message };
}

function gearText(name) {
  const parts = /^(\S+) (.+?)(?: (of .+))?$/.exec(name);
  if (!parts) return localizedText('gear.custom.' + name, name);
  const [, material, base, suffix] = parts;
  const values = {
    material: localizedText('gear.material.' + material, material),
    base: localizedText('gear.base.' + base, base),
  };
  if (suffix) values.suffix = localizedText('gear.suffix.' + suffix, suffix);
  return suffix ? localizedText('gear.nameWithSuffix', '{material} {base} {suffix}', values) :
    localizedText('gear.name', '{material} {base}', values);
}

module.exports = { localizedText, isLocalizedText, withLocalizedText, gearText };
