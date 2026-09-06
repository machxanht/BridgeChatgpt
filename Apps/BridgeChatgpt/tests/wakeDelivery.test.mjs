import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../browser-wake/service-worker.js',import.meta.url),'utf8');
async function deliver(initial, clears, busy=false) {
  let clicks=0;
  class Textarea {
    get value(){return this.text;}
    set value(v){this.text=v;}
    getAttribute(){return '';}
    getBoundingClientRect(){return {width:100,height:50};}
    focus(){}
    dispatchEvent(){}
    closest(){return {querySelectorAll:()=>[send]};}
  }
  const composer=new Textarea();composer.value=initial;
  const send={disabled:false,getAttribute:()=> 'Send',textContent:'Send',getBoundingClientRect:()=>({width:20,height:20}),click:()=>{clicks++;if(clears)composer.value='';}};
  const stop={...send,getAttribute:()=> 'Stop generating',textContent:'Stop generating'};
  const event={addListener(){}};
  const chrome={runtime:{onInstalled:event,onStartup:event,onMessage:event},alarms:{onAlarm:event},storage:{onChanged:event},scripting:{executeScript:async({func,args})=>[{result:await func(...args)}]}};
  const context=vm.createContext({chrome,setInterval:()=>0,setTimeout:f=>{f();return 0;},console,URL,HTMLTextAreaElement:Textarea,HTMLInputElement:class{},InputEvent:class{},Event:class{},KeyboardEvent:class{},window:{getComputedStyle:()=>({display:'block',visibility:'visible'})},document:{querySelectorAll:selector=>selector==='button'?(busy?[stop,send]:[send]):[composer]}});
  vm.runInContext(source,context);
  const result=await vm.runInContext('injectPrompt(1,"Bridge prompt")',context);
  return {result,clicks,value:composer.value};
}
assert.equal((await deliver('',true)).result.ok,true);
const failed=await deliver('',false);assert.equal(failed.result.reason,'send-not-confirmed');assert.equal(failed.value,'Bridge prompt');
const retry=await deliver('Bridge prompt',true);assert.equal(retry.result.ok,true);assert.equal(retry.clicks,1);
const draft=await deliver('My private draft',true);assert.equal(draft.result.reason,'draft-present');assert.equal(draft.clicks,0);assert.equal(draft.value,'My private draft');
const busy=await deliver('',true,true);assert.equal(busy.result.reason,'busy');assert.equal(busy.clicks,0);
console.log('wakeDelivery.test.mjs: actual injector send confirmation, own-draft retry, user-draft and busy protection PASS');
