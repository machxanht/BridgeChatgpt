import fs from 'node:fs';
import assert from 'node:assert/strict';
const u=new URL(fs.readFileSync('runtime/runner-control/native-auth-portal-url.txt','utf8').trim());
const headers={'X-Bridge-Local':u.searchParams.get('key'),'Content-Type':'application/json'};
async function call(p,data,extra={}){const r=await fetch(u.origin+p,{method:data?'POST':'GET',headers:{...headers,...extra},body:data?JSON.stringify(data):undefined});return {status:r.status,body:await r.json()};}
assert.equal((await call('/status',null,{Origin:'https://example.com'})).status,403);
assert.equal((await call('/start',{})).status,200);
let s;
for(let i=0;i<100;i++){s=(await call('/status')).body;if(s.url)break;if(s.kind)throw Error(s.kind);await new Promise(r=>setTimeout(r,200));}
assert(s.url&&s.running);
assert.equal((await call('/code',{code:'bridge-auth-input-fixture-invalid',session:'stale-session'})).status,409);
assert.equal((await call('/code',{code:'bridge-auth-input-fixture-invalid',session:s.session})).status,200);
assert.equal((await call('/code',{code:'bridge-auth-input-fixture-invalid',session:s.session})).status,409);
for(let i=0;i<100;i++){s=(await call('/status')).body;if(!s.running)break;await new Promise(r=>setTimeout(r,200));}
assert.equal(s.kind,'invalid_code');assert.equal(s.delivered,true);assert.equal(s.result?.exit_code,1);
const log=fs.readFileSync('runtime/agent-tasks/native-auth/stderr.txt','utf8');assert(!log.includes('bridge-auth-input-fixture-invalid'));assert(log.includes('Malformed auth code'));assert(log.includes('[authorization code redacted]'));
assert(!fs.existsSync('runtime/agent-tasks/native-auth/code.txt'));
const cleanup=JSON.parse(fs.readFileSync('runtime/agent-tasks/native-auth/cleanup.json','utf8').replace(/^\uFEFF/,''));assert.equal(cleanup.cleanup_confirmed,true);
const receipt={time:new Date().toISOString(),input_channel:'ConPTY',provider_rejected_test_code:true,stale_session_rejected:true,duplicate_rejected:true,foreign_origin_rejected:true,code_redacted:true,code_file_removed:true,cleanup_confirmed:true};
fs.writeFileSync('runtime/runner-control/native-auth-input-proof.json',JSON.stringify(receipt,null,2));console.log(receipt);
