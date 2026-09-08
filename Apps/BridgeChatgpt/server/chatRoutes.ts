import { Router, type Request, type Response } from 'express';
import { BRIDGE_AGENT_ROUTES, type BridgeAgentId } from './agentRegistry.js';
import { createTurn, getConversation, listConversations, cancelTurn, claimNextTurn, heartbeatAttempt, completeAttempt, failAttempt, updateBrowserReceipt, getEventsSince, acknowledgeCleanup } from './chatRuntime.js';
import { issueRuntimeToken, revokeRuntimeToken, runtimeAuth, runtimeBearer, verifyRuntimeToken } from './runtimeAuth.js';
import { verifyBrowserSession } from './browserSession.js';
import { verifyToken } from './auth.js';
import { recordRuntimeHeartbeat, runtimeAgentAvailable, runtimeSnapshot } from './runtimeStatus.js';
import { runtimeIsDraining } from './runtimeLifecycle.js';

export const chatRouter=Router();
export const runtimeRouter=Router();
const status=(err:any)=>Number(err?.statusCode)||400;
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

chatRouter.get('/agents',(_req,res)=>{
  res.json({agents:BRIDGE_AGENT_ROUTES.map(route=>({...route,available:runtimeAgentAvailable(route.id)})),runtimes:runtimeSnapshot()});
});
chatRouter.get('/conversations',async(req,res)=>{
  try{res.json(await listConversations(String(req.query.workspace_id||''),String(req.query.project_id||'')));}
  catch(err:any){res.status(status(err)).json({error:err.message});}
});
chatRouter.get('/conversations/:id',async(req,res)=>{
  try{const data=await getConversation(req.params.id,req.query.before?Number(req.query.before):undefined,req.query.limit?Number(req.query.limit):100);if(!data){res.status(404).json({error:'Conversation not found'});return;}res.json(data);}
  catch(err:any){res.status(status(err)).json({error:err.message});}
});
chatRouter.post('/turns',async(req,res)=>{
  if(runtimeIsDraining()){res.status(503).json({error:'Bridge đang khởi động lại. Hãy gửi lại sau ít giây.'});return;}
  try{const result=await createTurn(req.body);res.status(result.duplicate?200:201).json(result);}
  catch(err:any){res.status(status(err)).json({error:err.message});}
});
chatRouter.post('/turns/:id/cancel',async(req,res)=>{
  try{res.json(await cancelTurn(req.params.id));}
  catch(err:any){res.status(status(err)).json({error:err.message});}
});
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
  res.json(recordRuntimeHeartbeat({transport:'cli',subject:claims.sub,agents,version:req.body?.version,source_sha:req.body?.source_sha}));
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
