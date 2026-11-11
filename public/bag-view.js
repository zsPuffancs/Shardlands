(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BagView = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const SORTS = ['original', 'rarity-desc', 'rarity-asc', 'level-desc', 'level-asc', 'slot', 'name-asc', 'name-desc'];
  const defaults = () => ({ query: '', rarities: [], slots: [], minLevel: '', maxLevel: '', status: 'all', sort: 'original' });
  const fold = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  function boundary(value) {
    if (value === '' || value === undefined || value === null) return { value: null };
    if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) return { error: true };
    return { value: Number(value) };
  }
  function itemText(item, labels) {
    const affix = labels.affixes?.[item.afx?.k];
    return [item.name, labels.itemName?.(item), item.slot, item.fam, labels.slotNames?.[item.slot], labels.typeNames?.[item.fam], item.rar, labels.rarityNames?.[item.rar], item.afx?.k, affix?.name, affix?.prefix, ...Object.keys(item.stats || {}).flatMap(key => [key, labels.statNames?.[key], item.stats[key]])].filter(value => value !== undefined && value !== null).join(' ');
  }
  function select(bag, options = {}, labels = {}) {
    const state = { ...defaults(), ...options }, min = boundary(state.minLevel), max = boundary(state.maxLevel), errors = [];
    if (min.error || max.error || (min.value !== null && max.value !== null && min.value > max.value)) errors.push('invalid-level-range');
    const terms = fold(state.query).trim().split(/\s+/).filter(Boolean), sort = SORTS.includes(state.sort) ? state.sort : 'original';
    const rarities = Array.isArray(state.rarities) ? state.rarities : [], slots = Array.isArray(state.slots) ? state.slots : [];
    const active = !!(terms.length || rarities.length || slots.length || state.minLevel !== '' || state.maxLevel !== '' || state.status !== 'all');
    const rows = errors.length ? [] : bag.map((item, index) => ({ item, index })).filter(({ item }) => {
      if (rarities.length && !rarities.includes(item.rar)) return false;
      if (slots.length && !slots.includes(item.slot)) return false;
      if (min.value !== null && item.ilvl < min.value || max.value !== null && item.ilvl > max.value) return false;
      if (state.status === 'locked' && !item.lk || state.status === 'unlocked' && item.lk || state.status === 'upgraded' && !(item.plus > 0) || state.status === 'affixed' && !item.afx?.k) return false;
      const haystack = fold(itemText(item, labels)); return terms.every(term => haystack.includes(term));
    });
    const numeric = (a, b, key, direction) => direction * ((Number(a.item[key]) || 0) - (Number(b.item[key]) || 0));
    const name = item => String(labels.itemName?.(item) || item.name || '');
    rows.sort((a, b) => {
      let result = 0;
      if (sort.startsWith('rarity-')) result = numeric(a, b, 'rar', sort.endsWith('desc') ? -1 : 1);
      else if (sort.startsWith('level-')) result = numeric(a, b, 'ilvl', sort.endsWith('desc') ? -1 : 1);
      else if (sort === 'slot') { const order = labels.slots || []; const rank = item => { const index = order.indexOf(item.slot); return index < 0 ? order.length : index; }; result = rank(a.item) - rank(b.item); }
      else if (sort.startsWith('name-')) result = name(a.item).localeCompare(name(b.item), labels.locale || undefined, { sensitivity: 'base' }) * (sort.endsWith('desc') ? -1 : 1);
      return result || a.index - b.index;
    });
    return { items: rows.map(row => row.item), total: bag.length, active, errors };
  }
  function page(bag, options = {}, labels = {}, { index = 0, size = 30, capacity = 90 } = {}) {
    const result = select(bag, options, labels), pageSize = Number.isSafeInteger(size) && size > 0 ? size : 30;
    const pageCount = Math.max(1, Math.ceil((result.active ? result.items.length : capacity) / pageSize));
    const pageIndex = Math.max(0, Math.min(Number.isSafeInteger(index) ? index : 0, pageCount - 1));
    return { ...result, page: pageIndex, pageCount, pageSize, visible: result.items.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize) };
  }
  return { SORTS, defaults, select, page, fold };
});
