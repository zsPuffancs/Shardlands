'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { resolveBalance, resolveLiveUpdate, settingMode } = require('../src/balance');
const { createInventory } = require('../src/economy/inventory');
const { createProgression, newSk, stats } = require('../src/player/characters');
const { createCombat } = require('../src/combat/combat');
const { createLoot } = require('../src/economy/loot');
const { createPlayerSessions } = require('../src/player/player-session');
const { NPCS, worldInfo, maps } = require('../src/world/game-world');
const { spawn } = require('../src/balance/simulation/combat');
const { simulate } = require('../src/balance/simulation');
const ForgeMath = require('../public/forge-math');
const noop = () => {};
function hero() { const p = {id:1,name:'Hero',c:{},cls:'blade',lvl:100,xp:0,sp:0,gold:1e9,souls:0,eq:{},bag:[],inv:{},sk:newSk(),buf:{},x:NPCS.smith.x,y:NPCS.smith.y};p.c.p=p;stats(p);p.hp=p.maxhp;p.mp=p.maxmp;return p; }
function fixed(action) {const previous=Math.random;Math.random=()=>.5;try{return action();}finally{Math.random=previous;}}
const notifications = {send:noop,say:noop,toast:noop,broadcast:noop,ev:noop,fire:noop};

test('validated forge overrides control manual/automatic server payment and preserve downgrade rules', () => fixed(() => {
  const {forging}=resolveBalance({overrides:{forging:{costBase:200,successRates:[1,1,1,1,1,.05,1,1,1]}}}).values;
  const inventory=createInventory({...notifications,forgePolicy:forging}),p=hero();
  const item={uid:'forge',slot:'weapon',ilvl:100,rar:0,plus:0,name:'Sword',stats:{dmg:1}};p.eq.weapon=item;
  let before=p.gold,cost=ForgeMath.upCostFor(item,forging);
  inventory.upgradeItem(p,item.uid);assert.equal(item.plus,1);assert.equal(before-p.gold,cost);
  item.plus=5;before=p.gold;cost=ForgeMath.upCostFor(item,forging);
  inventory.upgradeItem(p,item.uid);assert.equal(item.plus,4);assert.equal(before-p.gold,cost);
  item.plus=8;before=p.gold;cost=ForgeMath.upCostFor(item,forging);
  inventory.upgradeItem(p,item.uid,true);inventory.processJobs();assert.equal(item.plus,9);assert.equal(before-p.gold,cost);
}));

test('actual session initialization sends configured forge prices/chances through the additive typed boundary', () => {
  const forging=resolveBalance({ruleset:'Custom',overrides:{forging:{costBase:250}}}).values.forging;
  const packets=[],inventory=createInventory({...notifications,forgePolicy:forging});
  let id=0;
  const sessions=createPlayerSessions({...notifications,forgePolicy:forging,config:{admins:[],serverName:'Test'},players:new Map(),mobs:new Map(),saves:{hero:{name:'Hero',cls:'blade',lvl:1,xp:0,eq:{},bag:[],inv:{},gold:100}},allocateId:()=>++id,refreshMobTypes:()=>({types:[]}),inventory,send:(connection,message)=>packets.push(message)});
  sessions.handleMessage({}, {t:'join',name:'Hero'});
  const init=packets.find(packet=>packet.t==='init');
  assert.deepEqual(init.forgePolicy,forging);assert.deepEqual(init.upRate,forging.successRates);
  const item={ilvl:100,plus:4,slot:'weapon'};
  assert.equal(ForgeMath.upCostFor(item,init.forgePolicy),ForgeMath.upCostFor(item,forging));
  const browser=vm.createContext({});vm.runInContext(fs.readFileSync(require.resolve('../public/forge-math'),'utf8'),browser);
  const wire=JSON.parse(JSON.stringify(init));
  assert.equal(browser.ForgeMath.upCostFor(item,wire.forgePolicy),ForgeMath.upCostFor(item,forging));
  init.forgePolicy.costBase=1;init.forgePolicy.successRates[0]=.1;
  assert.equal(forging.costBase,250);assert.equal(forging.successRates[0],1);
});

test('progression policy is consumed by real Wisdom awards without mutating another server instance', () => {
  const custom=createProgression({...notifications,sendInv:noop,progressionPolicy:resolveBalance({overrides:{progression:{wisdomMultiplier:2}}}).values.progression});
  const ordinary=createProgression({...notifications,sendInv:noop});
  const a=hero(),b=hero();a.buf.xp=b.buf.xp=Date.now()+60000;
  assert.equal(custom.gainXp(a,100),200);assert.equal(ordinary.gainXp(b,100),150);
});

test('real frontier loot pays configured gold and gear while keeping the existing single-pool payout', () => fixed(() => {
  const balance=resolveBalance({overrides:{gold:{normalCostFraction:.13,variation:0},loot:{gearBaseChance:1,gearTierIncrement:0}}}).values;
  const p=hero(),loot=new Map(),fixture=spawn({category:'normal',level:100,worldTier:8,rates:balance.rates});let id=0;
  const service=createLoot({...notifications,loot,players:new Map([[p.id,p]]),allocateId:()=>++id,rates:balance.rates,goldPolicy:balance.gold,lootPolicy:balance.loot,addGear:noop,genGear:()=>({name:'Gear',rar:0}),rollRarity:()=>0});
  service.dropLoot(p,fixture.monster);
  assert.equal([...loot.values()].find(drop=>drop.kind==='gold').v,Math.round(.13*100*(1+100/12)));
  assert.equal([...loot.values()].filter(drop=>drop.kind==='gear').length,1);
}));

test('real combat recovery hits and production spawner use instance policies with unchanged identities', () => fixed(() => {
  const values=resolveBalance({overrides:{combat:{recoveryDamageMultiplier:2},monsters:{hpPerDepth:.1,damagePerDepth:.16}}}).values;
  const p=hero();p.x=p.y=6000;
  const boss={id:1,ty:'alphawolf',tier:0,lvl:100,boss:true,hp:1e6,mh:1e6,ps:1,r:30,x:6020,y:6000,recoverUntil:Date.now()+60000};
  const combat=createCombat({...notifications,players:new Map([[1,p]]),mobs:new Map([[1,boss]]),rates:values.rates,combatPolicy:values.combat,spawnMob:noop,gainXp:noop,dropLoot:noop});
  combat.hitMob(p,boss,100);assert.equal(1e6-boss.hp,200);
  const normal=spawn({category:'normal',level:100,worldTier:100,rates:values.rates});
  const changed=spawn({category:'normal',level:100,worldTier:100,rates:values.rates,monsterPolicy:values.monsters});
  assert.equal(changed.monster.ty,normal.monster.ty);assert.equal(changed.monster.lvl,normal.monster.lvl);
  assert.ok(changed.monster.mh>normal.monster.mh);assert.ok(changed.monster.dmg>normal.monster.dmg);
  const view=worldInfo({...maps[0],regionTier:100},{monsterPolicy:values.monsters,combatPolicy:values.combat});
  assert.ok(view.scaling.worldHp>worldInfo({...maps[0],regionTier:100}).scaling.worldHp);
  assert.equal(view.scaling.punishBonus,2);
}));

test('new policies reject invalid/unsafe configurations and live changes; simulator consumes the same overrides', () => {
  for(const overrides of [{forging:{successRates:[1]}},{forging:{successRates:Array(9).fill(0)}},{forging:{costBase:Infinity}},{forging:{costBase:1,nonWeaponMultiplier:.01}},{gold:{variation:2}},{monsters:{worldExponent:2}},{equipment:{softCapStart:100}}])assert.throws(()=>resolveBalance({overrides}));
  for(const overrides of [{forging:{costBase:200}},{forging:{successRates:Array(9).fill(.5)}},{gold:{normalCostFraction:.1}}])assert.throws(()=>resolveLiveUpdate(resolveBalance(),overrides),/restart|snapshot/);
  assert.equal(settingMode('forging.costBase'),'restart-required');
  const reference=simulate({levels:[100],tiers:[8]});
  const changed=simulate({levels:[100],tiers:[8],overrides:{forging:{costBase:200},progression:{wisdomMultiplier:2},gold:{normalCostFraction:.13},loot:{gearBaseChance:1,gearTierIncrement:0},monsters:{hpPerDepth:.1}}});
  assert.ok(Math.abs(changed.encounters[0].meanGold-2*reference.encounters[0].meanGold)<1);
  assert.ok(changed.encounters[0].normalUpgradePrice>reference.encounters[0].normalUpgradePrice);
  assert.ok(changed.encounters[0].xpWithWisdom>reference.encounters[0].xpWithWisdom);
  assert.equal(changed.encounters[0].expectedGearDrops,.8);
  assert.ok(changed.encounters[0].monsterHp>reference.encounters[0].monsterHp);
  const punish=simulate({levels:[100],tiers:[8],overrides:{combat:{recoveryDamageMultiplier:2}}});
  assert.ok(punish.encounters.find(row=>row.category==='boss').modeledKillSeconds<reference.encounters.find(row=>row.category==='boss').modeledKillSeconds);
  const certain=simulate({levels:[100],tiers:[8],overrides:{forging:{successRates:Array(9).fill(1)}}});
  assert.equal(certain.progression[0].forgeAttemptsTo9,9);
});
