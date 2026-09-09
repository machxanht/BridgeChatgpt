import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto,randomUUID} from 'node:crypto';
const source=fs.readFileSync(new URL('../browser-wake/runtime-v2.js',import.meta.url),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('../browser-wake/manifest.json',import.meta.url),'utf8'));
assert.equal(manifest.background.service_worker,'runtime-v2.js');
assert(!source.includes('/wake-queue'));assert(!source.includes('/api/tasks/'));
const event={addListener(){}};
const turn={attempt_id:`ATT-${randomUUID()}`,attempt_token:'attempt-fixture',turn_id:randomUUID(),
  conversation_id:randomUUID(),content:'Exact prompt',native_session_id:null,deadline_at:new Date(Date.now()+600000).toISOString()};
const local={enabledV2:true},session={capability:'runtime-fixture',expires:Date.now()+600000};
const store=data=>({get:async keys=>Object.fromEntries(keys.map(key=>[key,structuredClone(data[key])])),
  set:async values=>Object.assign(data,structuredClone(values)),remove:async key=>{delete data[key];},setAccessLevel:async()=>{}});
let clicks=0,finalPosts=0,receiptPosts=0,afterSend=false,committed=false;
const native=()=>({exactModel:true,model:'Sol 5.6',session:afterSend?'native-session':null,generating:false,
  messages:afterSend?[{id:'u1',role:'user',text:'Exact prompt'},{id:'a1',role:'assistant',text:'Native fixture answer',complete:true}]:[]});
const chrome={runtime:{id:'test',onInstalled:event,onStartup:event,onMessage:event},alarms:{onAlarm:event,create:async()=>{}},
  storage:{local:store(local),session:store(session)},tabs:{query:async()=>[{id:1}],create:async()=>({id:1}),get:async()=>({id:1,status:'complete'})},
  scripting:{executeScript:async options=>{
    assert(!JSON.stringify(options.args).includes('attempt-fixture'),'provider page must never receive capability');
    if(options.args[0]==='send'){
      clicks++;afterSend=true;
      throw new Error('Worker disconnected after native send');
    }
    return [{result:native()}];
  }}};
const calls=[];
const fetch=async(url,options)=>{
  const route=url.split('/api/runtime')[1];calls.push(route);
  const body=JSON.parse(options.body);
  if(route==='/claim')return {ok:true,json:async()=>({turn})};
  if(route==='/recover')return {ok:true,json:async()=>({turn,status:committed?'completed':'working'})};
  if(route==='/attempt/receipt'&&body.stage==='answer_observed'&&++receiptPosts===1)throw new Error('Lost receipt response');
  if(route==='/attempt/complete'){
    finalPosts++;committed=true;
    if(finalPosts===1)throw new Error('Lost completion response');
    return {ok:true,json:async()=>({hash:local.activeV2.final.hash})};
  }
  return {ok:true,json:async()=>({ok:true})};
};
const context=vm.createContext({chrome,fetch,crypto:webcrypto,TextEncoder,AbortSignal,URL,console,
  setTimeout:fn=>{queueMicrotask(fn);return 0;}});
vm.runInContext(source,context);
await vm.runInContext('tick()',context);
assert.equal(clicks,1);assert.equal(local.activeV2.stage,'send_started');
await vm.runInContext('tick()',context);
assert.equal(clicks,1);assert(local.activeV2.final,'final must be durable before answer receipt request');
await vm.runInContext('tick()',context);
assert(committed);assert(local.activeV2.final,'lost completion acknowledgement retains final');
await vm.runInContext('tick()',context);
assert.equal(clicks,1);assert.equal(local.activeV2,null);assert.equal(finalPosts,2);
assert(!calls.includes('/cleanup'),'successful final replay never clears an unrelated fence');
console.log('browserRuntimeV2.test.mjs: send disconnect, receipt disconnect, completion disconnect, exact one click, capability isolation PASS');
