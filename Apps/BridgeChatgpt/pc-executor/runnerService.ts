import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {ClaimedTurn} from '../server/chatRuntime.js';
import type {BridgeAgentId} from '../server/agentRegistry.js';
import {NativeRunner} from './runnerCore.js';
import {ResultOutbox} from './resultOutbox.js';
import {launchWindowsNative,recoverWindowsNative,type WindowsLaunchPolicy} from './windowsNative.js';
import {startProviderProxy} from './providerProxy.js';

export interface RunnerServiceOptions {
  origin:string;subject:string;sourceSha:string;policy:WindowsLaunchPolicy;
  providerHosts:readonly string[];
  controllerCredential():Promise<string>;
  /** Native sign-in/model capability proof, not a user-configurable verified flag. */
  readyAgents():Promise<BridgeAgentId[]>;
  report(status:{state:string;message?:string}):void;
}
interface Journal {turn:ClaimedTurn|null;claimRequest:string|null;releaseRoot?:string}
function durable(file:string,value:unknown){
  const temp=`${file}.${randomUUID()}.tmp`,fd=fs.openSync(temp,'wx');
  try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(temp,file);
}
export async function runNativeService(options:RunnerServiceOptions,signal:AbortSignal){
  const origin=new URL(options.origin);
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/')throw new Error('Exact HTTPS Bridge origin required');
  const lock=net.createServer(socket=>socket.destroy());
  await new Promise<void>((resolve,reject)=>{lock.once('error',reject);lock.listen({host:'127.0.0.1',port:43893,exclusive:true},resolve);});
  let proxy:Awaited<ReturnType<typeof startProviderProxy>>|undefined;
  const journalFile=path.join(options.policy.controlRoot,'runner-journal.json');
  let journal:Journal=fs.existsSync(journalFile)?JSON.parse(fs.readFileSync(journalFile,'utf8')):{turn:null,claimRequest:null};
  const outbox=new ResultOutbox(path.join(options.policy.controlRoot,'outbox'));
  const save=()=>durable(journalFile,journal);
  let runtimeToken='',renewAt=0;
  const request=async<T>(route:string,token:string,body:unknown):Promise<T>=>{
    const response=await fetch(`${origin.origin}/api/runtime${route}`,{method:'POST',redirect:'error',
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
    if(!response.ok)throw Object.assign(new Error(`Bridge ${route}: HTTP ${response.status}`),{status:response.status});
    if(response.status===204)return null as T;
    return response.json() as Promise<T>;
  };
  try{
    proxy=await startProviderProxy(options.providerHosts);
    while(!signal.aborted){
      try{
        if(Date.now()>=renewAt){
          const grant=await request<{token:string;expires_in_ms:number}>('/runner/session',await options.controllerCredential(),{subject:options.subject});
          runtimeToken=grant.token;renewAt=Date.now()+grant.expires_in_ms-11*60000;
        }
        const runner=new NativeRunner({outbox,request,launch:turn=>launchWindowsNative(turn,options.policy),
          journal:async turn=>{journal={turn,claimRequest:null,...(turn?{releaseRoot:options.policy.releaseRoot}:{})};save();}},runtimeToken);
        if(journal.turn){
          const recovered=await request<{turn:ClaimedTurn;status:string;result_hash:string|null}>('/recover',runtimeToken,{attempt_id:journal.turn.attempt_id});
          journal.turn=recovered.turn;save();
          let record=outbox.pending().find(item=>item.attemptId===recovered.turn.attempt_id);
          if(!record){
            // Ordinary coordinator crashes close stdin; the owned Windows
            // launcher records process-tree cleanup independently of Node.
            if(!journal.releaseRoot)throw new Error('Original native release is missing from recovery journal');
            const relative=path.relative(path.dirname(options.policy.releaseRoot),journal.releaseRoot);
            if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Recovery release escaped the installed release root');
            const native=recoverWindowsNative(recovered.turn,{...options.policy,releaseRoot:journal.releaseRoot});
            if(native.final)record=outbox.store({attemptId:recovered.turn.attempt_id,turnId:recovered.turn.turn_id,
              conversationId:recovered.turn.conversation_id,final:native.final});
          }
          if(record&&['working','completed'].includes(recovered.status))await runner.deliver(recovered.turn);
          else{
            await request('/attempt/fail',recovered.turn.attempt_token,{code:'coordinator_restarted',message:'Native execution was not replayed after coordinator restart'});
            await request('/cleanup',runtimeToken,{attempt_id:recovered.turn.attempt_id,processes_stopped:true});
            journal={turn:null,claimRequest:null};save();
          }
          continue;
        }
        const agents=await options.readyAgents();
        await request('/runner/heartbeat',runtimeToken,{agents,version:'2.0.0',source_sha:options.sourceSha});
        if(!agents.length){options.report({state:'sign_in_required',message:'No native model is authenticated and qualified'});await delay(15000,undefined,{signal});continue;}
        journal.claimRequest ||= randomUUID();save();
        options.report({state:'waiting'});
        const claimed=await runner.claim(agents,journal.claimRequest);
        if(!claimed)continue;
        journal={turn:claimed.turn,claimRequest:null,releaseRoot:options.policy.releaseRoot};save();
        options.report({state:'working'});
        await runner.execute(claimed.turn,signal);
      }catch(error:any){
        if(signal.aborted)break;
        if(error?.status===401)renewAt=0;
        options.report({state:journal.turn?'recovery_required':'unavailable',message:error instanceof Error?error.message:'Native runner error'});
        await delay(3000,undefined,{signal}).catch(()=>{});
      }
    }
  }finally{
    // execute() stops and proves native cleanup before this proxy is released.
    // An unresolved journal/fence is retained for explicit recovery.
    if(proxy)await proxy.close();
    await new Promise<void>(resolve=>lock.close(()=>resolve()));
  }
}
