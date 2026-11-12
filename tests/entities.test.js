'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const entities = require('../src/shared/generated/entities');
const baseline = require('./fixtures/domain-baseline.json');
const { createRegionDescriptor } = require('../src/world/universe');
const { encounterCategory } = require('../src/progression/xp-economy');
const { bossPhase, bossPressure } = require('../src/combat/enemy-scaling');

test('spawn category and reward category keep intentionally different summon/anomaly precedence', () => {
  for (const [monster, template, spawn, reward] of [
    [{},{},'normal','normal'],[{alpha:1},{},'alpha','alpha'],[{alpha:1},{stone:true,worldBoss:true,boss:true},'stone','stone'],
    [{alpha:1},{worldBoss:true,boss:true},'worldBoss','worldBoss'],[{},{boss:true},'boss','boss'],
    [{summoned:true,alpha:1},{stone:true},'stone','summoned'],[{anomaly:true},{boss:true},'boss','anomaly'],
  ]) {
    assert.equal(entities.spawnCategory(template,monster.alpha),spawn);
    assert.equal(entities.rewardCategory(monster,template),reward);
    assert.equal(encounterCategory(monster,template),reward);
  }
});
test('World Boss specialization preserves unknown template fields and scales founding radius once', () => {
  const template = {r:20,boss:true,hp:500,name:'Base',custom:{plugin:true}};
  const identity = entities.worldBossIdentity(42,'deathlord','Itharzul the Unseen','charge');
  assert.deepEqual(identity,{type:'wb42',archetype:'deathlord',name:'Itharzul the Unseen',signature:'charge'});
  const boss = entities.worldBossTemplate(template,{...identity,element:'void'});
  assert.equal(boss.r,30); assert.equal(template.r,20); assert.equal(boss.hp,500);
  assert.strictEqual(boss.custom,template.custom);
  assert.equal(boss.worldBoss,true); assert.equal(boss.name,identity.name);
  entities.markWorldBossTemplate(template); entities.markWorldBossTemplate(template);
  assert.equal(template.r,30);
  assert.equal(entities.canAdvanceWorldTier(42,{playable:true,worldBoss:identity},{ty:'wb42',tier:41}),true);
  for (const monster of [{ty:'wb42',tier:42},{ty:'wb41',tier:41}]) assert.equal(entities.canAdvanceWorldTier(42,{playable:true,worldBoss:identity},monster),false);
});
test('typed World Boss factories preserve pre-refactor v1/v2 generated names, IDs, geography and serialized contracts', () => {
  for (const row of baseline.worlds) {
    const descriptor = createRegionDescriptor({seed:baseline.seed,generatorVersion:row.generatorVersion,levelRangeVersion:1,regions:{},generationSettings:{budgets:{},spacing:{},danger:{}}},row.tier,baseline.history);
    assert.deepEqual(JSON.parse(JSON.stringify(descriptor)),row.descriptor,'version '+row.generatorVersion+' tier '+row.tier);
  }
});
test('shared boss specialization retains existing phase thresholds and World Boss enrage behavior', () => {
  const boss = {boss:true,worldBoss:true,hp:100,mh:100,fightStart:1};
  assert.equal(bossPhase(boss),0); boss.hp=60; assert.equal(bossPhase(boss),1); boss.hp=30; assert.equal(bossPhase(boss),2);
  assert.equal(bossPressure(boss,120002).enraged,true);
  assert.equal(bossPressure({...boss,worldBoss:false},120002).enraged,false);
});
