'use strict';
// Snapshot coordinates and NPC positions are both local to the current map.
// This only controls buttons; the server revalidates every contract operation.
function canManageContracts(player, world) {
  if (!player || player.dead || !world?.npcs || !Number.isFinite(world.npcRange)) return false;
  return ['camp', 'merchant', 'smith', 'mystic'].some(key => {
    const npc = world.npcs[key];
    return npc && Math.hypot(player.x - npc.x, player.y - npc.y) <= world.npcRange;
  });
}
function affixUsageHtml(item, key = item?.afx?.k, value = item?.afx?.v) {
  if (!I || !item) return '';
  const usage = AffixUsage.evaluate(EQ, item, key, value, I.affixCaps);
  if (!usage) return '';
  return '<div class="affix-usage">' + esc(text('affix.usage', 'Equipped total: {before}% → {after}% (gear cap: {cap}%). This value contributes {useful}%.', { before: usage.before.toFixed(1), after: usage.after.toFixed(1), cap: usage.cap, useful: usage.contribution.toFixed(1) })) + (usage.wasted > 0 ? '<br><strong>' + esc(text('affix.overCap', '{wasted}% exceeds the gear cap and adds no power.', { wasted: usage.wasted.toFixed(1) })) + '</strong>' : '') + '</div>';
}
const AdventureUI = (() => {
  let view = null, tab = 'contracts', lastBossRender = 0, bossSignature = '', lastContractAccess = null;
  const titles = { clear: 'Clear the wilderness', stone: 'Break Spirit Stones', boss: 'Defeat a boss' };
  const title = kind => text('adventure.' + kind, titles[kind] || kind);
  function action(op, label, kind, disabled = false) { return '<button type="button" class="pri" data-contract="' + op + '"' + (kind ? ' data-kind="' + kind + '"' : '') + (disabled ? ' disabled' : '') + '>' + esc(label) + '</button>'; }
  function render() {
    const expanded = new Set([...$('journal-content').querySelectorAll('details[open]')].map(node => node.dataset.entry));
    $('journal-search-label').hidden = tab !== 'bestiary';
    $('journal-contracts').classList.toggle('on', tab === 'contracts'); $('journal-bestiary').classList.toggle('on', tab === 'bestiary');
    if (!view) { $('journal-content').textContent = text('adventure.loading', 'Waiting for the server…'); return; }
    let html = '';
    if (tab === 'bestiary') {
      const query = $('journal-search').value.trim().toLocaleLowerCase();
      const entries = Object.entries(view.entries).filter(([key, entry]) => mobName(key, entry.name).toLocaleLowerCase().includes(query));
      html = entries.map(([key, entry]) => {
        const drops = Object.entries(entry.drops).map(([kind, count]) => {
          const [type, value] = kind.split(':');
          const label = type === 'gear' ? text('rarity.' + value, I.rarity[value]) : type === 'item' ? itemName(value, I.items[value]?.n || value) : text('adventure.' + type, type);
          return esc(label) + ': ' + GameText.number(count);
        }).join(' · ');
        return '<details class="itemcard" data-entry="' + esc(key) + '"' + (expanded.has(key) ? ' open' : '') + '><summary>' + esc(mobName(key, entry.name)) + ' · ' + esc(text('adventure.kills', '{count} kills', { count: GameText.number(entry.kills) })) + '</summary><p>' + esc(text('adventure.levels', 'Observed levels: {min}–{max}', { min: entry.minLevel ?? '—', max: entry.maxLevel ?? '—' })) + '</p><p>' + esc(Object.keys(entry.categories).map(category => text('adventure.category.' + category, { normal: 'Normal', alpha: 'Alpha', stone: 'Spirit Stone', boss: 'Boss', worldBoss: 'World Boss' }[category] || category)).join(' · ')) + '</p><p>' + esc(text('adventure.attacks', 'Signature attacks: {attacks}', { attacks: entry.attacks.length ? entry.attacks.map(attack => text('attack.' + attack, ATTACK_NAME[attack] || attack)).join(', ') : '—' })) + '</p><p>' + esc(text('adventure.drops', 'Collected drops:')) + ' ' + (drops || '—') + '</p></details>';
      }).join('') || '<p class="mu">' + esc(text('adventure.noEnemies', 'No matching enemies discovered. Fight enemies to record them; collect their loot to reveal drops.')) + '</p>';
    } else {
      const here = view.map === WORLD.map, nearby = here && canManageContracts(me, WORLD);
      html = '<p class="mu">' + esc(text('adventure.rules', 'Daily contracts reset at 00:00 UTC. One active contract; each contract can be rewarded once per region per day. Summoned enemies and foes 13+ levels below you do not count.')) + '</p><p>' + esc(text('adventure.return', 'Visit a village trader or an encampment board to manage contracts.')) + '</p>';
      if (view.active) {
        const active = view.active, offer = view.offers.find(offer => offer.kind === active.kind), done = offer && active.progress >= offer.target;
        html += '<div class="itemcard"><b>' + esc(title(active.kind)) + '</b><p>' + esc(text('adventure.progress', 'Region {region} · {current}/{target}', { region: active.map, current: active.progress, target: offer?.target || '—' })) + '</p>' + (done ? action('claim', text('adventure.claim', 'Claim reward'), null, !nearby || active.map !== view.map) : '') + action('abandon', text('adventure.abandon', 'Abandon'), null, !nearby) + '</div>';
      }
      html += view.offers.map(offer => '<div class="itemcard"><b>' + esc(title(offer.kind)) + '</b><p>' + esc(text('adventure.offer', '{count} objectives · Reward: {souls} Souls', { count: offer.target, souls: offer.souls })) + '</p>' + action('accept', offer.claimed ? text('adventure.claimed', 'Reward already claimed today') : text('adventure.accept', 'Accept contract'), offer.kind, !nearby || !view.available || !!view.active || offer.claimed || view.claimLimit) + '</div>').join('');
    }
    $('journal-content').innerHTML = html;
  }
  function message(message) {
    if (message.t === 'adventure') view = message;
    else if (view && message.t === 'adventureUpdate') { Object.assign(view.entries, message.entries); if (Object.hasOwn(message, 'active')) view.active = message.active; }
    if (isOpen('journalw')) render();
  }
  const previousOpen = openWin;
  openWin = function (id) { previousOpen(id); if (id === 'journalw') { view = null; keys = {}; held = false; render(); send({ t: 'adventure', op: 'inspect' }); } };
  const previousClose = closeWin;
  closeWin = function (id) { if (id === 'journalw' && isOpen(id)) send({ t: 'adventure', op: 'close' }); previousClose(id); };
  const previousCloseAll = closeAll;
  closeAll = function () { closeWin('journalw'); view = null; previousCloseAll(); };
  for (const name of ['contracts', 'bestiary']) $('journal-' + name).onclick = () => { tab = name; render(); };
  $('journal-refresh').onclick = () => send({ t: 'adventure', op: 'inspect' }); $('journal-search').oninput = render;
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-contract]'); if (!button || button.disabled) return;
    const submit = () => send({ t: 'adventure', op: button.dataset.contract, kind: button.dataset.kind });
    if (button.dataset.contract === 'abandon') uxConfirm(text('adventure.abandonConfirm', 'Abandon this contract and lose its progress?'), text('adventure.abandon', 'Abandon'), submit); else submit();
  });
  addEventListener('keydown', event => {
    if (!isOpen('journalw') || !event.target.closest?.('#journalw')) return;
    keys = {}; held = false; event.stopImmediatePropagation();
    if (event.key === 'Escape') { event.preventDefault(); closeWin('journalw'); }
  }, true);
  const journalButton = document.createElement('button'); journalButton.textContent = '📖'; journalButton.dataset.open = 'journalw'; journalButton.dataset.titleText = 'adventure.title'; journalButton.title = text('adventure.title', "Adventurer's Journal"); $('mapbtns').appendChild(journalButton);
  const previousCamp = buildCamp;
  buildCamp = function () { previousCamp(); $('campb').insertAdjacentHTML('beforeend', '<button type="button" data-open="journalw">' + esc(text('adventure.contracts', 'Village contracts')) + '</button>'); };
  const previousTeam = buildTeam;
  buildTeam = function () { previousTeam(); if (TEAM) $('teamb').insertAdjacentHTML('beforeend', '<div class="itemcard"><span>' + esc(text('team.gearLoot', 'Equipment drops:')) + '</span> <button type="button" data-teamop="loot"' + (TEAM.leader !== I.id ? ' disabled' : '') + '>' + esc(TEAM.lootMode === 'roundRobin' ? text('team.roundRobin', 'Round robin') : text('team.killerLoot', 'Last-hit player')) + '</button><p class="mu">' + esc(text('team.gearLootHint', 'The leader selects equipment ownership. Round robin uses nearby living members with bag space. Gold sharing and other drops are unchanged.')) + '</p></div>'); };
  const previousTip = tipItem;
  tipItem = function (item, ...args) { return previousTip(item, ...args) + affixUsageHtml(item); };
  const previousAffix = buildAffix;
  buildAffix = function () { previousAffix(); const item = afSel && findItem(afSel), cap = I?.affixCaps?.[afKey]; if (item && Number.isFinite(cap)) $('afcard').insertAdjacentHTML('beforeend', '<p class="affix-usage">' + esc(text('affix.targetCap', 'Selected affix gear cap: {cap}%. Values above the combined cap add no power.', { cap })) + '</p>'); };
  const previousHud = hud;
  hud = function () {
    previousHud(); const tick = performance.now(); if (tick - lastBossRender < 100) return; lastBossRender = tick;
    if (isOpen('journalw')) {
      const access = WORLD.map + '|' + canManageContracts(me, WORLD);
      if (access !== lastContractAccess) { lastContractAccess = access; render(); }
    } else lastContractAccess = null;
    const monster = me && mo.find(monster => monster.id === me.tg), type = monster && I.types[monster.ty], box = $('bossdetail');
    if (!type?.boss || tick - serverReceivedAt > 3000) { box.hidden = true; return; }
    box.hidden = false; const now = serverTm + Math.max(0, tick - serverReceivedAt);
    let html = '<b>' + esc(text('boss.phase', 'Phase {phase}/3', { phase: (monster.phase || 0) + 1 })) + '</b>';
    if (monster.enrageAt) html += '<span class="boss-enrage">' + esc(monster.enrageAt <= now ? text('boss.enraged', 'ENRAGED') : text('boss.enrageIn', 'Enrage in {seconds}s', { seconds: Math.ceil((monster.enrageAt - now) / 1000) })) + '</span>';
    if (monster.castEnd > now) {
      const percent = Math.max(0, Math.min(100, 100 * (now - monster.castStart) / Math.max(1, monster.castEnd - monster.castStart)));
      html += '<div>' + esc(text('boss.casting', '{attack} · {seconds}s', { attack: text('attack.' + monster.castType, ATTACK_NAME[monster.castType] || monster.castType), seconds: ((monster.castEnd - now) / 1000).toFixed(1) })) + '</div><div class="bar boss-cast"><i style="width:' + percent.toFixed(1) + '%"></i></div>';
    } else if (monster.recoverEnd > now) html += '<div class="boss-vulnerable">' + esc(text('boss.vulnerable', 'Vulnerable: +{bonus}% damage · {seconds}s', { bonus: Math.round(((WORLD.scaling?.punishBonus || 1) - 1) * 100), seconds: ((monster.recoverEnd - now) / 1000).toFixed(1) })) + '</div>';
    if (html !== bossSignature) { box.innerHTML = html; bossSignature = html; }
  };
  document.addEventListener('game-language-change', () => { if (isOpen('journalw')) render(); if (isOpen('teamw')) buildTeam(); if (isOpen('worldw')) buildWorldInfo(); });
  return { message };
})();
function onAdventureMessage(message) { AdventureUI.message(message); }
