'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const lifecycle = require.resolve('../src/server/server-lifecycle');
async function scenario(body) {
  const source = `const {EventEmitter}=require('node:events');const {startServer}=require(${JSON.stringify(lifecycle)});const server=new EventEmitter();server.listen=(port,cb)=>cb();server.close=()=>{};let saves=0;const saveAll=async()=>{saves++;return true;};saveAll.checkpoint=async()=>console.log('COMPACTED');process.on('exit',()=>console.log('SAVES='+saves));const options={server,transport:{close(){}},port:0,saveAll,tick:()=>{},tickIntervalMs:1,getStatus:()=>({}),monsterCount:()=>0,width:1,height:1,zoneCount:1,shutdownTimeoutMs:20};${body}`;
  const child = spawn(process.execPath, ['-e', source], { stdio: ['ignore', 'pipe', 'pipe'] }); let output = '';
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }); return { code, output };
}
test('a throwing tick exits for supervised recovery without saving partially mutated gameplay', async () => {
  const result = await scenario(`options.tick=()=>{throw Error('injected tick failure')};startServer(options);`);
  assert.equal(result.code, 70, result.output); assert.match(result.output, /SAVES=0/); assert.match(result.output, /injected tick failure/);
});
test('unhandled async failures use the same crash boundary', async () => {
  const result = await scenario(`startServer(options);Promise.reject(Error('injected async failure'));`);
  assert.equal(result.code, 70, result.output); assert.match(result.output, /SAVES=0/);
});
test('normal shutdown persists and compacts before reporting success', async () => {
  const result = await scenario(`startServer(options);process.emit('SIGTERM');`);
  assert.equal(result.code, 0, result.output); assert.match(result.output, /COMPACTED/); assert.match(result.output, /SAVES=1/);
});
test('failed and stalled shutdown saves exit with a non-restarting status', async () => {
  for (const save of ['async()=>false', '()=>new Promise(()=>{})']) {
    const result = await scenario(`options.saveAll=${save};startServer(options);process.emit('SIGTERM');`);
    assert.equal(result.code, 74, result.output); assert.match(result.output, /Automatic restart was skipped/);
  }
});
test('the real launcher stops after five automatic crash restarts without an infinite loop', async () => {
  const launcher = require.resolve('../local-server');
  const source = `const Module=require('node:module'),{EventEmitter}=require('node:events');const load=Module._load,timeout=setTimeout;let launches=0,stopped=false;global.setTimeout=(fn,ms)=>timeout(fn,Math.min(ms,1));Module._load=function(id,...args){if(id==='node:child_process')return {fork(){launches++;const child=new EventEmitter();process.nextTick(()=>child.emit('exit',70,null));return child;}};if(id==='./src/server/tunnel')return {startTunnel:()=>({stop(){stopped=true;}})};return load.call(this,id,...args);};process.on('exit',()=>console.log(JSON.stringify({launches,stopped})));require(${JSON.stringify(launcher)});`;
  const child = spawn(process.execPath, ['-e', source], { stdio: ['ignore', 'pipe', 'pipe'] }); let output = '';
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  assert.equal(code, 70, output); assert.match(output, /"launches":6,"stopped":true/); assert.match(output, /Crash restart limit reached/);
});
