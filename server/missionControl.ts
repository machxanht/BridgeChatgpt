import {
  Activity, AgentDisplayInfo, CurrentJobInfo, MissionControlData, RecentActivityItem,
  RepositoryInfo, Task, WorkflowStageItem,
} from '../src/types.js';
import { getActivities, getAgentStatuses, getFindings, getProject, getTasks, logActivity, setAgentStatus, updateTask } from './db.js';
import { toolProjectGitLog, toolProjectGitStatus } from './projectTools.js';

let isSystemPaused = false;
let pausedAt: string | null = null;
interface AgentMetrics { requests_count:number; input_tokens:number; output_tokens:number; tests_executed:number }
const runtimeAgentMetrics: Record<string, AgentMetrics> = {};
export function incrementAgentMetrics(agent:string, delta:Partial<AgentMetrics>) {
  const n=agent.toLowerCase(); runtimeAgentMetrics[n] ??= {requests_count:0,input_tokens:0,output_tokens:0,tests_executed:0};
  runtimeAgentMetrics[n].requests_count += delta.requests_count||0; runtimeAgentMetrics[n].input_tokens += delta.input_tokens||0;
  runtimeAgentMetrics[n].output_tokens += delta.output_tokens||0; runtimeAgentMetrics[n].tests_executed += delta.tests_executed||0;
}
export function buildWorkflowStages(task:Task|null):{stages:WorkflowStageItem[];currentIndex:number}{
 const base=[['received','Tiếp nhận','Đã tạo và phân công nhiệm vụ'],['inspecting','Khảo sát','Kiểm tra mã nguồn và xác định phạm vi'],['editing','Chỉnh sửa','Đang sửa mã nguồn'],['testing','Kiểm thử','Chạy kiểm thử'],['review','Đánh giá','ChatGPT/Human thẩm định kết quả'],['done','Hoàn thành','Đã nghiệm thu']];
 let currentIndex=0;if(task){if(task.status==='working')currentIndex=task.result?.toLowerCase().includes('test')?3:task.related_files?.length?2:1;else if(task.status==='review')currentIndex=4;else if(task.status==='completed')currentIndex=5;}
 return {currentIndex,stages:base.map(([id,label,description],i)=>({id,label,description,status:(task?.status==='completed'||i<currentIndex?'completed':i===currentIndex?'current':'upcoming') as any}))};
}
function fmt(a:Activity){const ag=a.agent.toUpperCase(),x=(a.action||'').toLowerCase();if(x.includes('claimed task'))return `${ag} đã tiếp nhận ${a.entity_id||'công việc'}`;if(x.includes('test'))return `${ag} đang chạy kiểm thử`;if(x.includes('review'))return `${ag} đang xử lý bước đánh giá ${a.entity_id||''}`.trim();return `${ag}: ${a.action}${a.details?` — ${a.details}`:''}`;}
function accountFor(id:string):{label:string;source:NonNullable<AgentDisplayInfo['account_source']>}{
 if(id==='chatgpt') return {label:process.env.CHATGPT_ACCOUNT_LABEL||'Tài khoản ChatGPT hiện tại',source:process.env.CHATGPT_ACCOUNT_LABEL?'runtime_config':'session'};
 if(id==='gemini') return {label:process.env.GEMINI_ACCOUNT_LABEL||'Tài khoản Google AI Studio hiện tại',source:process.env.GEMINI_ACCOUNT_LABEL?'runtime_config':'session'};
 return {label:process.env.HUMAN_ACCOUNT_LABEL||'Người điều hành',source:process.env.HUMAN_ACCOUNT_LABEL?'runtime_config':'session'};
}
export async function buildMissionControlData():Promise<MissionControlData>{
 const project=await getProject(), raw=await getAgentStatuses(), tasks=await getTasks({limit:50}), findings=await getFindings({limit:50}), activities=await getActivities(20);
 const gs=await toolProjectGitStatus(), lg=await toolProjectGitLog({limit:1}), lc=lg.commits?.[0];
 const repository:RepositoryInfo={name:project.project_name||'BridgeChatgpt',url:project.repository_url||'',branch:gs.branch||project.default_branch||'main',status_clean:gs.clean,modified_count:gs.modified.length+gs.staged.length,untracked_count:gs.untracked.length,modified_files:[...gs.modified,...gs.staged],last_commit_hash:lc?.hash||'',last_commit_message:lc?.subject||'',last_commit_date:lc?.date||''};
 const wt=tasks.find(t=>t.status==='working')||tasks.find(t=>t.status==='review')||tasks.find(t=>t.status==='assigned')||tasks.find(t=>t.status==='pending')||null;let currentJob:CurrentJobInfo|null=null;
 if(wt){const w=buildWorkflowStages(wt);currentJob={id:wt.id,title:wt.title,description:wt.description,priority:wt.priority,status:wt.status,assignee:wt.assignee,created_by:wt.created_by,updated_at:wt.updated_at||wt.created_at,related_files:wt.related_files||[],stages:w.stages,current_stage_index:w.currentIndex};}
 const defs=[{id:'chatgpt',name:'ChatGPT',role:'Reviewer & Kiến trúc sư',avatar_type:'chatgpt' as const},{id:'gemini',name:'Gemini',role:'Coder & Executor',avatar_type:'gemini' as const},{id:'human',name:'Human',role:'Điều hành',avatar_type:'human' as const}];
 const now=Date.now(), geminiApiWorker=process.env.GEMINI_WORKER_ENABLED==='true'&&Boolean(process.env.GEMINI_API_KEY), geminiExternal=process.env.GEMINI_EXTERNAL_AGENT_ENABLED==='true';
 const agents:AgentDisplayInfo[]=defs.map(def=>{const s=raw[def.id as 'chatgpt'|'gemini'|'human'],p=s?.last_active_at?Date.parse(s.last_active_at):NaN,has=Number.isFinite(p),last=has?Math.max(0,Math.floor((now-p)/1000)):-1,fresh=has&&last<=30,stale=has&&last>30&&last<=90;let connection:AgentDisplayInfo['connection_status'];
  if(isSystemPaused)connection='waiting';else if(def.id==='human')connection='connected';else if(def.id==='chatgpt')connection=fresh&&s?.status==='reviewing'?'reviewing':fresh&&s?.status==='working'?'working':'waiting';else if(geminiExternal)connection=fresh?(s?.status==='working'?'working':'connected'):stale?'stale':'waiting';else if(!geminiApiWorker)connection='blocked';else connection=fresh?(s?.status==='working'?'working':'connected'):stale?'stale':'disconnected';
  const task=s?.current_task_id?tasks.find(t=>t.id===s.current_task_id):undefined,m=runtimeAgentMetrics[def.id]||{requests_count:0,input_tokens:0,output_tokens:0,tests_executed:0},acct=accountFor(def.id);
  let activity=task?`Đang xử lý ${task.id}: ${task.title}`:'Đang chờ nhiệm vụ.',step=task?.status==='review'?'Chờ đánh giá.':task?'Đang thực thi.':'Sẵn sàng.';
  if(def.id==='chatgpt'&&!fresh){activity='ChatGPT hoạt động theo yêu cầu qua MCP, không duy trì kết nối nền liên tục.';step='Sẵn sàng khi ChatGPT gọi Bridge MCP.';}
  if(def.id==='gemini'&&geminiExternal&&!fresh){activity='AI Studio relay mode đã chọn; Bridge đang chờ heartbeat từ Studio.';step='Studio cần gọi /api/studio-relay/heartbeat để xác nhận kết nối thật.';}
  else if(def.id==='gemini'&&!geminiApiWorker){activity='Chưa chọn executor Gemini khả dụng.';step='Dùng AI Studio relay, hoặc bật Gemini API worker.';}
  return {id:def.id,name:def.name,role:def.role,avatar_type:def.avatar_type,account_label:acct.label,account_source:acct.source,connection_status:connection,last_seen_seconds:last,last_seen_text:!has?'Chưa có hoạt động':last<60?`${last} giây trước`:`${Math.floor(last/60)} phút trước`,current_activity_detail:activity,current_step_text:step,current_task_id:s?.current_task_id||null,current_task_title:task?.title||null,stage_index:task?buildWorkflowStages(task).currentIndex:0,quota:{requests_count:m.requests_count,input_tokens:m.input_tokens,output_tokens:m.output_tokens,tests_executed:m.tests_executed,estimated_cost_usd:0,provider_reported_quota:false,provider_quota_text:'Provider không cung cấp quota cho Bridge; chỉ hiển thị usage Bridge đo được.'}};
 });
 const recent_activities:RecentActivityItem[]=activities.slice(0,8).map(a=>({id:a.id,time:new Date(a.created_at).toLocaleTimeString('vi-VN'),agent:a.agent,text:fmt(a),raw_action:a.action,details:a.details||undefined}));
 return {repository,agents,current_job:currentJob,recent_activities,emergency_state:{paused:isSystemPaused,paused_at:pausedAt},stats:{total_tasks:tasks.length,completed_tasks:tasks.filter(t=>t.status==='completed').length,open_findings:findings.filter(f=>f.status==='open'||f.status==='assigned').length}};
}
export async function pauseAllAgents(){isSystemPaused=true;pausedAt=new Date().toISOString();const {stopGeminiWorker}=await import('./geminiWorker.js');stopGeminiWorker();await logActivity({agent:'human',action:'Pause all agents',entity_type:'system',details:'Autonomous API worker stopped; external agents should observe paused workflow state.'});return {success:true,message:'Đã tạm dừng hệ thống.'};}
export async function resumeAllAgents(){isSystemPaused=false;pausedAt=null;const {startGeminiWorker}=await import('./geminiWorker.js');startGeminiWorker();await logActivity({agent:'human',action:'Resume all agents',entity_type:'system'});return {success:true,message:'Đã tiếp tục hệ thống.'};}
export async function stopSingleAgent(agentId:string){const n=(agentId||'').toLowerCase();if(n==='gemini'){const {stopGeminiWorker}=await import('./geminiWorker.js');stopGeminiWorker();}if(!['chatgpt','gemini','human'].includes(n))return {success:false,message:`Agent ${agentId} chưa được Bridge kết nối thật.`};await setAgentStatus({agent:n as any,status:'idle',current_task_id:null,message:'Stopped by Mission Control.'});return {success:true,message:`Đã dừng ${agentId}.`};}
export async function cancelCurrentTask(taskId?:string){const ts=await getTasks(),t=taskId?ts.find(x=>x.id===taskId):ts.find(x=>x.status==='working'||x.status==='assigned');if(!t)return {success:false,message:'Không có nhiệm vụ đang hoạt động.'};await updateTask(t.id,{status:'cancelled'},'human');return {success:true,message:`Đã hủy ${t.id}.`};}