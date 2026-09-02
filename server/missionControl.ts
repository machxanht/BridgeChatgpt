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

const runtimeAgentMetrics: Record<string, AgentMetrics> = {};

export function incrementAgentMetrics(agent: string, delta: Partial<AgentMetrics>) {
  const normalized = agent.toLowerCase();
  runtimeAgentMetrics[normalized] ??= {
    requests_count: 0,
    input_tokens: 0,
    output_tokens: 0,
    tests_executed: 0,
  };
  runtimeAgentMetrics[normalized].requests_count += delta.requests_count || 0;
  runtimeAgentMetrics[normalized].input_tokens += delta.input_tokens || 0;
  runtimeAgentMetrics[normalized].output_tokens += delta.output_tokens || 0;
  runtimeAgentMetrics[normalized].tests_executed += delta.tests_executed || 0;
}

export function buildWorkflowStages(
  task: Task | null,
  stageHint = '',
): { stages: WorkflowStageItem[]; currentIndex: number } {
  const base = [
    ['received', 'Tiếp nhận', 'Bridge đã nhận và phân công nhiệm vụ'],
    ['inspecting', 'Khảo sát', 'Đọc mã nguồn và xác định phạm vi'],
    ['editing', 'Chỉnh sửa', 'Đang tạo hoặc sửa mã nguồn'],
    ['testing', 'Kiểm thử', 'Đang build / test / kiểm tra runtime'],
    ['review', 'Đánh giá', 'ChatGPT hoặc Human thẩm định kết quả'],
    ['done', 'Hoàn thành', 'Đã nghiệm thu và đóng nhiệm vụ'],
  ];

  let currentIndex = 0;
  const hint = stageHint.toLowerCase();

  if (task) {
    if (task.status === 'working' || task.status === 'blocked') {
      if (hint.includes('test') || hint.includes('build') || hint.includes('health')) currentIndex = 3;
      else if (hint.includes('edit') || hint.includes('patch') || hint.includes('write') || hint.includes('sync')) currentIndex = 2;
      else if (hint.includes('inspect') || hint.includes('read') || hint.includes('check')) currentIndex = 1;
      else if (hint.includes('submit')) currentIndex = 3;
      else currentIndex = task.related_files?.length ? 2 : 1;
    } else if (task.status === 'review') {
      currentIndex = 4;
    } else if (task.status === 'completed') {
      currentIndex = 5;
    }
  }

  return {
    currentIndex,
    stages: base.map(([id, label, description], index) => ({
      id,
      label,
      description,
      status: (
        task?.status === 'completed' || index < currentIndex
          ? 'completed'
          : index === currentIndex
            ? 'current'
            : 'upcoming'
      ) as WorkflowStageItem['status'],
    })),
  };
}

function formatActivity(activity: Activity) {
  const agent = activity.agent.toUpperCase();
  const action = (activity.action || '').toLowerCase();
  if (action.includes('claimed task')) return `${agent} đã tiếp nhận ${activity.entity_id || 'công việc'}`;
  if (action.includes('test')) return `${agent} đang chạy kiểm thử`;
  if (action.includes('review')) return `${agent} đang xử lý bước đánh giá ${activity.entity_id || ''}`.trim();
  return `${agent}: ${activity.action}${activity.details ? ` — ${activity.details}` : ''}`;
}

function accountFor(id: string): { label: string; source: NonNullable<AgentDisplayInfo['account_source']> } {
  if (id === 'chatgpt') {
    return {
      label: process.env.CHATGPT_ACCOUNT_LABEL || 'Tài khoản ChatGPT hiện tại',
      source: process.env.CHATGPT_ACCOUNT_LABEL ? 'runtime_config' : 'session',
    };
  }
  if (id === 'gemini') {
    return {
      label: process.env.GEMINI_ACCOUNT_LABEL || 'Tài khoản Google AI Studio hiện tại',
      source: process.env.GEMINI_ACCOUNT_LABEL ? 'runtime_config' : 'session',
    };
  }
  return {
    label: process.env.HUMAN_ACCOUNT_LABEL || 'Người điều hành',
    source: process.env.HUMAN_ACCOUNT_LABEL ? 'runtime_config' : 'session',
  };
}

export async function buildMissionControlData(): Promise<MissionControlData> {
  const project = await getProject();
  const raw = await getAgentStatuses();
  const tasks = await getTasks({ limit: 50 });
  const findings = await getFindings({ limit: 50 });
  const activities = await getActivities(20);

  const gitStatus = await toolProjectGitStatus();
  const gitLog = await toolProjectGitLog({ limit: 1 });
  const lastCommit = gitLog.commits?.[0];

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

  const activeTask =
    tasks.find(task => task.status === 'working') ||
    tasks.find(task => task.status === 'blocked') ||
    tasks.find(task => task.status === 'review') ||
    tasks.find(task => task.status === 'assigned') ||
    tasks.find(task => task.status === 'pending') ||
    null;

  let currentJob: CurrentJobInfo | null = null;
  if (activeTask) {
    const statusRecord = activeTask.assignee === 'gemini'
      ? raw.gemini
      : activeTask.assignee === 'chatgpt'
        ? raw.chatgpt
        : raw.human;
    const workflow = buildWorkflowStages(activeTask, statusRecord?.message || '');
    currentJob = {
      id: activeTask.id,
      title: activeTask.title,
      description: activeTask.description,
      priority: activeTask.priority,
      status: activeTask.status,
      assignee: activeTask.assignee,
      created_by: activeTask.created_by,
      created_at: activeTask.created_at,
      updated_at: activeTask.updated_at || activeTask.created_at,
      related_files: activeTask.related_files || [],
      stages: workflow.stages,
      current_stage_index: workflow.currentIndex,
    };
  }

  const definitions = [
    { id: 'chatgpt', name: 'ChatGPT', role: 'Tech lead · Coder chính · Reviewer', avatar_type: 'chatgpt' as const },
    { id: 'gemini', name: 'Gemini / AI Studio', role: 'Workspace · Executor · Coder phụ', avatar_type: 'gemini' as const },
    { id: 'human', name: 'Bạn', role: 'Người điều hành', avatar_type: 'human' as const },
  ] as const;

  const now = Date.now();
  const geminiApiWorker = process.env.GEMINI_WORKER_ENABLED === 'true' && Boolean(process.env.GEMINI_API_KEY);
  const geminiExternalConfigured = process.env.GEMINI_EXTERNAL_AGENT_ENABLED === 'true';

  const agents: AgentDisplayInfo[] = definitions.map(definition => {
    const status = raw[definition.id];
    const parsed = status?.last_active_at ? Date.parse(status.last_active_at) : NaN;
    const hasActivity = Number.isFinite(parsed);
    const lastSeenSeconds = hasActivity ? Math.max(0, Math.floor((now - parsed) / 1000)) : -1;
    const fresh = hasActivity && lastSeenSeconds <= 45;
    const stale = hasActivity && lastSeenSeconds > 45 && lastSeenSeconds <= 180;
    const task = status?.current_task_id
      ? tasks.find(candidate => candidate.id === status.current_task_id)
      : undefined;

    // A real Studio relay call updates agent status/heartbeat. Treat that as evidence of
    // an external Studio executor even when the deployment forgot the optional env flag.
    const studioRelayObserved = definition.id === 'gemini' && hasActivity && (
      Boolean(status?.current_task_id) ||
      status?.status === 'working' ||
      status?.status === 'blocked' ||
      lastSeenSeconds <= 180
    );

    let connection: AgentDisplayInfo['connection_status'];
    if (isSystemPaused) {
      connection = 'waiting';
    } else if (definition.id === 'human') {
      connection = 'connected';
    } else if (definition.id === 'chatgpt') {
      if (status?.status === 'blocked') connection = 'blocked';
      else if (fresh && status?.status === 'reviewing') connection = 'reviewing';
      else if (fresh && status?.status === 'working') connection = 'working';
      else connection = 'waiting';
    } else if (status?.status === 'blocked') {
      connection = 'blocked';
    } else if (geminiExternalConfigured || studioRelayObserved) {
      if (fresh) connection = status?.status === 'working' ? 'working' : 'connected';
      else if (stale) connection = 'stale';
      else connection = 'waiting';
    } else if (geminiApiWorker) {
      if (fresh) connection = status?.status === 'working' ? 'working' : 'connected';
      else if (stale) connection = 'stale';
      else connection = 'disconnected';
    } else {
      connection = 'blocked';
    }

    const metrics = runtimeAgentMetrics[definition.id] || {
      requests_count: 0,
      input_tokens: 0,
      output_tokens: 0,
      tests_executed: 0,
    };
    const account = accountFor(definition.id);

    let activity = task ? `Đang xử lý ${task.id}: ${task.title}` : 'Đang chờ nhiệm vụ.';
    let step = status?.message || (task?.status === 'review' ? 'Chờ đánh giá.' : task ? 'Đang thực thi.' : 'Sẵn sàng.');
    let explanation = 'Agent đang sẵn sàng.';
    let recoveryAction: string | null = null;

    if (definition.id === 'chatgpt') {
      if (connection === 'working' || connection === 'reviewing') {
        explanation = task ? `ChatGPT đang xử lý ${task.id}.` : 'ChatGPT đang hoạt động trong phiên hiện tại.';
      } else if (connection === 'blocked') {
        explanation = status?.message || 'ChatGPT báo đang bị chặn.';
        recoveryAction = 'Quay lại cuộc chat ChatGPT và yêu cầu kiểm tra blocker hiện tại của Bridge.';
      } else {
        activity = 'ChatGPT hoạt động theo yêu cầu, không duy trì tiến trình nền liên tục.';
        step = 'Sẵn sàng khi bạn gửi yêu cầu trong cuộc chat ChatGPT.';
        explanation = 'Trạng thái CHỜ là bình thường đối với normal ChatGPT; nó không phải lỗi kết nối.';
      }
    }

    if (definition.id === 'gemini') {
      if (connection === 'working') {
        explanation = status?.message || (task ? `AI Studio đang thực thi ${task.id} trong workspace.` : 'AI Studio đang thực thi công việc.');
      } else if (connection === 'connected') {
        explanation = 'Bridge vừa nhận heartbeat/progress thật từ AI Studio.';
      } else if (connection === 'stale') {
        explanation = `Bridge từng thấy AI Studio nhưng đã ${Math.max(1, Math.floor(lastSeenSeconds / 60))} phút không có heartbeat mới.`;
        recoveryAction = 'Mở AI Studio và gửi: Check Bridge, continue the active task if one exists, then report progress through Studio Relay.';
      } else if (connection === 'waiting') {
        activity = 'Bridge đang chờ AI Studio nhận việc hoặc gửi heartbeat.';
        step = 'AI Studio không tự thức dậy từ Bridge; cần một prompt trong phiên Studio khi có task mới.';
        explanation = 'Không có lỗi runtime. Bridge chỉ đang chờ Studio được kích hoạt.';
        recoveryAction = 'Trong AI Studio, gửi: Check Bridge for the next available task, claim it, execute exactly what it requests, and report the result through Studio Relay.';
      } else if (connection === 'blocked') {
        if (task?.status === 'blocked' || status?.status === 'blocked') {
          activity = task ? `AI Studio bị chặn khi xử lý ${task.id}: ${task.title}` : 'AI Studio báo bị chặn.';
          explanation = status?.message || 'Studio đã báo blocker nhưng chưa có bước khôi phục cụ thể.';
          recoveryAction = task
            ? `Trong AI Studio, yêu cầu: Inspect why ${task.id} is blocked, fix only the blocker if safe, then continue the task and report progress through Studio Relay.`
            : 'Trong AI Studio, yêu cầu kiểm tra blocker hiện tại, xử lý nếu an toàn và gửi lại heartbeat/progress qua Studio Relay.';
        } else {
          activity = 'Bridge chưa thấy executor Gemini/AI Studio hoạt động trong runtime này.';
          step = 'Chưa có heartbeat Studio gần đây và Gemini API worker đang tắt.';
          explanation = 'Đây thường là trạng thái trước khi Studio gửi heartbeat đầu tiên, không có nghĩa app bị hỏng.';
          recoveryAction = 'Mở AI Studio và gửi: Check Bridge state, send a heartbeat through Studio Relay, then claim the next available task if any.';
        }
      }
    }

    if (definition.id === 'human') {
      explanation = 'Bạn đang điều hành Bridge từ giao diện này.';
      step = 'Chỉ cần can thiệp khi bảng “Bạn cần làm gì?” bên trên yêu cầu.';
    }

    return {
      id: definition.id,
      name: definition.name,
      role: definition.role,
      avatar_type: definition.avatar_type,
      account_label: account.label,
      account_source: account.source,
      connection_status: connection,
      last_seen_seconds: lastSeenSeconds,
      last_seen_text: !hasActivity
        ? 'Chưa có hoạt động'
        : lastSeenSeconds < 60
          ? `${lastSeenSeconds} giây trước`
          : `${Math.floor(lastSeenSeconds / 60)} phút trước`,
      last_active_at: hasActivity ? status.last_active_at : null,
      current_activity_detail: activity,
      current_step_text: step,
      status_explanation: explanation,
      recovery_action: recoveryAction,
      current_task_id: status?.current_task_id || null,
      current_task_title: task?.title || null,
      stage_index: task ? buildWorkflowStages(task, status?.message || '').currentIndex : 0,
      quota: {
        requests_count: metrics.requests_count,
        input_tokens: metrics.input_tokens,
        output_tokens: metrics.output_tokens,
        tests_executed: metrics.tests_executed,
        estimated_cost_usd: 0,
        provider_reported_quota: false,
        provider_quota_text: 'Bridge chỉ hiển thị usage tự đo được; quota thật của provider không được Bridge đọc.',
      },
    };
  });

  const recentActivities: RecentActivityItem[] = activities.slice(0, 8).map(activity => ({
    id: activity.id,
    time: activity.created_at,
    created_at: activity.created_at,
    agent: activity.agent,
    text: formatActivity(activity),
    raw_action: activity.action,
    details: activity.details || undefined,
  }));

  return {
    repository,
    agents,
    current_job: currentJob,
    recent_activities: recentActivities,
    server_time: new Date().toISOString(),
    emergency_state: { paused: isSystemPaused, paused_at: pausedAt },
    stats: {
      total_tasks: tasks.length,
      completed_tasks: tasks.filter(task => task.status === 'completed').length,
      open_findings: findings.filter(finding => finding.status === 'open' || finding.status === 'assigned').length,
    },
  };
}

export async function pauseAllAgents() {
  isSystemPaused = true;
  pausedAt = new Date().toISOString();
  const { stopGeminiWorker } = await import('./geminiWorker.js');
  stopGeminiWorker();
  await logActivity({
    agent: 'human',
    action: 'Pause all agents',
    entity_type: 'system',
    details: 'Autonomous API worker stopped; external agents should observe paused workflow state.',
  });
  return { success: true, message: 'Đã tạm dừng hệ thống.' };
}

export async function resumeAllAgents() {
  isSystemPaused = false;
  pausedAt = null;
  const { startGeminiWorker } = await import('./geminiWorker.js');
  startGeminiWorker();
  await logActivity({ agent: 'human', action: 'Resume all agents', entity_type: 'system' });
  return { success: true, message: 'Đã tiếp tục hệ thống.' };
}

export async function stopSingleAgent(agentId: string) {
  const normalized = (agentId || '').toLowerCase();
  if (normalized === 'gemini') {
    const { stopGeminiWorker } = await import('./geminiWorker.js');
    stopGeminiWorker();
  }
  if (!['chatgpt', 'gemini', 'human'].includes(normalized)) {
    return { success: false, message: `Agent ${agentId} chưa được Bridge kết nối thật.` };
  }
  await setAgentStatus({
    agent: normalized as any,
    status: 'idle',
    current_task_id: null,
    message: 'Stopped by Mission Control.',
  });
  return { success: true, message: `Đã dừng ${agentId}.` };
}

export async function cancelCurrentTask(taskId?: string) {
  const tasks = await getTasks();
  const task = taskId
    ? tasks.find(candidate => candidate.id === taskId)
    : tasks.find(candidate => candidate.status === 'working' || candidate.status === 'assigned');
  if (!task) return { success: false, message: 'Không có nhiệm vụ đang hoạt động.' };
  await updateTask(task.id, { status: 'cancelled' }, 'human');
  return { success: true, message: `Đã hủy ${task.id}.` };
}
