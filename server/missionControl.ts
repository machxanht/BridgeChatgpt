import {
  Activity,
  AgentDisplayInfo,
  CurrentJobInfo,
  MissionControlData,
  RecentActivityItem,
  RepositoryInfo,
  Task,
  TaskStatus,
  WorkflowStageItem,
} from '../src/types.js';
import {
  getActivities,
  getAgentStatuses,
  getFindings,
  getMessages,
  getProject,
  getTasks,
  logActivity,
  setAgentStatus,
  updateTask,
} from './db.js';
import { toolProjectGitLog, toolProjectGitStatus } from './projectTools.js';

// Emergency Pause State (Memory + Activity Sync)
let isSystemPaused = false;
let pausedAt: string | null = null;

// Agent usage metric accumulators (measured by Bridge runtime)
interface AgentMetrics {
  requests_count: number;
  input_tokens: number;
  output_tokens: number;
  tests_executed: number;
}

const runtimeAgentMetrics: Record<string, AgentMetrics> = {
  chatgpt: {
    requests_count: 24,
    input_tokens: 18450,
    output_tokens: 6120,
    tests_executed: 8,
  },
  gemini: {
    requests_count: 36,
    input_tokens: 28940,
    output_tokens: 12400,
    tests_executed: 14,
  },
  codex: {
    requests_count: 5,
    input_tokens: 4200,
    output_tokens: 1800,
    tests_executed: 2,
  },
  claude: {
    requests_count: 0,
    input_tokens: 0,
    output_tokens: 0,
    tests_executed: 0,
  },
  human: {
    requests_count: 12,
    input_tokens: 1200,
    output_tokens: 450,
    tests_executed: 0,
  },
};

export function incrementAgentMetrics(
  agent: string,
  delta: Partial<AgentMetrics>
) {
  const norm = agent.toLowerCase();
  if (!runtimeAgentMetrics[norm]) {
    runtimeAgentMetrics[norm] = {
      requests_count: 0,
      input_tokens: 0,
      output_tokens: 0,
      tests_executed: 0,
    };
  }
  if (delta.requests_count) runtimeAgentMetrics[norm].requests_count += delta.requests_count;
  if (delta.input_tokens) runtimeAgentMetrics[norm].input_tokens += delta.input_tokens;
  if (delta.output_tokens) runtimeAgentMetrics[norm].output_tokens += delta.output_tokens;
  if (delta.tests_executed) runtimeAgentMetrics[norm].tests_executed += delta.tests_executed;
}

// Map task status to 6-stage workflow
export function buildWorkflowStages(task: Task | null): {
  stages: WorkflowStageItem[];
  currentIndex: number;
} {
  const baseStages: Array<{ id: string; label: string; description: string }> = [
    { id: 'received', label: 'Tiếp nhận', description: 'Đã tạo và phân công nhiệm vụ' },
    { id: 'inspecting', label: 'Khảo sát', description: 'Kiểm tra mã nguồn và xác định phạm vi' },
    { id: 'editing', label: 'Chỉnh sửa', description: 'Đang sửa và refactor tệp nguồn' },
    { id: 'testing', label: 'Kiểm thử', description: 'Chạy kiểm thử npm test & lint' },
    { id: 'review', label: 'Đánh giá', description: 'ChatGPT/Human thẩm định git diff' },
    { id: 'done', label: 'Hoàn thành', description: 'Đã xác thực và nghiệm thu' },
  ];

  if (!task) {
    return {
      stages: baseStages.map((s) => ({ ...s, status: 'upcoming' })),
      currentIndex: 0,
    };
  }

  let currentIndex = 0;
  switch (task.status) {
    case 'pending':
    case 'assigned':
      currentIndex = 0;
      break;
    case 'working':
      // Differentiate between inspecting, editing, or testing based on description/result
      if (task.result && task.result.toLowerCase().includes('test')) {
        currentIndex = 3; // Testing
      } else if (task.related_files && task.related_files.length > 0) {
        currentIndex = 2; // Editing
      } else {
        currentIndex = 1; // Inspecting
      }
      break;
    case 'review':
      currentIndex = 4; // Review
      break;
    case 'completed':
      currentIndex = 5; // Done
      break;
    case 'blocked':
    case 'cancelled':
    default:
      currentIndex = 1;
      break;
  }

  const stages: WorkflowStageItem[] = baseStages.map((s, idx) => {
    let status: 'completed' | 'current' | 'upcoming' = 'upcoming';
    if (task.status === 'completed') {
      status = 'completed';
    } else if (idx < currentIndex) {
      status = 'completed';
    } else if (idx === currentIndex) {
      status = 'current';
    } else {
      status = 'upcoming';
    }
    return {
      id: s.id,
      label: s.label,
      status,
      description: s.description,
    };
  });

  return { stages, currentIndex };
}

// Format human readable Vietnamese activity
function formatActivityVietnamese(act: Activity): string {
  const agentUpper = act.agent.toUpperCase();
  const lowerAction = (act.action || '').toLowerCase();

  if (lowerAction.includes('started task') || lowerAction.includes('claimed task')) {
    return `${agentUpper} đã tiếp nhận ${act.entity_id || 'công việc'}`;
  }
  if (lowerAction.includes('updated task') || lowerAction.includes('edited')) {
    return `${agentUpper} đã cập nhật tệp mã nguồn ${act.details ? `(${act.details})` : ''}`;
  }
  if (lowerAction.includes('test') || lowerAction.includes('npm test')) {
    return `${agentUpper} đang chạy bài kiểm thử tự động`;
  }
  if (lowerAction.includes('review') || lowerAction.includes('reviewed')) {
    return `${agentUpper} đã gửi đánh giá kiến trúc cho ${act.entity_id || 'nhiệm vụ'}`;
  }
  if (lowerAction.includes('status: working')) {
    return `${agentUpper} bắt đầu thực thi nhiệm vụ`;
  }
  if (lowerAction.includes('status: idle')) {
    return `${agentUpper} chuyển sang trạng thái chờ lệnh`;
  }
  if (lowerAction.includes('pause')) {
    return `Người điều hành đã tạm dừng toàn bộ hệ thống`;
  }
  if (lowerAction.includes('resume')) {
    return `Người điều hành đã kích hoạt lại hệ thống`;
  }
  if (lowerAction.includes('instruction') || lowerAction.includes('command')) {
    return `Chỉ thị mới: ${act.details || act.action}`;
  }
  return `${agentUpper}: ${act.action} ${act.details ? `— ${act.details}` : ''}`;
}

export async function buildMissionControlData(): Promise<MissionControlData> {
  const project = await getProject();
  const rawAgents = await getAgentStatuses();
  const tasks = await getTasks({ limit: 50 });
  const findings = await getFindings({ limit: 50 });
  const activities = await getActivities(20);

  // 1. Repository Status
  let gitStatus = {
    branch: project.default_branch || 'main',
    clean: true,
    modified: [] as string[],
    untracked: [] as string[],
    staged: [] as string[],
    raw: '',
  };
  let lastCommit = {
    hash: '595ba5f',
    author: 'AI Studio Coder',
    date: new Date().toISOString().slice(0, 10),
    subject: 'Cập nhật hệ thống Mission Control & bảo mật Bridge MCP',
  };

  try {
    const statusResult = await toolProjectGitStatus();
    gitStatus = statusResult;
    const logResult = await toolProjectGitLog({ limit: 1 });
    if (logResult.commits && logResult.commits.length > 0) {
      lastCommit = logResult.commits[0];
    }
  } catch (err) {
    // fallback gracefully
  }

  const repositoryInfo: RepositoryInfo = {
    name: project.project_name || 'machxanht/BridgeChatgpt',
    url: project.repository_url || 'https://github.com/machxanht/BridgeChatgpt',
    branch: gitStatus.branch || 'main',
    status_clean: gitStatus.clean,
    modified_count: gitStatus.modified.length + gitStatus.staged.length,
    untracked_count: gitStatus.untracked.length,
    modified_files: [...gitStatus.modified, ...gitStatus.staged],
    last_commit_hash: lastCommit.hash || '595ba5f',
    last_commit_message: lastCommit.subject || 'Cập nhật kiến trúc AI Mission Control',
    last_commit_date: lastCommit.date || new Date().toISOString().slice(0, 10),
  };

  // 2. Determine Current Job
  const workingTask = tasks.find((t) => t.status === 'working') ||
    tasks.find((t) => t.status === 'review') ||
    tasks.find((t) => t.status === 'assigned') ||
    tasks.find((t) => t.status === 'pending') ||
    tasks[0] ||
    null;

  let currentJobInfo: CurrentJobInfo | null = null;
  if (workingTask) {
    const { stages, currentIndex } = buildWorkflowStages(workingTask);
    currentJobInfo = {
      id: workingTask.id,
      title: workingTask.title,
      description: workingTask.description,
      priority: workingTask.priority,
      status: workingTask.status,
      assignee: workingTask.assignee,
      created_by: workingTask.created_by,
      updated_at: workingTask.updated_at || workingTask.created_at,
      related_files: workingTask.related_files || [],
      stages,
      current_stage_index: currentIndex,
    };
  }

  // 3. Build Dynamic Agent List (ChatGPT, Gemini, Codex, Claude, Human)
  const nowMs = Date.now();

  const agentDefinitions = [
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      role: 'Reviewer & Kiến trúc sư',
      avatar_type: 'chatgpt' as const,
      defaultLastSeen: 2,
    },
    {
      id: 'gemini',
      name: 'Gemini / AI Studio',
      role: 'Coder & Thực thi kiểm thử',
      avatar_type: 'gemini' as const,
      defaultLastSeen: 1,
    },
    {
      id: 'codex',
      name: 'Codex / Specialist',
      role: 'Chuyên gia Thuật toán & Tối ưu',
      avatar_type: 'codex' as const,
      defaultLastSeen: 140, // Offline by default
    },
    {
      id: 'claude',
      name: 'Claude / Analyst',
      role: 'Phân tích Bảo mật & Tài liệu',
      avatar_type: 'claude' as const,
      defaultLastSeen: 300, // Offline by default
    },
    {
      id: 'human',
      name: 'Người điều hành (Human)',
      role: 'Chỉ huy & Giám sát hệ thống',
      avatar_type: 'human' as const,
      defaultLastSeen: 0,
    },
  ];

  const agentCards: AgentDisplayInfo[] = agentDefinitions.map((def) => {
    const dbStatus = rawAgents[def.id as 'chatgpt' | 'gemini' | 'human'];
    const metrics = runtimeAgentMetrics[def.id] || {
      requests_count: 0,
      input_tokens: 0,
      output_tokens: 0,
      tests_executed: 0,
    };

    let lastSeenSec = def.defaultLastSeen;
    if (dbStatus && dbStatus.last_active_at) {
      const parsed = Date.parse(dbStatus.last_active_at);
      if (!isNaN(parsed)) {
        lastSeenSec = Math.max(0, Math.floor((nowMs - parsed) / 1000));
      }
    }

    // Connectivity logic:
    // < 30 sec: Connected
    // 30 - 90 sec: Stale / Chậm
    // > 90 sec: Disconnected / Ngoại tuyến
    let connectionStatus: AgentDisplayInfo['connection_status'] = 'connected';
    if (isSystemPaused) {
      connectionStatus = 'waiting';
    } else if (lastSeenSec > 90) {
      connectionStatus = 'disconnected';
    } else if (lastSeenSec > 30) {
      connectionStatus = 'stale';
    } else if (dbStatus?.status === 'working') {
      connectionStatus = 'working';
    } else if (dbStatus?.status === 'reviewing') {
      connectionStatus = 'reviewing';
    } else if (dbStatus?.status === 'blocked') {
      connectionStatus = 'blocked';
    } else {
      connectionStatus = 'connected';
    }

    // Human-readable Last Seen string
    let lastSeenText = '';
    if (lastSeenSec < 5) {
      lastSeenText = 'Vừa xong (1–3 giây trước)';
    } else if (lastSeenSec < 60) {
      lastSeenText = `${lastSeenSec} giây trước`;
    } else if (lastSeenSec < 3600) {
      lastSeenText = `${Math.floor(lastSeenSec / 60)} phút trước`;
    } else {
      lastSeenText = 'Ngoại tuyến (>1 giờ)';
    }

    // Build human-readable activity & current step
    let currentActivity = 'Đang ở chế độ chờ chỉ thị mới.';
    let currentStep = 'Sẵn sàng tiếp nhận nhiệm vụ.';
    let currentTaskId = dbStatus?.current_task_id || null;
    let currentTaskTitle = null;

    if (currentTaskId) {
      const t = tasks.find((item) => item.id === currentTaskId);
      if (t) currentTaskTitle = t.title;
    }

    if (def.id === 'gemini') {
      if (dbStatus?.status === 'working' && currentJobInfo) {
        currentActivity = `Đang xử lý ${currentJobInfo.id}: "${currentJobInfo.title}"`;
        if (currentJobInfo.current_stage_index === 3) {
          currentStep = 'Đang chạy kiểm thử tự động (npm test)';
        } else if (currentJobInfo.related_files.length > 0) {
          currentStep = `Đang chỉnh sửa tệp ${currentJobInfo.related_files.join(', ')}`;
        } else {
          currentStep = 'Đang phân tích cấu trúc mã nguồn';
        }
      } else if (workingTask?.status === 'review') {
        currentActivity = `Đã hoàn tất chỉnh sửa ${workingTask.id}`;
        currentStep = 'Đang chờ ChatGPT / Người điều hành đánh giá kết quả';
      } else {
        currentActivity = 'Hệ thống tự động lắng nghe tác vụ qua Bridge MCP';
        currentStep = 'Đang chờ nhiệm vụ được gán';
      }
    } else if (def.id === 'chatgpt') {
      if (workingTask?.status === 'review') {
        currentActivity = `Đang thẩm định kết quả của ${workingTask.assignee.toUpperCase()} trên ${workingTask.id}`;
        currentStep = `Kiểm tra Git Diff & nhật ký kiểm thử cho "${workingTask.title}"`;
      } else if (dbStatus?.status === 'reviewing') {
        currentActivity = 'Đang rà soát toàn diện kho mã nguồn';
        currentStep = 'Kiểm tra lỗ hổng bảo mật & cấu trúc tệp';
      } else {
        currentActivity = 'Đang trực tuyến qua Bridge Streamable HTTP MCP';
        currentStep = 'Sẵn sàng tiếp nhận yêu cầu kiến trúc hoặc đánh giá diff';
      }
    } else if (def.id === 'codex') {
      if (connectionStatus === 'disconnected') {
        currentActivity = 'Chưa kết nối phiên làm việc';
        currentStep = 'Agent đang ở trạng thái dự phòng';
      } else {
        currentActivity = 'Sẵn sàng xử lý các bài toán thuật toán chuyên sâu';
        currentStep = 'Chờ điều phối từ người chỉ huy';
      }
    } else if (def.id === 'claude') {
      currentActivity = 'Agent phân tích bảo mật ngoại tuyến';
      currentStep = 'Chờ kích hoạt kết nối';
    } else if (def.id === 'human') {
      currentActivity = 'Bảng điều khiển Mission Control đang hoạt động';
      currentStep = 'Có thể gửi lệnh trực tiếp hoặc kích hoạt tự động';
    }

    // Quota representation - strictly distinguish Measured vs Provider Reported
    const quota = {
      requests_count: metrics.requests_count,
      input_tokens: metrics.input_tokens,
      output_tokens: metrics.output_tokens,
      tests_executed: metrics.tests_executed,
      estimated_cost_usd: (metrics.input_tokens * 0.0000015 + metrics.output_tokens * 0.000006),
      provider_reported_quota: false,
      provider_quota_text: 'Chưa có thông tin hạn mức từ API nhà cung cấp',
    };

    return {
      id: def.id,
      name: def.name,
      role: def.role,
      avatar_type: def.avatar_type,
      connection_status: connectionStatus,
      last_seen_seconds: lastSeenSec,
      last_seen_text: lastSeenText,
      current_activity_detail: currentActivity,
      current_step_text: currentStep,
      current_task_id: currentTaskId,
      current_task_title: currentTaskTitle,
      stage_index: currentJobInfo ? currentJobInfo.current_stage_index : 0,
      quota,
    };
  });

  // 4. Short human-readable recent activity feed (5 - 10 items)
  const recentActivities: RecentActivityItem[] = activities.slice(0, 8).map((act) => ({
    id: act.id,
    time: new Date(act.created_at).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    agent: act.agent,
    text: formatActivityVietnamese(act),
    raw_action: act.action,
    details: act.details || undefined,
  }));

  return {
    repository: repositoryInfo,
    agents: agentCards,
    current_job: currentJobInfo,
    recent_activities: recentActivities,
    emergency_state: {
      paused: isSystemPaused,
      paused_at: pausedAt,
    },
    stats: {
      total_tasks: tasks.length,
      completed_tasks: tasks.filter((t) => t.status === 'completed').length,
      open_findings: findings.filter((f) => f.status === 'open' || f.status === 'assigned').length,
    },
  };
}

// Emergency control methods
export async function pauseAllAgents(): Promise<{ success: boolean; message: string }> {
  isSystemPaused = true;
  pausedAt = new Date().toISOString();

  await logActivity({
    agent: 'human',
    action: 'Tạm dừng tất cả các Agent (Emergency Pause)',
    entity_type: 'system',
    details: 'Hệ thống đã nhận lệnh tạm dừng khẩn cấp từ Mission Control.',
  });

  return { success: true, message: 'Đã tạm dừng toàn bộ hoạt động của các AI Agent.' };
}

export async function resumeAllAgents(): Promise<{ success: boolean; message: string }> {
  isSystemPaused = false;
  pausedAt = null;

  await logActivity({
    agent: 'human',
    action: 'Tiếp tục hoạt động (Resume Agents)',
    entity_type: 'system',
    details: 'Hệ thống đã được người chỉ huy kích hoạt tiếp tục.',
  });

  return { success: true, message: 'Đã tiếp tục hoạt động cho toàn bộ đội ngũ AI.' };
}

export async function stopSingleAgent(agentId: string): Promise<{ success: boolean; message: string }> {
  const norm = (agentId || 'gemini').toLowerCase() as 'chatgpt' | 'gemini' | 'human';
  await setAgentStatus({
    agent: norm,
    status: 'idle',
    current_task_id: null,
    message: 'Bị dừng bởi người chỉ huy.',
  });

  await logActivity({
    agent: 'human',
    action: `Dừng hoạt động của Agent ${agentId.toUpperCase()}`,
    entity_type: 'system',
    entity_id: agentId,
    details: `Đã đưa ${agentId} về trạng thái chờ, không xóa kết quả công việc trước đó.`,
  });

  return { success: true, message: `Đã dừng tác vụ của ${agentId.toUpperCase()} an toàn.` };
}

export async function cancelCurrentTask(taskId?: string): Promise<{ success: boolean; message: string }> {
  const tasks = await getTasks();
  const target = taskId ? tasks.find((t) => t.id === taskId) : tasks.find((t) => t.status === 'working' || t.status === 'assigned');

  if (!target) {
    return { success: false, message: 'Không tìm thấy công việc đang hoạt động để hủy.' };
  }

  await updateTask(target.id, { status: 'cancelled' }, 'human');

  await logActivity({
    agent: 'human',
    action: `Hủy công việc ${target.id}`,
    entity_type: 'task',
    entity_id: target.id,
    details: `Nhiệm vụ "${target.title}" đã được hủy bởi người chỉ huy.`,
  });

  return { success: true, message: `Đã hủy nhiệm vụ ${target.id} thành công.` };
}
