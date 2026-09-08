import { execFileSync } from 'node:child_process';
const BASE='https://bridgechatgpt-production.up.railway.app';
const railway='E:\\AI\\Bridge\\runtime\\railway-cli\\node_modules\\@railway\\cli\\bin\\railway.exe';
const agy='C:\\Users\\OliverkhangPC\\AppData\\Local\\agy\\bin\\agy.exe';
const codex='C:\\Users\\OliverkhangPC\\AppData\\Roaming\\npm\\codex.cmd';
const WORKSPACE='E:\\AI\\Bridge';
function token(){return JSON.parse(execFileSync(railway,['variables','--project','664cfde0-1227-4403-8757-f957f7b5d1de','--service','12d9ceee-f56b-4c18-a8b0-243df2a55fd9','--environment','3149b2cc-806d-48c8-a40e-bfcee3eea6ee','--json'],{encoding:'utf8'})).BRIDGE_MCP_TOKEN}
const auth=token();
async function req(path,method='GET',body){const r=await fetch(BASE+path,{method,headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error(path+' '+r.status);return r.json()}
function binding(s=''){const m=s.match(/<!-- BRIDGE_TASK_BINDING_V1\s*([\s\S]*?)BRIDGE_TASK_BINDING_V1 -->/);try{return m?JSON.parse(m[1]):null}catch{return null}}
function prompt(t){return String(t.description||'').replace(/<!-- BRIDGE_TASK_BINDING_V1[\s\S]*?BRIDGE_TASK_BINDING_V1 -->/,'').trim()}
function run(model,text){
 if(model==='gemini'||model==='sonnet'||model==='opus'){const m=model==='gemini'?'gemini-3.8-flash-high':model==='sonnet'?'claude-sonnet-4-6':'claude-opus-4-6-thinking';return execFileSync(agy,['-p',text,'--model',m],{encoding:'utf8',timeout:180000,cwd:WORKSPACE}).trim()}
 if(model==='codex'||model==='astra'){const m=model==='codex'?'gpt-5.6-sol':'gpt-6-astra';return execFileSync(codex,['exec','-C',WORKSPACE,'-s','workspace-write','-m',m,text],{encoding:'utf8',timeout:180000,cwd:WORKSPACE}).trim()}
 throw new Error('unsupported '+model)
}
async function tick(){const tasks=await req('/api/tasks?limit=300');for(const t of tasks){if(!['pending','assigned'].includes(t.status))continue;const b=binding(t.description),model=b?.model||b?.mode;if(!b||!['gemini','sonnet','opus','codex','astra'].includes(model))continue;try{await req('/api/tasks/'+t.id,'PATCH',{status:'working',agent:t.assignee});const answer=run(model,prompt(t));await req('/api/tasks/'+t.id,'PATCH',{status:'completed',result:answer,agent:t.assignee})}catch(e){console.error(t.id,e.message)}}}
await tick();setInterval(()=>tick().catch(e=>console.error(e.message)),4000);
