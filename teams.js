'use strict';
// Teams of up to 5 heroes, and trading between members of the same team.
// Teams live only while the members are online.
const { localizedText: messageText, gearText } = require('./localized-text');
const { room, canSpend } = require('./safety-limits');
const { mapOf } = require('./game-world');
const { itemView } = require('./equipment');
const { XP_BALANCE, partyHpScale } = require('./xp-economy');
const { BAGMAX } = require('./inventory');

const TEAM_SIZE = 5, INVITE_MS = 60000, TRADE_ITEMS = 12;
// Team members this close to a kill (on the same map) share its XP and gold, and make the monster stronger.
const SHARE_RANGE = XP_BALANCE.sharingRadius, XP_BONUS_PER_MEMBER = XP_BALANCE.partyEfficiencyPerMember, MONSTER_SCALE_PER_MEMBER = 1 + XP_BALANCE.partyHpPerMember;
const MAX_GOLD = 1e12;

function createTeams({ players, send, say, toast, fire, afterGearChange }) {
  let nextTeamId = 1, nextTradeId = 1;
  const teams = new Map();       // team id -> { id, leader: player id, members: [player ids] }
  const invites = new Map();     // invited player id -> { teamOf: inviter id, until }
  const trades = new Map();      // player id -> trade

  const byName = name => [...players.values()].find(p => p.name.toLowerCase() === String(name || '').toLowerCase());
  const teamOf = player => player && player.team ? teams.get(player.team) || null : null;
  const sameTeam = (a, b) => !!(a && b && a !== b && a.team && a.team === b.team);

  function sendTeam(team) {
    const members = team ? team.members.map(id => players.get(id)).filter(Boolean) : [];
    const view = team ? { id: team.id, leader: team.leader, share: team.share !== false, near: SHARE_RANGE, xpBonus: XP_BONUS_PER_MEMBER, scale: MONSTER_SCALE_PER_MEMBER, scalingModel: 'linear-v2', hpPerMember: XP_BALANCE.partyHpPerMember, damagePerMember: XP_BALANCE.partyDamagePerMember, members: members.map(p => ({ id: p.id, n: p.name, l: p.lvl, c: p.cls, hp: Math.round(p.hp), mh: p.maxhp, map: mapOf(p).index })) } : null;
    for (const member of members) send(member.c, { t: 'team', team: view });
  }
  function teamChat(team, message) { for (const id of team.members) { const p = players.get(id); if (p) send(p.c, { t: 'chat', n: '*', channel: 'team', m: message }); } }

  function invite(player, name) {
    const target = byName(name);
    if (!target) return say(player, messageText('team.noPlayer', 'No hero called {name} is online.', { name: String(name || '') }));
    if (target === player) return say(player, messageText('team.self', 'You cannot invite yourself.'));
    let team = teamOf(player);
    if (team && team.leader !== player.id) return say(player, messageText('team.leaderOnly', 'Only the team leader can invite.'));
    if (team && team.members.length >= TEAM_SIZE) return say(player, messageText('team.full', 'The team is full ({count} heroes).', { count: TEAM_SIZE }));
    if (target.team) return say(player, messageText('team.alreadyInTeam', '{name} is already in a team.', { name: target.name }));
    invites.set(target.id, { from: player.id, until: Date.now() + INVITE_MS });
    send(target.c, { t: 'teamInvite', from: player.name });
    say(player, messageText('team.invited', 'You invited {name} to your team.', { name: target.name }));
  }
  function accept(player) {
    const pending = invites.get(player.id); invites.delete(player.id);
    const inviter = pending && pending.until > Date.now() ? players.get(pending.from) : null;
    if (!inviter) return say(player, messageText('team.noInvite', 'You have no team invitation.'));
    if (player.team) return say(player, messageText('team.leaveFirst', 'Leave your team first.'));
    let team = teamOf(inviter);
    if (!team) { team = { id: nextTeamId++, leader: inviter.id, members: [inviter.id], share: true }; teams.set(team.id, team); inviter.team = team.id; }
    if (team.members.length >= TEAM_SIZE) return say(player, messageText('team.full', 'The team is full ({count} heroes).', { count: TEAM_SIZE }));
    team.members.push(player.id); player.team = team.id;
    teamChat(team, messageText('team.joined', '{name} joined the team.', { name: player.name }));
    sendTeam(team); fire('teamJoin', player, team);
  }
  function decline(player) {
    const pending = invites.get(player.id); invites.delete(player.id);
    const inviter = pending && players.get(pending.from);
    if (inviter) say(inviter, messageText('team.declined', '{name} declined your invitation.', { name: player.name }));
  }
  function leave(player, quiet) {
    const team = teamOf(player); if (!team) { if (!quiet) say(player, messageText('team.notInTeam', 'You are not in a team.')); return; }
    cancelTrade(player, messageText('trade.cancelledLeft', 'The trade was cancelled.'));
    team.members = team.members.filter(id => id !== player.id); player.team = 0;
    send(player.c, { t: 'team', team: null });
    if (team.members.length <= 1) {
      for (const id of team.members) { const p = players.get(id); if (p) { p.team = 0; send(p.c, { t: 'team', team: null }); say(p, messageText('team.disbanded', 'Your team was disbanded.')); } }
      teams.delete(team.id); return;
    }
    if (team.leader === player.id) team.leader = team.members[0];
    teamChat(team, messageText('team.left', '{name} left the team.', { name: player.name }));
    sendTeam(team);
  }
  function kick(player, name) {
    const team = teamOf(player), target = byName(name);
    if (!team || team.leader !== player.id) return say(player, messageText('team.leaderOnly', 'Only the team leader can invite.'));
    if (!target || target.team !== team.id || target === player) return;
    say(target, messageText('team.kicked', 'You were removed from the team.'));
    leave(target, true);
  }

  // Living members of the player's team near a point, the player first. Solo heroes get just themselves.
  function nearbyMembers(player, point) {
    const team = teamOf(player), map = mapOf(point);
    if (!team) return [player];
    const near = team.members.map(id => players.get(id)).filter(p => p && p !== player && !p.dead && mapOf(p) === map && Math.hypot(p.x - point.x, p.y - point.y) <= SHARE_RANGE);
    return [player, ...near];
  }
  const sharesLoot = player => { const team = teamOf(player); return !!team && team.share !== false; };
  // Compatibility accessor for HP only. Combat freezes the initial roster and scales once.
  const monsterScale = (player, monster) => partyHpScale(sharesLoot(player) ? nearbyMembers(player, monster).length : 1);
  function toggleShare(player) {
    const team = teamOf(player); if (!team) return messageText('team.notInTeam', 'You are not in a team.');
    if (team.leader !== player.id) return messageText('team.leaderShare', 'Only the team leader can change sharing.');
    team.share = team.share === false;
    teamChat(team, team.share ? messageText('team.shareOn', 'XP and gold sharing is ON.') : messageText('team.shareOff', 'XP and gold sharing is OFF.'));
    sendTeam(team);
  }

  // ---------- trading ----------
  const tradeSide = (trade, player) => trade.a.id === player.id ? 'a' : 'b';
  const partnerOf = (trade, player) => players.get(trade[tradeSide(trade, player) === 'a' ? 'b' : 'a'].id);
  function sendTrade(trade) {
    for (const side of ['a', 'b']) {
      const me = players.get(trade[side].id), other = trade[side === 'a' ? 'b' : 'a'], mine = trade[side];
      const otherPlayer = players.get(other.id); if (!me || !otherPlayer) continue;
      send(me.c, { t: 'trade', open: true, with: otherPlayer.name,
        mine: { uids: mine.uids, gold: mine.gold, ok: mine.ok },
        theirs: { items: other.uids.map(uid => otherPlayer.bag.find(item => item.uid === uid)).filter(Boolean).map(itemView), gold: other.gold, ok: other.ok } });
    }
  }
  function request(player, name) {
    const target = byName(name);
    if (!target || !sameTeam(player, target)) return say(player, messageText('trade.sameTeam', 'You can only trade with heroes in your team.'));
    if (trades.has(player.id) || trades.has(target.id)) return say(player, messageText('trade.busy', 'One of you is already trading.'));
    if (player.dead || target.dead) return;
    target.tradeRequest = { from: player.id, until: Date.now() + INVITE_MS };
    send(target.c, { t: 'tradeRequest', from: player.name });
    say(player, messageText('trade.requested', 'You asked {name} to trade.', { name: target.name }));
  }
  function acceptTrade(player) {
    const pending = player.tradeRequest; player.tradeRequest = null;
    const other = pending && pending.until > Date.now() ? players.get(pending.from) : null;
    if (!other || !sameTeam(player, other)) return say(player, messageText('trade.noRequest', 'Nobody asked you to trade.'));
    if (trades.has(player.id) || trades.has(other.id)) return say(player, messageText('trade.busy', 'One of you is already trading.'));
    const trade = { id: nextTradeId++, a: { id: other.id, uids: [], gold: 0, ok: false }, b: { id: player.id, uids: [], gold: 0, ok: false } };
    trades.set(other.id, trade); trades.set(player.id, trade);
    sendTrade(trade);
  }
  function cancelTrade(player, reason) {
    const trade = trades.get(player.id); if (!trade) return;
    for (const side of ['a', 'b']) { trades.delete(trade[side].id); const p = players.get(trade[side].id); if (p) { send(p.c, { t: 'trade', open: false }); if (reason) say(p, reason); } }
  }
  // Change your offer. Any change takes back both acceptances, so nobody can swap items after the other accepted.
  function offer(player, uids, gold) {
    const trade = trades.get(player.id); if (!trade) return;
    const mine = trade[tradeSide(trade, player)];
    const wanted = Array.isArray(uids) ? [...new Set(uids.map(String))].slice(0, TRADE_ITEMS) : [];
    mine.uids = wanted.filter(uid => player.bag.some(item => item.uid === uid && !item.lk));
    mine.gold = Math.max(0, Math.min(player.gold, Math.floor(Number(gold) || 0), MAX_GOLD));
    trade.a.ok = false; trade.b.ok = false;
    sendTrade(trade);
  }
  function confirm(player) {
    const trade = trades.get(player.id); if (!trade) return;
    if (!trade.a.uids.length && !trade.b.uids.length && !trade.a.gold && !trade.b.gold) return say(player, messageText('trade.empty', 'Nothing is offered yet.'));
    trade[tradeSide(trade, player)].ok = true;
    if (trade.a.ok && trade.b.ok) return execute(trade);
    sendTrade(trade);
  }
  // Both accepted: check everything again, then swap in one step.
  function execute(trade) {
    const a = players.get(trade.a.id), b = players.get(trade.b.id);
    const fail = message => { trade.a.ok = false; trade.b.ok = false; for (const p of [a, b]) if (p) say(p, message); sendTrade(trade); };
    if (!a || !b || !sameTeam(a, b)) return cancelTrade(a || b, messageText('trade.cancelled', 'The trade was cancelled.'));
    const itemsA = trade.a.uids.map(uid => a.bag.find(item => item.uid === uid)), itemsB = trade.b.uids.map(uid => b.bag.find(item => item.uid === uid));
    if (itemsA.some(item => !item) || itemsB.some(item => !item)) return fail(messageText('trade.changed', 'An offered item is no longer in the bag. Check the offers and accept again.'));
    if (!canSpend(a.gold, trade.a.gold) || !canSpend(b.gold, trade.b.gold)) return fail(messageText('trade.noGold', 'Someone no longer has the offered gold.'));
    if (a.bag.length - itemsA.length + itemsB.length > BAGMAX || b.bag.length - itemsB.length + itemsA.length > BAGMAX) return fail(messageText('trade.bagFull', 'Not enough bag space for the trade.'));
    if (trade.b.gold > room(a.gold - trade.a.gold) || trade.a.gold > room(b.gold - trade.b.gold)) return fail(messageText('server.storageFull', 'Your currency or consumable storage limit has been reached.'));
    a.bag = a.bag.filter(item => !itemsA.includes(item)).concat(itemsB);
    b.bag = b.bag.filter(item => !itemsB.includes(item)).concat(itemsA);
    a.gold = a.gold - trade.a.gold + trade.b.gold; b.gold = b.gold - trade.b.gold + trade.a.gold;
    trades.delete(a.id); trades.delete(b.id);
    const done = messageText('trade.done', 'Trade complete.');
    for (const p of [a, b]) { send(p.c, { t: 'trade', open: false, done: true }); toast(p, done, '#8fd18f'); afterGearChange(p); }
    fire('trade', a, b, { gave: itemsA, got: itemsB, goldA: trade.a.gold, goldB: trade.b.gold });
    console.log('[trade] ' + a.name + ' <-> ' + b.name + ': ' + itemsA.map(i => i.name).join(', ') + ' + ' + trade.a.gold + 'g  for  ' + itemsB.map(i => i.name).join(', ') + ' + ' + trade.b.gold + 'g');
  }

  // Death does not cancel a trade; leaving the game or the team does.
  function onLeave(player) { invites.delete(player.id); cancelTrade(player, messageText('trade.cancelledLeft', 'The trade was cancelled.')); leave(player, true); }

  const handlers = {
    team(player, message) {
      const op = String(message.op || '');
      if (op === 'invite') invite(player, message.name);
      else if (op === 'accept') accept(player);
      else if (op === 'decline') decline(player);
      else if (op === 'leave') leave(player);
      else if (op === 'kick') kick(player, message.name);
      else if (op === 'share') { const reply = toggleShare(player); if (reply) say(player, reply); }
    },
    trade(player, message) {
      const op = String(message.op || '');
      if (op === 'request') request(player, message.name);
      else if (op === 'accept') acceptTrade(player);
      else if (op === 'decline') { const from = player.tradeRequest && players.get(player.tradeRequest.from); player.tradeRequest = null; if (from) say(from, messageText('trade.declined', '{name} does not want to trade.', { name: player.name })); }
      else if (op === 'offer') offer(player, message.uids, message.gold);
      else if (op === 'confirm') confirm(player);
      else if (op === 'cancel') cancelTrade(player, messageText('trade.cancelled', 'The trade was cancelled.'));
    },
  };
  const chatCommands = {
    invite: { help: 'Invite a hero to your team', fn: (p, a) => { invite(p, a[0]); } },
    accept: { help: 'Accept a team invitation', fn: p => { accept(p); } },
    leave: { help: 'Leave your team', fn: p => { leave(p); } },
    share: { help: 'Team leader: switch XP and gold sharing on or off', fn: p => toggleShare(p) },
    trade: { help: 'Ask a team member to trade', fn: (p, a) => { request(p, a[0]); } },
    t: { help: 'Team chat', fn: (p, a, raw) => { const team = teamOf(p); if (!team) return messageText('team.notInTeam', 'You are not in a team.'); const text = raw.replace(/^\/t\s*/i, '').trim(); if (text) for (const id of team.members) { const m = players.get(id); if (m) send(m.c, { t: 'chat', n: p.name, channel: 'team', m: text }); } } },
  };
  // Keep the team panel's health and map up to date.
  let lastRefresh = 0;
  function tick(now) { if (now - lastRefresh < 1000) return; lastRefresh = now; for (const team of teams.values()) sendTeam(team); }

  const isItemReserved = (player, uid) => { const trade = trades.get(player.id); return !!trade && trade[tradeSide(trade, player)].uids.includes(uid); };
  return { isItemReserved, handlers, chatCommands, onLeave, tick, sameTeam, nearbyMembers, sharesLoot, monsterScale, XP_BONUS_PER_MEMBER };
}

module.exports = { createTeams, TEAM_SIZE };
