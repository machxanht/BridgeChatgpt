import assert from 'node:assert/strict';
import { completeChat } from '../scripts/complete-chat.mjs';
const answer = 'Xin chào!\n\nĐây là câu trả lời nguyên văn: "Railway".';
for (const marker of ['CHAT', 'DEBATE']) {
  const calls = [];
  const request = async (url, body) => { calls.push({url,body}); return body || {status:'pending',description:`<!-- BRIDGE_${marker}_V1 -->`}; };
  assert.equal((await completeChat({taskId:'TASK-12',answer,request})).status, 'completed');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].body, {status:'completed',result:answer,agent:'chatgpt'});
}
for (const status of ['completed','cancelled']) {
  let calls = 0;
  const request = async () => { calls++; return {status,description:'<!-- BRIDGE_CHAT_V1 -->'}; };
  if (status === 'completed') assert.equal((await completeChat({taskId:'TASK-12',answer,request})).already_completed, true);
  else await assert.rejects(completeChat({taskId:'TASK-12',answer,request}), /cancelled/);
  assert.equal(calls,1);
}
await assert.rejects(completeChat({taskId:'TASK-12',answer,request:async()=>({description:'coding',status:'review'})}), /Only chat/);
await assert.rejects(completeChat({taskId:'../other',answer,request:async()=>assert.fail('Must not request')}), /Invalid/);
let dryCalls=0;
await completeChat({taskId:'TASK-12',checkOnly:true,request:async(_url,body)=>{dryCalls++;assert.equal(body,undefined);return{status:'pending',description:'<!-- BRIDGE_CHAT_V1 -->'};}});
assert.equal(dryCalls,1);
console.log('chatReturn.test.mjs: exact answer, task scope, cancellation, idempotence and read-only check PASS');
