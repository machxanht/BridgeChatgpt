import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildNativeLaunch, NativeTranscript } from '../pc-executor/nativeAdapters.js';
import { ResultOutbox } from '../pc-executor/resultOutbox.js';
const cwd=process.cwd(),sessionId=randomUUID();
fs.mkdirSync(path.join(cwd,'runtime'),{recursive:true});
const malicious='hello & echo injected | powershell\n$(do-not-run)';
const spec=buildNativeLaunch({agentId:'gemini',cwd,content:malicious,outputFile:path.join(cwd,'final.txt'),executable:path.join(cwd,'agy.exe')});
assert(!spec.args.includes(malicious));assert(!spec.args.includes('-p'));
assert.equal(JSON.parse(spec.stdin).message.content,malicious);
assert.throws(()=>buildNativeLaunch({agentId:'chatgpt',cwd,content:'hi',outputFile:path.join(cwd,'final.txt'),executable:path.join(cwd,'codex.cmd')}),/browser/);
const codex=buildNativeLaunch({agentId:'astra',cwd,content:malicious,sessionId,outputFile:path.join(cwd,'final.txt'),executable:path.join(cwd,'codex.cmd')});
assert(codex.args.includes('gpt-6-astra'));assert(codex.args.includes(sessionId));assert.equal(codex.args.at(-1),'-');assert(!codex.args.includes('--last'));
assert(codex.args.includes('sandbox_mode="workspace-write"'));
assert(codex.args.indexOf('sandbox_mode="workspace-write"')<codex.args.indexOf('exec'),'resume receives global permission config');
assert(codex.args.includes('approval_policy="never"'),'headless tools cannot request an unsandboxed retry');
for(const agentId of ['codex','astra'] as const)for(const resume of [undefined,sessionId]){
  const launch=buildNativeLaunch({agentId,cwd,content:'hello',sessionId:resume,outputFile:path.join(cwd,'final.txt'),executable:path.join(cwd,'codex.exe')});
  assert(launch.args.includes('--skip-git-repo-check'),'approved workspaces need not expose parent Git metadata');
  assert(launch.args.includes('sandbox_mode="workspace-write"'),'Git discovery override must retain the sandbox');
  assert(!launch.args.includes('--dangerously-bypass-approvals-and-sandbox'));
}
if(process.platform==='win32')assert(codex.args.includes('windows.sandbox="unelevated"'));
const failedTools=[
  {type:'thread.started',thread_id:sessionId},
  {type:'item.completed',item:{type:'file_change',status:'failed'}},
  {type:'item.completed',item:{type:'command_execution',status:'failed',exit_code:1}},
];
const codexTranscript=(events:any[])=>{const p=new NativeTranscript('codex',cwd);p.push(events.map(event=>JSON.stringify(event)).join('\n')+'\n');return p;};
assert.throws(()=>codexTranscript([...failedTools,{type:'turn.completed'}]).finish(0,'I could not create the file.'),/Every native/,'exit zero plus an inability answer must not hide total tool failure');
assert.equal(codexTranscript([...failedTools,{type:'item.completed',item:{type:'command_execution',status:'completed',exit_code:0}},{type:'turn.completed'}]).finish(0,'Recovered using cmd.exe.').answer,'Recovered using cmd.exe.','a successful native retry remains usable');
const lines=[{event:'init',conversation_id:sessionId,init:{model:'gemini-3.8-flash-high',cwd,permission_mode:'request-review'}},{event:'result',result:{status:'SUCCESS',conversation_id:sessionId,response:'real fixture final'}}];
const parse=(events:any[])=>{const p=new NativeTranscript('gemini',cwd);p.push(events.map(x=>JSON.stringify(x)).join('\n')+'\n');return p;};
const final=parse(lines).finish(0);assert.equal(final.answer,'real fixture final');
assert.throws(()=>parse(lines).finish(1),/exited/);
assert.throws(()=>parse([lines[0]]).finish(0),/terminal/);
assert.throws(()=>parse([lines[0],{event:'result',result:{...lines[1].result,status:'ERROR'}}]).finish(0),/successful/);
assert.throws(()=>parse([lines[0],lines[1],lines[1]]),/more than one result/);
assert.throws(()=>parse([{...lines[0],init:{...lines[0].init,model:'fallback'}}]),/selected model/);
const c=new NativeTranscript('astra',cwd,sessionId);c.push(JSON.stringify({type:'thread.started',thread_id:sessionId})+'\n'+JSON.stringify({type:'turn.completed'})+'\n');assert.throws(()=>c.finish(0,''),/empty/);
const outboxRoot=fs.mkdtempSync(path.join(cwd,'runtime/completion-validation-outbox-'));
const outbox=new ResultOutbox(outboxRoot),attemptId=`ATT-${randomUUID()}`;
const receipt=outbox.store({attemptId,turnId:'turn-fixture',conversationId:'conversation-fixture',final});
assert.equal(new ResultOutbox(outboxRoot).pending()[0].hash,receipt.hash,'restart retains exact result');
assert.equal(outbox.store({attemptId,turnId:receipt.turnId,conversationId:receipt.conversationId,final}).hash,receipt.hash);
assert.throws(()=>outbox.store({attemptId,turnId:receipt.turnId,conversationId:receipt.conversationId,final:{...final,answer:'different'}}),/conflict/);
assert.throws(()=>outbox.acknowledge(attemptId,'wrong'),/hash mismatch/);
fs.writeFileSync(path.join(outboxRoot,`${attemptId}.json.ack`),'');
assert.equal(outbox.pending().length,1,'partial acknowledgement cannot hide an undelivered result');
outbox.acknowledge(attemptId,receipt.hash);assert.equal(outbox.pending().length,0);
console.log('Native adapter contracts and durable result outbox PASS; no provider generation or OS isolation implied');
