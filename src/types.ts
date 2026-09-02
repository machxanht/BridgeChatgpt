export type AgentType = 'chatgpt' | 'gemini' | 'human' | 'system';
export type TargetAgentType = 'chatgpt' | 'gemini' | 'human' | 'system' | 'all';

export type TaskStatus = 'pending' | 'assigned' | 'working' | 'blocked' | 'review' | 'completed' | 'cancelled';
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type FindingStatus = 'open' | 'assigned' | 'fixed' | 'rejected' | 'verified';
export type MessageType = 'task' | 'finding' | 'review' | 'status' | 'question' | 'result' | 'handoff' | 'task_created' | 'task_claimed' | 'implementation_started' | 'implementation_finished' | 'review_requested' | 'review_approved' | 'review_changes_requested' | 'task_blocked' | 'agent_question' | 'agent_answer';
export type AgentOperationalStatus = 'idle' | 'reviewing' | 'working' | 'blocked' | 'offline';

export interface ProjectConfig { id:string; project_name:string; project_root:string; repository_url:string; default_branch:string; current_goal:string; test_command:string; auto_review:boolean; created_at:string; updated_at:string; }
export interface Task { id:string; title:string; description:string; priority:TaskPriority; status:TaskStatus; assignee:AgentType; created_by:AgentType; created_at:string; updated_at:string; related_files:string[]; related_finding?:string|null; result?:string|null; }
export interface Finding { id:string; title:string; severity:FindingSeverity; description:string; file:string; line:string|number; status:FindingStatus; created_by:AgentType; assigned_to?:AgentType|null; resolution?:string|null; created_at:string; updated_at:string; }
export interface Message { id:string; from:AgentType; to:TargetAgentType; type:MessageType; content:string; task_id?:string|null; finding_id?:string|null; created_at:string; }
export interface AgentStatus { agent:'chatgpt'|'gemini'|'human'; status:AgentOperationalStatus; current_task_id?:string|null; last_active_at:string; last_heartbeat_at?:string; is_stale?:boolean; message?:string|null; }
export interface Activity { id:string; agent:AgentType; action:string; entity_type:'task'|'finding'|'message'|'project'|'test'|'git'|'system'; entity_id?:string|null; details?:string|null; created_at:string; }

export interface AgentQuotaUsage { requests_count:number; input_tokens:number; output_tokens:number; tests_executed:number; estimated_cost_usd?:number; provider_reported_quota:boolean; provider_quota_text:string; }
export interface AgentDisplayInfo {
  id:string; name:string; role:string; avatar_type:'chatgpt'|'gemini'|'codex'|'claude'|'human'|'system';
  connection_status:'connected'|'working'|'waiting'|'reviewing'|'blocked'|'disconnected'|'stale'|'error';
  last_seen_seconds:number; last_seen_text:string; current_activity_detail:string; current_step_text:string;
  current_task_id?:string|null; current_task_title?:string|null; current_stage_label?:string; stage_index?:number;
  /** Safe display-only identity label supplied by runtime configuration. Never contains API keys/tokens. */
  account_label?:string;
  account_source?:'runtime_config'|'session'|'not_available';
  quota:AgentQuotaUsage;
}
export interface WorkflowStageItem { id:string; label:string; status:'completed'|'current'|'upcoming'; description?:string; }
export interface CurrentJobInfo { id:string; title:string; description:string; priority:TaskPriority; status:TaskStatus; assignee:string; created_by:string; updated_at:string; related_files:string[]; stages:WorkflowStageItem[]; current_stage_index:number; }
export interface RepositoryInfo { name:string; url:string; branch:string; status_clean:boolean; modified_count:number; untracked_count:number; modified_files:string[]; last_commit_hash:string; last_commit_message:string; last_commit_date:string; }
export interface RecentActivityItem { id:string; time:string; agent:string; text:string; raw_action:string; details?:string; }
export interface MissionControlData { repository:RepositoryInfo; agents:AgentDisplayInfo[]; current_job:CurrentJobInfo|null; recent_activities:RecentActivityItem[]; emergency_state:{paused:boolean;paused_at?:string|null}; stats:{total_tasks:number;completed_tasks:number;open_findings:number}; }
export interface WorkspaceState { project:ProjectConfig; agents:Record<'chatgpt'|'gemini'|'human',AgentStatus>; tasks:Task[]; findings:Finding[]; recent_messages:Message[]; recent_activity:Activity[]; mission_control?:MissionControlData; stats:{total_tasks:number;pending_tasks:number;working_tasks:number;review_tasks:number;completed_tasks:number;open_findings:number;verified_findings:number}; }
export interface MCPToolDefinition { name:string; description:string; inputSchema:{type:'object';properties:Record<string,any>;required?:string[]}; }
export interface GitStatusResult { branch:string;clean:boolean;modified:string[];untracked:string[];staged:string[];raw:string; }
export interface TestExecutionResult { command:string;success:boolean;exitCode:number;stdout:string;stderr:string;durationMs:number;timestamp:string; }
export type TaskReviewDecision='approve'|'request_changes';
export interface TaskReviewPayload { id:string;decision:TaskReviewDecision;reviewer?:'chatgpt'|'human';summary:string;tests_verified?:boolean; }
export interface WorkflowStateResponse { project:{project_name:string;project_root:string;repository_url:string;default_branch:string;current_goal:string;test_command:string};my_agent:AgentStatus;action_required:boolean;next_action:'claim_task'|'continue_task'|'review_task'|'standby';active_task:Task|null;pending_tasks_for_me:Task[];tasks_needing_review:Task[];open_findings:Finding[];recent_messages:Message[];agents:Record<'chatgpt'|'gemini'|'human',AgentStatus>;server_time:string; }
