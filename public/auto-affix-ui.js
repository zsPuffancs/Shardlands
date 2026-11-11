'use strict';
// Server messages own all run counters; local math only estimates a proposed run.
const AutoAffixUI = (() => {
  let preview = null, job = null, pending = false, selected = null, error = null;
  const tr = (key, fallback) => text('autoAffix.' + key, fallback);
  const labels = {
    idle: 'Idle', running: 'Running', success: 'Target reached', attempts_exhausted: 'Attempts exhausted',
    budget_exhausted: 'Souls budget exhausted', insufficient_souls: 'Insufficient Souls', stopped: 'Manually stopped',
    invalid_item: 'Invalid item', out_of_range: 'Outside Mystic range', disconnected: 'Disconnected', cancelled: 'Cancelled', error: 'Error',
    invalid_roll: 'Invalid roll; failed attempt was not charged', already_satisfied: 'Current affix already meets the target',
    invalid_affix: 'Invalid affix', invalid_limits: 'Invalid limits', impossible_target: 'Target cannot be rolled',
    already_running: 'A run is already active', invalid_balance: 'Invalid Souls balance', item_reserved: 'Item reserved by another operation',
    dead: 'Character is dead', item_changed: 'Item changed', region_changed: 'Region changed',
  };
  const status = value => tr(value, labels[value] || labels.error);
  const running = () => pending || job?.status === 'running';
  const number = value => Number.isFinite(value) ? GameText.number(Math.round(value * 100) / 100) : '—';
  const percent = value => value > 0 && value < .000001 ? '<0.0001%' : number(value * 100) + '%';
  const affixName = key => text('affix.' + key, I.affixes[key]?.n || key);
  const affix = value => value ? affixName(value.k) + ': ' + number(value.v) + '%' : tr('none', 'None');
  const row = (label, value) => '<div class="ln"><span>' + esc(label) + '</span><b>' + esc(String(value)) + '</b></div>';
  const items = () => [...Object.values(EQ), ...BAG].filter(item => item && I.affixSlots.includes(item.slot));
  function request(uid) {
    selected = uid; preview = null; error = null;
    if (uid) send({ t: 'autoAffix', op: 'inspect', uid, key: $('aa-key').value || Object.keys(I.affixes)[0] });
    render();
  }
  function render() {
    const all = items();
    $('aa-item').innerHTML = all.map(item => '<option value="' + esc(item.uid) + '">' + esc(gearName(item.name)) + '</option>').join('');
    $('aa-item').value = selected || '';
    const item = all.find(item => item.uid === selected), ready = !!item && preview?.uid === selected;
    $('aa-card').innerHTML = item ? slotHtml(item, 'data-tip="af:' + esc(item.uid) + '"') + '<b>' + esc(gearName(item.name)) + '</b>' + row(tr('rarity', 'Rarity'), text('rarity.' + item.rar, I.rarity[item.rar])) + row(tr('itemLevel', 'Item / upgrade level'), item.ilvl + ' / +' + (item.plus || 0)) + row(tr('current', 'Actual current affix'), affix(item.afx)) + row(tr('balance', 'Souls balance'), number(SOULS)) + row(tr('cost', 'Souls per roll'), ready ? number(preview.cost) : '—') : tr('invalid_item', labels.invalid_item);
    const key = $('aa-key').value, minimum = Number($('aa-min').value), attempts = Number($('aa-attempts').value), budget = Number($('aa-budget').value);
    const limits = preview?.limits;
    const validInputs = ready && $('aa-min').value !== '' && Number.isFinite(minimum) && minimum >= 0 && minimum <= limits.maxMinimum && Math.abs(minimum * 10 - Math.round(minimum * 10)) < 1e-7 && Number.isSafeInteger(attempts) && attempts > 0 && attempts <= limits.maxAttempts && Number.isSafeInteger(budget) && budget >= 0 && budget <= limits.maxSouls;
    const prediction = validInputs && preview.ranges[key] ? AffixMath.estimate({ ...preview.ranges[key], key, minimum, attempts, budget, souls: SOULS, cost: preview.cost, current: item.afx }) : null;
    let estimateHtml = '';
    if (prediction?.valid) {
      estimateHtml = row(tr('range', 'Possible value range'), number(prediction.minValue) + '–' + number(prediction.maxValue) + '%') + row(tr('effective', 'Effective maximum attempts'), number(prediction.effectiveAttempts)) + row(tr('chance', 'Success per roll'), percent(prediction.probability)) + row(tr('within', 'Success within budget'), percent(prediction.chanceWithin)) + row(tr('expectedAttempts', 'Expected attempts to success'), number(prediction.expectedAttempts)) + row(tr('expectedSouls', 'Expected Souls to success (unlimited)'), number(prediction.expectedSoulsToSuccess)) + row(tr('limitedSouls', 'Expected Souls spent within limits'), number(prediction.expectedSouls));
    }
    $('aa-estimate').innerHTML = estimateHtml;
    $('aa-notice').textContent = error ? status(error) : !ready ? tr('loading', 'Waiting for authoritative item data…') : !validInputs ? status('invalid_limits') : prediction?.alreadySatisfied ? status('already_satisfied') : prediction?.impossible ? status('impossible_target') : prediction?.guaranteed ? tr('guaranteed', 'The next valid roll meets this target.') : tr('estimateHint', 'Independent rolls: estimates are not a guarantee of success.');
    $('aa-start').disabled = running() || !prediction?.valid || prediction.impossible || (!prediction.alreadySatisfied && !prediction.effectiveAttempts);
    $('aa-stop').disabled = !running();
    for (const id of ['aa-item', 'aa-key', 'aa-min', 'aa-attempts', 'aa-budget']) $(id).disabled = running();
    $('aa-status-title').textContent = job && job.status !== 'running' ? tr('completed', 'Auto Affix Completed') : tr('statistics', 'Live / last run statistics');
    $('aa-statistics').innerHTML = !job ? row(tr('status', 'Status'), status('idle')) : row(tr('status', 'Status'), status(job.status)) + row(tr('item', 'Selected item'), gearName(job.itemName)) + row(tr('target', 'Target affix'), affixName(job.key) + ' ≥ ' + number(job.minimum) + '%') + row(tr('current', 'Actual current affix'), affix(job.current)) + row(tr('best', 'Best roll (information only)'), job.best === null ? '—' : number(job.best) + '%') + row(tr('attempts', 'Attempts completed'), number(job.attempts)) + row(tr('spent', 'Souls spent'), number(job.spent)) + row(tr('balance', 'Souls balance'), number(job.souls)) + row(tr('remainingAttempts', 'Remaining attempt allowance'), number(job.remainingAttempts)) + row(tr('remainingBudget', 'Remaining Souls budget'), number(job.remainingBudget)) + row(tr('reason', 'Stop reason'), job.reason ? status(job.reason) : '—');
  }
  function open() {
    $('aa-key').innerHTML = Object.keys(I.affixes).map(key => '<option value="' + esc(key) + '">' + esc(affixName(key)) + '</option>').join('');
    $('aa-key').value = job?.status === 'running' ? job.key : afKey || Object.keys(I.affixes)[0];
    if (job?.status === 'running') { $('aa-min').value = job.minimum; $('aa-attempts').value = job.maxAttempts; $('aa-budget').value = job.maxSouls; }
    keys = {}; held = false;
    openWin('autoaffixw'); request(job?.status === 'running' ? job.uid : afSel || items()[0]?.uid);
    send({ t: 'autoAffix', op: 'status' });
  }
  function message(message) {
    if (message.t === 'autoAffixPreview') {
      if (message.uid !== selected) return;
      preview = message;
      if ($('aa-min').value === '') {
        const range = preview.ranges[$('aa-key').value];
        if (range) $('aa-min').value = AffixMath.estimate({ ...range, minimum: 0, attempts: 1, budget: 0, souls: SOULS, cost: preview.cost }).maxValue;
      }
    } else { pending = false; error = message.error || null; if (Object.hasOwn(message, 'job')) job = message.job; }
    if (isOpen('autoaffixw')) render();
  }
  $('auto-affix-open').onclick = open;
  $('aa-item').onchange = () => { $('aa-min').value = ''; request($('aa-item').value); };
  for (const id of ['aa-key', 'aa-min', 'aa-attempts', 'aa-budget']) $(id).oninput = () => { error = null; render(); };
  $('aa-start').onclick = () => {
    render(); if ($('aa-start').disabled) return;
    pending = true; error = null;
    send({ t: 'autoAffix', op: 'start', uid: selected, key: $('aa-key').value, minimum: Number($('aa-min').value), maxAttempts: Number($('aa-attempts').value), maxSouls: Number($('aa-budget').value) }); render();
  };
  $('aa-stop').onclick = () => send({ t: 'autoAffix', op: 'stop' });
  const previousBuild = buildAffix;
  buildAffix = function () { previousBuild(); $('auto-affix-open').disabled = !afSel && !running(); };
  const previousClose = closeWin;
  closeWin = function (id) { if (id === 'autoaffixw' && isOpen(id)) send({ t: 'autoAffix', op: 'stop' }); previousClose(id); };
  const previousCloseAll = closeAll;
  closeAll = function () { closeWin('autoaffixw'); previousCloseAll(); };
  const previousInventory = onInv;
  onInv = function (message) { previousInventory(message); if (isOpen('autoaffixw')) render(); };
  document.addEventListener('game-language-change', () => { if (isOpen('autoaffixw')) { const key = $('aa-key').value; $('aa-key').innerHTML = Object.keys(I.affixes).map(key => '<option value="' + esc(key) + '">' + esc(affixName(key)) + '</option>').join(''); $('aa-key').value = key; render(); } });
  addEventListener('keydown', event => {
    if (!isOpen('autoaffixw') || !event.target.closest?.('#autoaffixw')) return;
    keys = {}; held = false; event.stopImmediatePropagation();
    if (event.key === 'Escape') { event.preventDefault(); closeWin('autoaffixw'); }
  }, true);
  return { message };
})();
function onAutoAffixMessage(message) { AutoAffixUI.message(message); }
