import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {NativeRunner} from '../pc-executor/runnerCore.js';
import {ResultOutbox} from '../pc-executor/resultOutbox.js';
import type {ClaimedTurn} from '../server/chatRuntime.js';
fs.mkdirSync('runtime',{recursive:true});
const root=fs.mkdtempSync(path.resolve('runtime/completion-validation-runner-'));
const turn=():ClaimedTurn=>({attempt_id:`ATT-${randomUUID()}`,attempt_token:'attempt-fixture',turn_id:randomUUID(),
  conversation_id:randomUUID(),agent_id:'codex',native_model:'gpt-5.6-sol',runner:'codex',transport:'cli',
  workspace_id:'workspace',project_id:'project',content:'$(must remain data)',native_session_id:null,
  epoch:1,lease_expires_at:new Date(Date.now()+45000).toISOString(),deadline_at:new Date(Date.now()+600000).toISOString()});
const final={answer:'Canonical answer',sessionId:randomUUID(),model:'gpt-5.6-sol',usage:null};
{
  const claim=turn(),outbox=new ResultOutbox(path.join(root,'lost-response'));
  const calls:string[]=[];let journal:ClaimedTurn|null=null,launches=0,completeCalls=0;
  const runner=new NativeRunner({outbox,journal:async value=>{journal=value;},
    request:async(route)=>{
      calls.push(route);
      if(route==='/attempt/complete'){
        assert(calls.includes('stop'),'completion must follow OS cleanup');
        if(++completeCalls===1)throw new Error('connection dropped after commit');
        return {hash:outbox.read(claim.attempt_id).hash} as any;
      }
      return {ok:true} as any;
    },
    launch:async received=>{
      assert.equal(journal?.attempt_id,claim.attempt_id,'journal must precede launch');
      assert.equal(received.content,claim.content);launches++;
      return {result:Promise.resolve(final),stop:async()=>{calls.push('stop');return true;}};
    }},'runner-fixture');
  await assert.rejects(runner.execute(claim),/connection dropped/);
  assert.equal(outbox.pending().length,1);
  assert(!calls.includes('/attempt/fail'),'ambiguous completion must not become a failed native rerun');
  await runner.deliver(claim);
  assert.equal(launches,1);assert.equal(outbox.pending().length,0);assert.equal(journal,null);
}
{
  const claim=turn(),calls:string[]=[],abort=new AbortController();let journal:any;
  const runner=new NativeRunner({outbox:new ResultOutbox(path.join(root,'cancel')),
    journal:async value=>{journal=value;},request:async route=>{calls.push(route);return {ok:true} as any;},
    launch:async()=>({result:new Promise(()=>{}),stop:async()=>{calls.push('stop');return true;}})},'runner-fixture');
  const execution=runner.execute(claim,abort.signal);
  setTimeout(()=>abort.abort(),10);
  await assert.rejects(execution,/interrupted/);
  assert(calls.indexOf('stop')<calls.indexOf('/cleanup'));
  assert(!calls.includes('/attempt/complete'));assert.equal(journal,null);
}
{
  const claim=turn(),calls:string[]=[];let journal:any;
  const runner=new NativeRunner({outbox:new ResultOutbox(path.join(root,'cleanup-failure')),
    journal:async value=>{journal=value;},request:async route=>{calls.push(route);return {ok:true} as any;},
    launch:async()=>({result:Promise.resolve(final),stop:async()=>false})},'runner-fixture');
  await assert.rejects(runner.execute(claim),/cleanup/);
  assert(!calls.includes('/attempt/complete'));assert(!calls.includes('/cleanup'));
  assert.equal(journal.attempt_id,claim.attempt_id,'unproven cleanup must retain ownership journal');
}
console.log('runnerCore.test.ts: lost completion response, no native replay, cancellation and cleanup fence PASS');
