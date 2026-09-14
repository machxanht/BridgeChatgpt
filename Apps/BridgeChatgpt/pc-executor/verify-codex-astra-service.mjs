// Exactly one real Bridge turn per model. A pending receipt prevents accidental resubmission.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const control='E:/AI/Bridge/runtime/runner-control';
const config=JSON.parse(fs.readFileSync(path.join(control,'runner-config.json'),'utf8').replace(/^\uFEFF/,''));
const origin=config.origin;
const password=fs.readFileSync(path.join(control,'bridge-sign-in.txt'),'utf8').match(/Password: (.+)/)[1].trim();
async function signIn(){
  const r=await fetch(origin+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password}),signal:AbortSignal.timeout(15000)});
  assert.equal(r.status,200,'Browser password login');
  const session=await r.json();
  return {Origin:origin,'Content-Type':'application/json',Cookie:r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; '),'x-bridge-csrf':session.csrf};
}
let headers=await signIn();
async function call(route,body){
  const r=await fetch(origin+route,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  assert(r.ok,route+' HTTP '+r.status);return r.json();
}
const available=await call('/api/chat/agents');
if(process.argv.includes('--check-only')){
  console.log(JSON.stringify(available.agents.map(({id,available,native_model})=>({id,available,native_model}))));
  process.exit(0);
}
for(const agent of ['codex','astra'])assert(available.agents.find(a=>a.id===agent)?.available,agent+' is not advertised');
for(const agent of ['codex','astra']){
  const record=path.join(control,agent+'-service-e2e.json');
  assert(!fs.existsSync(record),'Existing '+agent+' receipt; inspect it instead of resubmitting');
  const started=Date.now();
  const marker='BRIDGE_'+agent.toUpperCase()+'_SERVICE_OK';
  const intent={agent,client_message_id:'service-e2e-'+randomUUID(),started:new Date(started).toISOString()};
  fs.writeFileSync(record,JSON.stringify({...intent,status:'submitting'}),{flag:'wx'});
  const created=await call('/api/chat/turns',{workspace_id:config.workspace.workspaceId,project_id:config.workspace.projectId,agent_id:agent,client_message_id:intent.client_message_id,content:'Reply with exactly '+marker+'. Do not use tools or modify files.'});
  fs.writeFileSync(record,JSON.stringify({...intent,status:'pending',turnId:created.turn.id,conversationId:created.conversation.id}));
  console.log(agent+': submitted '+created.turn.id);
  let result;
  for(let n=0;n<120;n++){
    await new Promise(r=>setTimeout(r,1000));
    const data=await call('/api/chat/conversations/'+created.conversation.id);
    const turn=data.turns.find(t=>t.id===created.turn.id);
    if(['completed','failed','cancelled'].includes(turn.status)){result={...intent,durationMs:Date.now()-started,...data,turn};break;}
  }
  assert(result,'Timed out; pending receipt retained. Do not resubmit.');
  fs.writeFileSync(record,JSON.stringify(result,null,2));
  assert.equal(result.turn.status,'completed');
  assert(result.messages.some(m=>m.role==='assistant'&&m.content.trim()===marker));
  assert(result.conversation.native_session_id,'Missing native session');
  const outbox=path.join(control,'outbox');
  const receipt=fs.readdirSync(outbox).filter(n=>/^ATT-[a-f0-9-]{36}\.json$/.test(n)).map(n=>JSON.parse(fs.readFileSync(path.join(outbox,n),'utf8'))).find(r=>r.turnId===created.turn.id);
  assert(receipt&&receipt.conversationId===created.conversation.id,'Missing matching local result receipt');
  const cleanup=JSON.parse(fs.readFileSync(path.join(control,receipt.attemptId+'.cleanup.json'),'utf8').replace(/^\uFEFF/,''));
  assert(cleanup.finished&&cleanup.launcher_exit===0&&cleanup.cleanup_confirmed,'Owned native process cleanup not proven');
  headers=await signIn();
  const reloaded=await call('/api/chat/conversations/'+created.conversation.id);
  assert(reloaded.messages.some(m=>m.role==='assistant'&&m.content.trim()===marker),'Fresh-session history lost result');
  fs.writeFileSync(record,JSON.stringify({...result,freshLoginReload:true,cleanup},null,2));
  console.log(agent+': completed, persisted, fresh-login reload passed ('+result.durationMs+' ms)');
}
