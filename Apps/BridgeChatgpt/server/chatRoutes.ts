import { Router, type Request, type Response } from 'express';
import { BRIDGE_AGENT_ROUTES, type BridgeAgentId } from './agentRegistry.js';
import { createTurn, getConversation, listConversations, cancelTurn, claimNextTurn, heartbeatAttempt, completeAttempt, failAttempt, updateBrowserReceipt, getEventsSince, acknowledgeCleanup, renameConversation, archiveConversation, restoreConversation, deleteConversation } from './chatRuntime.js';
import { issueRuntimeToken, revokeRuntimeToken, runtimeAuth, runtimeBearer, verifyRuntimeToken } from './runtimeAuth.js';
import { verifyBrowserSession } from './browserSession.js';
import { verifyToken } from './auth.js';
import { recordRuntimeHeartbeat, runtimeAgentAvailable, runtimeAgentStatus, runtimeSnapshot } from './runtimeStatus.js';
import { runtimeIsDraining } from './runtimeLifecycle.js';
import { recoverOwnedAttempt } from './chatRuntime.js';
import {projectActivity} from './chatRuntime.js';
import {getProject} from './db.js';
import {upsertWorkspace,projectLocalPath,getWorkspaceRegistry,updateWorkspace,setWorkspaceLifecycle} from './workspaceRegistry.js';
import {validateProjectBinding} from './projectBinding.js';
import {randomUUID} from 'node:crypto';
import {listNativeAccounts,registerNativeAccount,updateNativeAccount,removeNativeAccount} from './nativeAccounts.js';

export const chatRouter=Router();
export const runtimeRouter=Router();
const status=(err:any)=>Number(err?.statusCode)||400;
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

chatRouter.get('/agents',(_req,res)=>{
  res.json({agents:BRIDGE_AGENT_ROUTES.map(route=>{const state=runtimeAgentStatus(route.id);return {...route,available:runtimeAgentAvailable(route.id),runtime_state:state.state,runtime_reason:'reason' in state?state.reason:undefined}}),runtimes:runtimeSnapshot()});
});
chatRouter.get('/accounts',async(_req,res)=>{ try { res.json({accounts:await listNativeAccounts(),message:'Bridge chỉ lưu nhãn tài khoản. Đăng nhập chính thức vẫn diễn ra trên PC và credential không được tải lên server.'}); } catch(err:any){ res.status(500).json({error:err.message}); } });
chatRouter.post('/accounts',async(req,res)=>{ try { res.status(201).json({account:await registerNativeAccount(req.body||{})}); } catch(err:any){ res.status(status(err)).json({error:err.message}); } });
chatRouter.patch('/accounts/:id',async(req,res)=>{ try { res.json({account:await updateNativeAccount(req.params.id,req.body||{})}); } catch(err:any){ res.status(status(err)).json({error:err.message}); } });
chatRouter.delete('/accounts/:id',async(req,res)=>{ try { res.json(await removeNativeAccount(req.params.id)); } catch(err:any){ res.status(status(err)).json({error:err.message}); } });
chatRouter.post('/projects',async(req,res)=>{
  try{
    const name=String(req.body?.project_name||'').trim();if(!name||name.length>100)throw new Error('Tên project cần từ 1 đến 100 ký tự');
    const binding=validateProjectBinding({local_path:req.body?.local_path||projectLocalPath(name),repository_url:req.body?.repository_url||'',branch:req.body?.branch||'main'});
    const workspaceId='workspace-'+randomUUID();
    const workspace=await upsertWorkspace(await getProject(),{...binding,workspace_id:workspaceId,project_id:workspaceId.replace('workspace-','project-'),project_name:name,execution_target:'pc',setup_required:true});
    res.status(201).json({workspace});
  }catch(err:any){res.status(status(err)).json({error:err.message});}
});
chatRouter.get('/project-activity',async(req,res)=>{
  try{
    const wid=String(req.query.workspace_id||''),pid=String(req.query.project_id||'');
    const registry=await getWorkspaceRegistry(await getProject());
    if(!registry.workspaces.some(w=>w.workspace_id===wid&&w.project_id===pid))throw new Error('Unknown project');
    res.json(await projectActivity(wid,pid));
  }catch(err:any){res.status(status(err)).json({error:err.message});}
});
chatRouter.get('/conversations',async(req,res)=>{
  try{res.json(await listConversations(String(req.query.workspace_id||''),String(req.query.project_id||'')));}
  catch(err:any){res.status(status(err)).json({error:err.message});}
});
chatRouter.get('/conversations/:id',async(req,res)=>{
  try{const data=await getConversation(req.params.id,req.query.before?Number(req.query.before):undefined,req.query.limit?Number(req.query.limit):100);if(!data){res.status(404).json({error:'Conversation not found'});return;}res.json(data);}
  catch(err:any){res.status(status(err)).json({error:err.message});}
});
chatRouter.patch('/conversations/:id',async(req,res)=>{ try { res.json({conversation:await renameConversation(req.params.id,String(req.body?.title||''))}); } catch(err:any){ res.status(status(err)).json({error:err.message}); } });
chatRouter.post('/conversations/:id/archive',async(req,res)=>{ try { res.json({conversation:await archiveConversation(req.params.id)}); } catch(err:any){ res.status(status(err)).json({error:err.message}); } });
chatRouter.post('/conversations/:id/restore',async(req,res)=>{ try { res.json({conversation:await restoreConversation(req.params.id)}); } catch(err:any){ res.status(status(err)).json({error:err.message}); } });
chatRouter.delete('/conversations/:id',async(req,res)=>{ try { res.json({conversation:await deleteConversation(req.params.id)}); } catch(err:any){ res.status(status(err)).json({error:err.message}); } });
chatRouter.post('/turns',async(req,res)=>{
  if(runtimeIsDraining()){res.status(503).json({error:'Bridge đang khởi động lại. Hãy gửi lại sau ít giây.'});return;}
  try{const result=await createTurn(req.body);res.status(result.duplicate?200:201).json(result);}
  catch(err:any){res.status(status(err)).json({error:err.message});}
});
chatRouter.post('/turns/:id/cancel',async(req,res)=>{
  try{res.json(await cancelTurn(req.params.id));}
  catch(err:any){res.status(status(err)).json({error:err.message});}
});
chatRouter.patch('/projects/:workspace_id',async(req,res)=>{ try { res.json({workspace:await updateWorkspace(await getProject(),req.params.workspace_id,{project_name:req.body?.project_name,branch:req.body?.branch,repository_url:req.body?.repository_url})}); } catch(err:any){ res.status(status(err)).json({error:err.message}); } });
chatRouter.post('/projects/:workspace_id/archive',async(req,res)=>{ try { const registry=await getWorkspaceRegistry(await getProject()); const workspace=registry.workspaces.find(item=>item.workspace_id===req.params.workspace_id); if(!workspace)throw Object.assign(new Error('Project not found'),{statusCode:404}); const activity=await projectActivity(workspace.workspace_id,workspace.project_id); if(activity.writer||activity.queue.length)throw Object.assign(new Error('Project has active turns; wait for cleanup before archiving'),{statusCode:409}); res.json({workspace:await setWorkspaceLifecycle(await getProject(),req.params.workspace_id,'archive')}); } catch(err:any){ res.status(status(err)).json({error:err.message}); } });
chatRouter.post('/projects/:workspace_id/restore',async(req,res)=>{ try { res.json({workspace:await setWorkspaceLifecycle(await getProject(),req.params.workspace_id,'restore')}); } catch(err:any){ res.status(status(err)).json({error:err.message}); } });
chatRouter.delete('/projects/:workspace_id',async(req,res)=>{ try { const registry=await getWorkspaceRegistry(await getProject()); const workspace=registry.workspaces.find(item=>item.workspace_id===req.params.workspace_id); if(!workspace)throw Object.assign(new Error('Project not found'),{statusCode:404}); const activity=await projectActivity(workspace.workspace_id,workspace.project_id); if(activity.writer||activity.queue.length)throw Object.assign(new Error('Project has active turns; wait for cleanup before deleting'),{statusCode:409}); res.json({workspace:await setWorkspaceLifecycle(await getProject(),req.params.workspace_id,'delete'),note:'Project metadata was soft-deleted; local code is preserved.'}); } catch(err:any){ res.status(status(err)).json({error:err.message}); } });
chatRouter.get('/events',async(req:Request,res:Response)=>{
  const conversationId=String(req.query.conversation_id||'');
  if(!conversationId){res.status(400).json({error:'conversation_id required'});return;}
  let cursor=Number(req.headers['last-event-id']||req.query.cursor||0)||0,closed=false;
  res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache, no-transform');res.setHeader('Connection','keep-alive');res.flushHeaders?.();
  res.on('close',()=>{closed=true;});
  let lastKeepalive=Date.now();
  try { while(!closed){
    if(!verifyToken(req)&&!verifyBrowserSession(req)){res.end();break;}
    const events=await getEventsSince(conversationId,cursor,200);
    for(const event of events){cursor=Number(event.seq);res.write(`id: ${cursor}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);}
    if(Date.now()-lastKeepalive>=15000){res.write(': keepalive\n\n');lastKeepalive=Date.now();}
    await sleep(events.length?50:500);
  }} catch { if(!closed)res.end(); }
});

runtimeRouter.post('/runner/session',(req,res)=>{
  if(!verifyToken(req)){res.status(401).json({error:'Controller credential required'});return;}
  const sub=String(req.body?.subject||'pc-runner').slice(0,120);
  res.json({token:issueRuntimeToken('runner',sub,8*60*60*1000,{transport:'cli'}),expires_in_ms:8*60*60*1000});
});
runtimeRouter.post('/browser/session',(req,res)=>{
  if(!verifyBrowserSession(req)){res.status(401).json({error:'Authenticated browser session required'});return;}
  const sub=String(req.body?.subject||'bridge-extension').slice(0,120);
  res.json({token:issueRuntimeToken('browser',sub,8*60*60*1000,{transport:'browser'}),expires_in_ms:8*60*60*1000});
});
runtimeRouter.post('/revoke',(req,res)=>{
  if(!verifyToken(req)){res.status(401).json({error:'Controller credential required'});return;}
  res.json({revoked:revokeRuntimeToken(String(req.body?.token||''))});
});
runtimeRouter.post('/runner/heartbeat',runtimeAuth('runner'),(req,res)=>{
  const claims=(req as any).runtimeAuth;
  const agents=(Array.isArray(req.body?.agents)?req.body.agents:[]).filter((id:string)=>BRIDGE_AGENT_ROUTES.some(a=>a.id===id&&a.transport==='cli')) as BridgeAgentId[];
  const agentStatus=typeof req.body?.agent_status==='object'&&req.body.agent_status!==null?req.body.agent_status:undefined;
  res.json(recordRuntimeHeartbeat({transport:'cli',subject:claims.sub,agents,agent_status:agentStatus,version:req.body?.version,source_sha:req.body?.source_sha,managed_projects:req.body?.managed_projects===true}));
});
runtimeRouter.post('/browser/heartbeat',runtimeAuth('browser'),(req,res)=>{
  const claims=(req as any).runtimeAuth;
  res.json(recordRuntimeHeartbeat({transport:'browser',subject:claims.sub,agents:['chatgpt'],version:req.body?.version,source_sha:req.body?.source_sha}));
});

runtimeRouter.post('/claim',async(req,res)=>{
  if(runtimeIsDraining()){res.status(503).json({error:'Runtime draining'});return;}
  const token=runtimeBearer(req),runner=verifyRuntimeToken(token,'runner'),browser=verifyRuntimeToken(token,'browser');
  const claims=runner||browser;
  if(!claims){res.status(401).json({error:'Runner or browser runtime credential required'});return;}
  const requested=(Array.isArray(req.body?.agent_ids)?req.body.agent_ids:BRIDGE_AGENT_ROUTES.map(a=>a.id)).filter((x:any)=>typeof x==='string') as BridgeAgentId[];
  const waitMs=Math.max(0,Math.min(20_000,Number(req.body?.wait_ms??20_000)));
  const deadline=Date.now()+waitMs;
  let closed=false;res.on('close',()=>{closed=true;});
  try{
    do{
      if(closed)return;
      if(runtimeIsDraining()){res.status(503).json({error:'Runtime draining'});return;}
      if(!verifyRuntimeToken(token,claims.scope)){res.status(401).json({error:'Runtime credential expired'});return;}
      const turn=await claimNextTurn(claims,requested,req.body?.request_id);
      if(turn){res.json({turn});return;}
      if(Date.now()>=deadline)break;
      await sleep(250);
    }while(true);
    res.status(204).end();
  }catch(err:any){res.status(status(err)).json({error:err.message});}
});
runtimeRouter.post('/recover',async(req,res)=>{
  const token=runtimeBearer(req),claims=verifyRuntimeToken(token,'runner')||verifyRuntimeToken(token,'browser');
  if(!claims){res.status(401).json({error:'Runtime credential required'});return;}
  try{res.json(await recoverOwnedAttempt(claims,String(req.body?.attempt_id||'')));}
  catch(err:any){res.status(status(err)).json({error:err.message});}
});
runtimeRouter.post('/cleanup',async(req,res)=>{
  const token=runtimeBearer(req),claims=verifyRuntimeToken(token,'runner')||verifyRuntimeToken(token,'browser');
  if(!claims){res.status(401).json({error:'Runtime credential required'});return;}
  if(req.body?.processes_stopped!==true){res.status(400).json({error:'Process cleanup receipt required'});return;}
  try{res.json(await acknowledgeCleanup(claims,String(req.body?.attempt_id||'')));}
  catch(err:any){res.status(status(err)).json({error:err.message});}
});
runtimeRouter.post('/attempt/heartbeat',runtimeAuth('attempt'),async(req,res)=>{
  try{res.json(await heartbeatAttempt((req as any).runtimeAuth,req.body?.native_session_id||null));}
  catch(err:any){res.status(status(err)).json({error:err.message});}
});
runtimeRouter.post('/attempt/complete',runtimeAuth('attempt'),async(req,res)=>{
  if(req.body?.execution_complete!==true){res.status(400).json({error:'Native execution completion required'});return;}
  try{res.json(await completeAttempt((req as any).runtimeAuth,String(req.body?.answer||''),req.body?.native_session_id||null));}
  catch(err:any){res.status(status(err)).json({error:err.message});}
});
runtimeRouter.post('/attempt/fail',runtimeAuth('attempt'),async(req,res)=>{
  try{res.json(await failAttempt((req as any).runtimeAuth,String(req.body?.code||'runtime_error'),req.body?.message));}
  catch(err:any){res.status(status(err)).json({error:err.message});}
});
runtimeRouter.post('/attempt/receipt',runtimeAuth('attempt'),async(req,res)=>{
  try{res.json(await updateBrowserReceipt((req as any).runtimeAuth,req.body||{}));}
  catch(err:any){res.status(status(err)).json({error:err.message});}
});
