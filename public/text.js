'use strict';

const GameText = (() => {
  const catalogs = { en: {} };
  const languageNames = { en: 'English' };
  const displayedMessages = new WeakMap();
  const styles = {
    damage: { className: 'ft--damage', color: '#fff' },
    critical: { className: 'ft--damage ft--critical', color: '#ffd23f' },
    hurt: { className: 'ft--damage', color: '#ff5a4a' },
    gold: { color: '#e2b64a' }, xp: { color: '#9fd0ff' },
    heal: { color: '#6fe39a' }, mana: { color: '#6fb0ff' },
    level: { className: 'ft--level', color: '#ffe97a' },
    loot: { color: '#ffd24a' },
  };
  let language = 'en', scale = 1;
  try {
    language = localStorage.getItem('sl_language') || 'en';
    scale = Number(localStorage.getItem('sl_text_scale')) || 1;
  } catch {}

  function format(key, fallback, values = {}) {
    values = values || {};
    const dictionary = catalogs[language] || catalogs.en;
    const template = Object.hasOwn(dictionary, key) ? dictionary[key] : fallback;
    return template.replace(/\{(\w+)\}/g, (token, name) => Object.hasOwn(values, name) ? resolve(values[name]) : token);
  }

  function resolve(message) {
    if (message && typeof message === 'object' && typeof message.fallback === 'string') {
      return format(message.key, message.fallback, message.values);
    }
    return String(message ?? '');
  }

  function present(node, { message, style, color }) {
    const profile = styles[style];
    if (profile?.className) node.classList.add(...profile.className.split(' '));
    if (color || profile?.color) node.style.color = color || profile.color;
    node.textContent = resolve(message);
    if (message && typeof message === 'object') {
      displayedMessages.set(node, message);
      node.dataset.gameText = '';
    } else if (displayedMessages.delete(node)) {
      delete node.dataset.gameText;
    }
    return node;
  }

  function updateStaticText() {
    document.documentElement.lang = catalogs[language] ? language : 'en';
    for (const node of document.querySelectorAll('[data-text], [data-title-text], [data-placeholder-text], [data-label-text]')) {
      for (const [key, attribute] of [['text', null], ['titleText', 'title'], ['placeholderText', 'placeholder'], ['labelText', 'aria-label']]) {
        if (!node.dataset[key]) continue;
        const fallbackKey = key + 'Fallback';
        const original = node.dataset[fallbackKey] ?? (attribute ? node.getAttribute(attribute) : node.textContent);
        node.dataset[fallbackKey] = original || '';
        const translated = format(node.dataset[key], original || '');
        if (attribute) node.setAttribute(attribute, translated);
        else node.textContent = translated;
      }
    }
    document.querySelectorAll('[data-language]').forEach(select => { select.value = document.documentElement.lang; });
    document.querySelectorAll('[data-game-text]').forEach(node => {
      if (displayedMessages.has(node)) node.textContent = resolve(displayedMessages.get(node));
    });
  }

  function setLanguage(next) {
    if (!Object.hasOwn(catalogs, next)) return;
    language = next;
    try { localStorage.setItem('sl_language', language); } catch {}
    updateStaticText();
    document.dispatchEvent(new Event('game-language-change'));
  }

  function setScale(next) {
    scale = Math.min(1.3, Math.max(.85, Number(next) || 1));
    document.documentElement.style.setProperty('--ui-text-scale', scale);
    try { localStorage.setItem('sl_text_scale', scale); } catch {}
  }

  function init() {
    document.querySelectorAll('[data-language]').forEach(select => {
      const options = Object.entries(languageNames).map(([code, name]) => {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = name;
        return option;
      });
      select.replaceChildren(...options);
      select.onchange = () => setLanguage(select.value);
    });
    updateStaticText();
    setScale(scale);
  }

  return {
    addCatalog(code, entries, name = code) {
      catalogs[code] = { ...catalogs[code], ...entries };
      languageNames[code] = name;
    },
    format, resolve, present, init, setLanguage, setScale, getScale: () => scale,
    number: value => value.toLocaleString(catalogs[language] ? language : 'en'),
  };
})();

const text = GameText.format;
const mobName = (id, fallback) => text('monster.' + id, fallback);
// A monster's shown name: a World Boss (it carries a look code, m.wl) shows its World Boss name.
const shownMobName = (m, t) => (m && m.wl && t && t.wn ? t.wn : mobName(m.ty, t.n));
const itemName = (id, fallback) => text('item.' + id + '.name', fallback);
const itemDescription = (id, fallback) => text('item.' + id + '.description', fallback || '');
const className = (id, fallback) => text('class.' + id + '.name', fallback);
const zoneName = name => text('zone.' + name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''), name);
const qualityName = quality => text('quality.' + quality, quality.charAt(0).toUpperCase() + quality.slice(1));

function gearName(name) {
  const parts = /^(\S+) (.+?)(?: (of .+))?$/.exec(name);
  if (!parts) return text('gear.custom.' + name, name);
  const [, material, base, suffix] = parts;
  const translatedMaterial = text('gear.material.' + material, material);
  if (translatedMaterial === material) return text('gear.custom.' + name, name);
  const values = {
    material: translatedMaterial,
    base: text('gear.base.' + base, base),
    suffix: suffix ? text('gear.suffix.' + suffix, suffix) : '',
  };
  return suffix ? text('gear.nameWithSuffix', '{material} {base} {suffix}', values) :
    text('gear.name', '{material} {base}', values);
}
