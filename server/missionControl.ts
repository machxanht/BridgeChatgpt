import {
  Activity,
  AgentDisplayInfo,
  CurrentJobInfo,
  MissionControlData,
  RecentActivityItem,
  RepositoryInfo,
  Task,
  WorkflowStageItem,
} from '../src/types.js';
import {
  getActivities,
  getAgentStatuses,
  getFindings,
  getProject,
  getTasks,
  logActivity,
  setAgentStatus,
  updateTask,
} from './db.js';
import { toolProjectGitLog, toolProjectGitStatus } from './projectTools.js';

let isSystemPaused = false;
let pausedAt: string | null = null;

interface AgentMetrics {
  requests_count: number;
  input_tokens: number;
  output_tokens: number;
  tests_executed: number;
}

// Never seed or invent usage. These counters only contain events observed by Bridge.
const runtimeAgentMetrics: Record<string, AgentMetrics> = {};

export function incrementAgentMetrics(agent: string, delta: Partial<AgentMetrics>) {
  const norm = agent.toLowerCase();
  runtimeAgentMetrics[norm] ??= { requests_count: 0, input_tokens: 0, output_tokens: 0, tests_executed: 0 };
  runtimeAgentMetrics[norm].requests_count += delta.requests_count || 0;
  runtimeAgentMetrics[norm].input_tokens += delta.input_tokens || 0;
  runtimeAgentMetrics[norm].output_tokens += delta.output_tokens || 0;
  runtimeAgentMetrics[norm].tests_executed += delta.tests_executed || 0;
}

export function buildWorkflowStages(task: Task | null): { stages: WorkflowStageItem[]; currentIndex: number } {
  const base = [
    ['received', 'Tiếp nhận', 'Đã tạo và phân công nhiệm vụ'],
    ['inspecting', 'Khảo sát', 'Kiểm tra mã nguồn và xác định phạm vi'],
    ['editing', 'Chỉnh sửa', 'Đang sửa mã nguồn'],
    ['testing', 'Kiểm thử', 'Chạy kiểm thử'],
    ['review', 'Đánh giá', 'ChatGPT/Human thẩm định kết quả'],
    ['done', 'Hoàn thành', 'Đã nghiệm thu'],
  ];
  let currentIndex = 0;
  if (task) {
    if (task.status === 'working') currentIndex = task.result?.toLowerCase().includes('test') ? 3 : task.related_files?.length ? 2 : 1;
    else if (task.status === 'review') currentIndex = 4;
    else if (task.status === 'completed') currentIndex = 5;
  }
  const stages = base.map(([id, label, description], idx) => ({
    id, label, description,
    status: (task?.status === 'completed' || idx < currentIndex ? 'completed' : idx === currentIndex ? 'current' : 'upcoming') as 'completed' | 'current' | 'upcoming',
  }));
  return { stages, currentIndex };
}

function formatActivityVietnamese(act: Activity): string {
  const agent = act.agent.toUpperCase();
  const action = (act.action || '').toLowerCase();
  if (action.includes('claimed task')) return `${agent} đã tiếp nhận ${act.entity_id || 'công việc'}`;
  if (action.includes('test')) return `${agent} đang chạy kiểm thử`;
  if (action.includes('review')) return `${agent} đang xử lý bước đánh giá ${act.entity_id || ''}`.trim();
  if (action.includes('pause')) return 'Đã tạm dừng hệ thống';
  if (action.includes('resume')) return 'Đã tiếp tục hệ thống';
  return `${agent}: ${act.action}${act.details ? ` — ${act.details}` : ''}`;
}

export async function buildMissionControlData(): Promise<MissionControlData> {
  const project = await getProject();
  const rawAgents = await getAgentStatuses();
  const tasks = await getTasks({ limit: 50 });
  const findings = await getFindings({ limit: 50 });
  const activities = await getActivities(20);

  const gitStatus = await toolProjectGitStatus();
  const logResult = await toolProjectGitLog({ limit: 1 });
  const lastCommit = logResult.commits?.[0];
  const repository: RepositoryInfo = {
    name: project.project_name || 'BridgeChatgpt',
    url: project.repository_url || '',
    branch: gitStatus.branch || project.default_branch || 'main',
    status_clean: gitStatus.clean,
    modified_count: gitStatus.modified.length + gitStatus.staged.length,
    untracked_count: gitStatus.untracked.length,
    modified_files: [...gitStatus.modified, ...gitStatus.staged],
    last_commit_hash: lastCommit?.hash || '',
    last_commit_message: lastCommit?.subject || '',
    last_commit_date: lastCommit?.date || '',
  };

  const workingTask = tasks.find(t => t.status === 'working') || tasks.find(t => t.status === 'review') || tasks.find(t => t.status === 'assigned') || tasks.find(t => t.status === 'pending') || null;
  let currentJob: CurrentJobInfo | null = null;
  if (workingTask) {
    const workflow = buildWorkflowStages(workingTask);
    currentJob = {
      id: workingTask.id,
      title: workingTask.title,
      description: workingTask.description,
      priority: workingTask.priority,
      status: workingTask.status,
      assignee: workingTask.assignee,
      created_by: workingTask.created_by,
      updated_at: workingTask.updated_at || workingTask.created_at,
      related_files: workingTask.related_files || [],
      stages: workflow.stages,
      current_stage_index: workflow.currentIndex,
    };
  }

  const definitions = [
    { id: 'chatgpt', name: 'ChatGPT', role: 'Reviewer & Kiến trúc sư', avatar_type: 'chatgpt' as const },
    { id: 'gemini', name: 'Gemini', role: 'Coder & Executor', avatar_type: 'gemini' as const },
    { id: 'human', name: 'Human', role: 'Điều hành', avatar_type: 'human' as const },
  ];
  const now = Date.now();
  const geminiWorkerConfigured = process.env.GEMINI_WORKER_ENABLED === 'true' && Boolean(process.env.GEMINI_API_KEY);

  const agents: AgentDisplayInfo[] = definitions.map(def => {
    const dbStatus = rawAgents[def.id as 'chatgpt' | 'gemini' | 'human'];
    const parsed = dbStatus?.last_active_at ? Date.parse(dbStatus.last_active_at) : NaN;
    const hasActivity = Number.isFinite(parsed);
    const lastSeen = hasActivity ? Math.max(0, Math.floor((now - parsed) / 1000)) : -1;
    const fresh = hasActivity && lastSeen <= 30;
    const stale = hasActivity && lastSeen > 30 && lastSeen <= 90;

    let connection: AgentDisplayInfo['connection_status'];
    if (isSystemPaused) {
      connection = 'waiting';
    } else if (def.id === 'human') {
      // This snapshot was requested by the dashboard, so the operator UI itself is active.
      connection = 'connected';
    } else if (def.id === 'chatgpt') {
      // ChatGPT Web is request-driven, not a daemon. Lack of a continuous heartbeat is NOT a disconnect.
      if (fresh && dbStatus?.status === 'reviewing') connection = 'reviewing';
      else if (fresh && dbStatus?.status === 'working') connection = 'working';
      else connection = 'waiting';
    } else {
      // Gemini is a real background worker only when the worker is configured.
      if (!geminiWorkerConfigured) connection = 'blocked';
      else if (fresh && dbStatus?.status === 'working') connection = 'working';
      else if (fresh) connection = 'connected';
      else if (stale) connection = 'stale';
      else connection = 'disconnected';
    }

    const task = dbStatus?.current_task_id ? tasks.find(t => t.id === dbStatus.current_task_id) : undefined;
    const metrics = runtimeAgentMetrics[def.id] || { requests_count: 0, input_tokens: 0, output_tokens: 0, tests_executed: 0 };
    const quota = {
      requests_count: metrics.requests_count,
      input_tokens: metrics.input_tokens,
      output_tokens: metrics.output_tokens,
      tests_executed: metrics.tests_executed,
      estimated_cost_usd: 0,
      provider_reported_quota: false,
      provider_quota_text: 'Provider không cung cấp quota cho Bridge; chỉ hiển thị usage Bridge đo được.',
    };

    let activity = task ? `Đang xử lý ${task.id}: ${task.title}` : 'Đang chờ nhiệm vụ.';
    let step = task?.status === 'review' ? 'Chờ đánh giá.' : task ? 'Đang thực thi.' : 'Sẵn sàng.';
    if (def.id === 'chatgpt' && !fresh) {
      activity = 'ChatGPT hoạt động theo yêu cầu qua MCP, không duy trì kết nối nền liên tục.';
      step = 'Sẵn sàng khi ChatGPT gọi Bridge MCP.';
    }
    if (def.id === 'gemini' && !geminiWorkerConfigured) {
      activity = 'Gemini worker chưa được cấu hình để chạy tự động.';
      step = 'Cần GEMINI_WORKER_ENABLED=true và GEMINI_API_KEY trong runtime.';
    } else if (def.id === 'gemini' && connection === 'disconnected') {
      activity = 'Gemini worker đã cấu hình nhưng không có heartbeat mới.';
      step = 'Kiểm tra tiến trình Bridge/Gemini worker.';
    }

    return {
      id: def.id,
      name: def.name,
      role: def.role,
      avatar_type: def.avatar_type,
      connection_status: connection,
      last_seen_seconds: lastSeen,
      last_seen_text: !hasActivity ? 'Chưa có hoạt động' : lastSeen < 60 ? `${lastSeen} giây trước` : `${Math.floor(lastSeen / 60)} phút trước`,
      current_activity_detail: activity,
      current_step_text: step,
      current_task_id: dbStatus?.current_task_id || null,
      current_task_title: task?.title || null,
      stage_index: task ? buildWorkflowStages(task).currentIndex : 0,
      quota,
    };
  });

  const recent_activities: RecentActivityItem[] = activities.slice(0, 8).map(act => ({
    id: act.id,
    time: new Date(act.created_at).toLocaleTimeString('vi-VN'),
    agent: act.agent,
    text: formatActivityVietnamese(act),
    raw_action: act.action,
    details: act.details || undefined,
  }));

  return {
    repository,
    agents,
    current_job: currentJob,
    recent_activities,
    emergency_state: { paused: isSystemPaused, paused_at: pausedAt },
    stats: {
      total_tasks: tasks.length,
      completed_tasks: tasks.filter(t => t.status === 'completed').length,
      open_findings: findings.filter(f => f.status === 'open' || f.status === 'assigned').length,
    },
  };
}

export async function pauseAllAgents(): Promise<{ success: boolean; message: string }> {
  isSystemPaused = true;
  pausedAt = new Date().toISOString();
  const { stopGeminiWorker } = await import('./geminiWorker.js');
  stopGeminiWorker();
  await logActivity({ agent: 'human', action: 'Pause all agents', entity_type: 'system', details: 'Autonomous Gemini worker stopped.' });
  return { success: true, message: 'Đã tạm dừng hệ thống và dừng Gemini worker.' };
}

export async function resumeAllAgents(): Promise<{ success: boolean; message: string }> {
  isSystemPaused = false;
  pausedAt = null;
  const { startGeminiWorker } = await import('./geminiWorker.js');
  startGeminiWorker();
  await logActivity({ agent: 'human', action: 'Resume all agents', entity_type: 'system', details: 'Autonomous Gemini worker restarted.' });
  return { success: true, message: 'Đã tiếp tục hệ thống.' };
}

export async function stopSingleAgent(agentId: string): Promise<{ success: boolean; message: string }> {
  const norm = (agentId || '').toLowerCase();
  if (norm === 'gemini') {
    const { stopGeminiWorker } = await import('./geminiWorker.js');
    stopGeminiWorker();
  }
  if (norm !== 'chatgpt' && norm !== 'gemini' && norm !== 'human') {
    return { success: false, message: `Agent ${agentId} chưa được Bridge kết nối thật.` };
  }
  await setAgentStatus({ agent: norm as 'chatgpt' | 'gemini' | 'human', status: 'idle', current_task_id: null, message: 'Stopped by Mission Control.' });
  await logActivity({ agent: 'human', action: `Stop agent ${norm}`, entity_type: 'system', entity_id: norm, details: 'Worker stopped where supported; work preserved.' });
  return { success: true, message: `Đã dừng ${agentId}.` };
}

export async function cancelCurrentTask(taskId?: string): Promise<{ success: boolean; message: string }> {
  const tasks = await getTasks();
  const target = taskId ? tasks.find(t => t.id === taskId) : tasks.find(t => t.status === 'working' || t.status === 'assigned');
  if (!target) return { success: false, message: 'Không có nhiệm vụ đang hoạt động.' };
  await updateTask(target.id, { status: 'cancelled' }, 'human');
  await logActivity({ agent: 'human', action: `Cancel task ${target.id}`, entity_type: 'task', entity_id: target.id, details: target.title });
  return { success: true, message: `Đã hủy ${target.id}.` };
}
