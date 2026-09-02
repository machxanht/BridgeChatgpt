import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bot,
  Brain,
  CheckCircle,
  CheckCircle2,
  Clock,
  Code2,
  Cpu,
  FileCode,
  FolderGit2,
  GitBranch,
  GitCommit,
  Layers,
  Pause,
  Play,
  RotateCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Terminal,
  User,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  AgentDisplayInfo,
  MissionControlData,
  TargetAgentType,
  WorkspaceState,
} from '../types.js';

interface MissionControlViewProps {
  state: WorkspaceState;
  missionControl: MissionControlData;
  onSendCommand: (command: string, targetAgent: TargetAgentType) => Promise<void>;
  onPauseAll: () => Promise<void>;
  onResumeAll: () => Promise<void>;
  onStopAgent: (agent: string) => Promise<void>;
  onCancelTask: (taskId?: string) => Promise<void>;
  onTriggerAutoReviewCycle: () => Promise<void>;
  isAutoReviewing: boolean;
  onOpenAdvancedTab: (tab: string) => void;
}

export const MissionControlView: React.FC<MissionControlViewProps> = ({
  state,
  missionControl,
  onSendCommand,
  onPauseAll,
  onResumeAll,
  onStopAgent,
  onCancelTask,
  onTriggerAutoReviewCycle,
  isAutoReviewing,
  onOpenAdvancedTab,
}) => {
  const { repository, agents, current_job, recent_activities, emergency_state } = missionControl;
  const [commandText, setCommandText] = useState('');
  const [targetAgent, setTargetAgent] = useState<TargetAgentType>('all');
  const [isSending, setIsSending] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const presets = [
    { label: 'Rà soát bảo mật & Auth', text: '@ChatGPT hãy rà soát mã nguồn xác thực và bảo mật endpoint.' },
    { label: 'Sửa lỗi & chạy test', text: '@Gemini hãy kiểm tra các bài test đang thất bại và sửa lỗi.' },
    { label: 'Thẩm định Git Diff', text: '@ChatGPT hãy thẩm định tất cả thay đổi trong Git Diff gần nhất.' },
    { label: 'Tạm dừng tất cả', text: 'Tạm dừng tất cả' },
  ];

  const handleFormSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!commandText.trim()) return;

    setIsSending(true);
    try {
      await onSendCommand(commandText.trim(), targetAgent);
      setCommandText('');
    } finally {
      setIsSending(false);
    }
  };

  const handlePauseToggle = async () => {
    setActionLoading('pause');
    try {
      if (emergency_state.paused) {
        await onResumeAll();
      } else {
        await onPauseAll();
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleStopAgentClick = async (agentId: string) => {
    setActionLoading(`stop-${agentId}`);
    try {
      await onStopAgent(agentId);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelCurrentTask = async () => {
    if (!current_job) return;
    if (!window.confirm(`Bạn có chắc chắn muốn hủy công việc "${current_job.id}: ${current_job.title}" không?`)) return;
    setActionLoading('cancel-task');
    try {
      await onCancelTask(current_job.id);
    } finally {
      setActionLoading(null);
    }
  };

  // Helper for agent status badges
  const renderAgentStatusBadge = (status: AgentDisplayInfo['connection_status']) => {
    switch (status) {
      case 'working':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-amber-950/80 border border-amber-500/40 text-amber-300">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping"></span>
            ĐANG LÀM VIỆC
          </span>
        );
      case 'reviewing':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-sky-950/80 border border-sky-500/40 text-sky-300">
            <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse"></span>
            ĐANG ĐÁNH GIÁ
          </span>
        );
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-emerald-950/80 border border-emerald-500/30 text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
            ĐÃ KẾT NỐI
          </span>
        );
      case 'waiting':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-indigo-950/80 border border-indigo-500/30 text-indigo-300">
            <span className="h-2 w-2 rounded-full bg-indigo-400"></span>
            ĐANG CHỜ
          </span>
        );
      case 'stale':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-amber-950/60 border border-amber-600/30 text-amber-400">
            <span className="h-2 w-2 rounded-full bg-amber-500"></span>
            CHẬM / HẾT HẠN
          </span>
        );
      case 'blocked':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-rose-950/80 border border-rose-500/40 text-rose-300">
            <span className="h-2 w-2 rounded-full bg-rose-400"></span>
            BỊ CHẶN
          </span>
        );
      case 'disconnected':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-slate-900 border border-white/10 text-slate-400">
            <span className="h-2 w-2 rounded-full bg-slate-600"></span>
            MẤT KẾT NỐI
          </span>
        );
    }
  };

  const getAgentIcon = (avatarType: string) => {
    switch (avatarType) {
      case 'chatgpt':
        return <Brain className="w-5 h-5 text-indigo-300" />;
      case 'gemini':
        return <Cpu className="w-5 h-5 text-cyan-300" />;
      case 'codex':
        return <Code2 className="w-5 h-5 text-emerald-300" />;
      case 'claude':
        return <Sparkles className="w-5 h-5 text-amber-300" />;
      case 'human':
        return <User className="w-5 h-5 text-purple-300" />;
      default:
        return <Bot className="w-5 h-5 text-slate-300" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. ACTIVE REPOSITORY (Kho lưu trữ đang hoạt động) */}
      <section
        id="active-repository-panel"
        className="glass-card rounded-2xl p-5 sm:p-6 border border-white/10 shadow-2xl relative overflow-hidden backdrop-blur-xl"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <FolderGit2 className="w-4 h-4 text-cyan-400" />
              <span className="text-[11px] font-mono uppercase tracking-widest text-slate-400 font-semibold">
                Kho lưu trữ đang hoạt động
              </span>
              {emergency_state.paused && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                  <Pause className="w-2.5 h-2.5" /> HỆ THỐNG ĐANG TẠM DỪNG
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2">
                {repository.name}
              </h2>
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-xs font-mono text-cyan-300">
                <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
                <span>{repository.branch}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs font-mono text-slate-400 pt-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Trạng thái:</span>
                {repository.status_clean ? (
                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Sạch (Working tree clean)
                  </span>
                ) : (
                  <span className="text-amber-300 font-medium flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> {repository.modified_count} tệp đã thay đổi ({repository.untracked_count} tệp mới)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Commit gần nhất:</span>
                <span className="text-cyan-300 font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-[11px]">
                  {repository.last_commit_hash}
                </span>
                <span className="text-slate-300 truncate max-w-[280px] sm:max-w-md">
                  {repository.last_commit_message}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              id="header-step-auto-review-btn"
              onClick={onTriggerAutoReviewCycle}
              disabled={isAutoReviewing}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-mono font-medium bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/25 transition-all shadow-md disabled:opacity-50"
              title="Kích hoạt chu kỳ tự động đánh giá tiếp theo"
            >
              <Zap className={`w-3.5 h-3.5 text-amber-400 ${isAutoReviewing ? 'animate-spin' : ''}`} />
              <span>{isAutoReviewing ? 'Đang xử lý...' : 'Kích hoạt Auto-Review'}</span>
            </button>

            <button
              id="view-advanced-git-btn"
              onClick={() => onOpenAdvancedTab('git')}
              className="px-3.5 py-2 rounded-xl text-xs font-mono font-medium bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-colors"
            >
              Xem Git Diff & Mã nguồn →
            </button>
          </div>
        </div>
      </section>

      {/* 2. CURRENT JOB (Công việc hiện tại & Quy trình 6 bước rõ ràng) */}
      <section
        id="current-job-panel"
        className="glass-card rounded-2xl p-5 sm:p-6 border border-white/10 shadow-2xl relative overflow-hidden backdrop-blur-xl"
      >
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 pb-4 border-b border-white/10 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold">
                CÔNG VIỆC HIỆN TẠI (CURRENT JOB)
              </span>
              {current_job && (
                <span className="font-mono text-xs font-bold text-slate-300">
                  {current_job.id}
                </span>
              )}
            </div>
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
              {current_job ? current_job.title : 'Chưa có công việc nào đang xử lý. Toàn bộ hệ thống đang sẵn sàng.'}
            </h3>
            {current_job && (
              <p className="text-xs text-slate-400 line-clamp-2 mt-1 max-w-3xl leading-relaxed">
                {current_job.description}
              </p>
            )}
          </div>

          {current_job && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-mono text-slate-400">
                Thực thi: <strong className="text-cyan-300 uppercase">{current_job.assignee}</strong>
              </span>
              <button
                id="cancel-active-task-btn"
                onClick={handleCancelCurrentTask}
                disabled={actionLoading === 'cancel-task'}
                className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition-all flex items-center gap-1"
                title="Hủy nhiệm vụ đang chạy (không xóa dữ liệu)"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Hủy việc</span>
              </button>
            </div>
          )}
        </div>

        {/* 6-Stage Progress Trackers (Không dựng phần trăm giả) */}
        <div className="pt-1">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
            <span>Tiến trình thực hiện nhiệm vụ:</span>
            {current_job && (
              <span className="text-cyan-300 font-semibold">
                Giai đoạn {current_job.current_stage_index + 1} / 6
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {(current_job?.stages || [
              { id: 'received', label: '1. Tiếp nhận', status: 'completed' },
              { id: 'inspecting', label: '2. Khảo sát', status: 'upcoming' },
              { id: 'editing', label: '3. Chỉnh sửa', status: 'upcoming' },
              { id: 'testing', label: '4. Kiểm thử', status: 'upcoming' },
              { id: 'review', label: '5. Đánh giá', status: 'upcoming' },
              { id: 'done', label: '6. Hoàn thành', status: 'upcoming' },
            ]).map((stage, idx) => {
              const isCompleted = stage.status === 'completed';
              const isCurrent = stage.status === 'current';

              return (
                <div
                  key={stage.id || idx}
                  className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
                    isCurrent
                      ? 'bg-cyan-500/15 border-cyan-400 text-white shadow-lg shadow-cyan-950/50 ring-1 ring-cyan-400/40'
                      : isCompleted
                      ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
                      : 'bg-black/30 border-white/5 text-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-mono font-bold tracking-tight">
                      {stage.label}
                    </span>
                    {isCompleted && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                    {isCurrent && <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping shrink-0"></span>}
                    {!isCompleted && !isCurrent && <span className="text-slate-600 text-xs">○</span>}
                  </div>
                  <span className="text-[10px] line-clamp-1 opacity-80">
                    {stage.description || (isCompleted ? 'Đã hoàn tất' : isCurrent ? 'Đang thực hiện' : 'Chờ đến lượt')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. AGENT STATUS (Hỗ trợ 2, 3 hoặc nhiều Agent động) */}
      <section id="agent-cards-container" className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-slate-100 uppercase tracking-wider font-mono">
              Trạng thái đội ngũ AI Agent ({agents.length})
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Tự động cập nhật qua heartbeat thời gian thực
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => {
            const isWorking = agent.connection_status === 'working';
            const isReviewing = agent.connection_status === 'reviewing';
            const isConnected = agent.connection_status === 'connected' || isWorking || isReviewing;

            return (
              <div
                key={agent.id}
                id={`agent-card-${agent.id}`}
                className={`glass-card rounded-2xl p-5 border flex flex-col justify-between shadow-xl transition-all relative overflow-hidden backdrop-blur-xl ${
                  isWorking
                    ? 'border-cyan-500/40 bg-cyan-500/5 hover:border-cyan-400/60'
                    : isReviewing
                    ? 'border-indigo-500/40 bg-indigo-500/5 hover:border-indigo-400/60'
                    : isConnected
                    ? 'border-white/10 hover:border-white/20'
                    : 'border-white/5 opacity-75'
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 mb-3.5">
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-11 w-11 rounded-xl flex items-center justify-center shadow-inner border ${
                          agent.id === 'chatgpt'
                            ? 'bg-indigo-600/30 border-indigo-500/40'
                            : agent.id === 'gemini'
                            ? 'bg-cyan-500/20 border-cyan-500/40'
                            : agent.id === 'codex'
                            ? 'bg-emerald-500/20 border-emerald-500/40'
                            : 'bg-white/10 border-white/15'
                        }`}
                      >
                        {getAgentIcon(agent.avatar_type)}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-100 text-sm flex items-center gap-2">
                          {agent.name}
                        </h4>
                        <p className="text-[11px] font-mono text-slate-400">
                          {agent.role}
                        </p>
                      </div>
                    </div>

                    <div>{renderAgentStatusBadge(agent.connection_status)}</div>
                  </div>

                  {/* What is this agent doing right now? (Quan trọng nhất) */}
                  <div className="bg-black/40 border border-white/5 rounded-xl p-3.5 mb-3.5 backdrop-blur-sm space-y-2">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block mb-0.5">
                        Hoạt động hiện tại:
                      </span>
                      <p className="text-xs font-semibold text-slate-200 leading-relaxed">
                        {agent.current_activity_detail}
                      </p>
                    </div>

                    <div className="pt-1 border-t border-white/5">
                      <span className="text-[10px] font-mono text-slate-500 block mb-0.5">
                        Bước thực thi:
                      </span>
                      <p className="text-xs font-mono text-cyan-300">
                        {agent.current_step_text}
                      </p>
                    </div>

                    {/* Last seen */}
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1">
                      <span className="flex items-center gap-1 text-slate-500">
                        <Clock className="w-3 h-3" /> Hoạt động gần nhất:
                      </span>
                      <span className="text-slate-300 font-medium">
                        {agent.last_seen_text}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quota & Usage Section (Đo lường bởi Bridge vs Hạn mức nhà cung cấp) */}
                <div className="pt-3 border-t border-white/10 space-y-2">
                  <div className="bg-white/5 rounded-lg p-2.5 font-mono text-[11px] space-y-1">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400">Đo lường bởi Bridge:</span>
                      <span className="font-bold text-cyan-300">
                        {agent.quota.requests_count} yêu cầu • {agent.quota.input_tokens + agent.quota.output_tokens} tokens
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400 text-[10px]">
                      <span>Kiểm thử đã chạy: {agent.quota.tests_executed}</span>
                      <span>Ước tính: ${agent.quota.estimated_cost_usd?.toFixed(4) || '0.0000'}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 italic pt-0.5">
                      Hạn mức nhà cung cấp: {agent.quota.provider_quota_text}
                    </div>
                  </div>

                  {/* Individual Stop Control */}
                  {isConnected && (
                    <div className="flex justify-end pt-1">
                      <button
                        id={`stop-agent-btn-${agent.id}`}
                        onClick={() => handleStopAgentClick(agent.id)}
                        disabled={actionLoading === `stop-${agent.id}`}
                        className="text-[11px] font-mono text-rose-400 hover:text-rose-300 px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-colors flex items-center gap-1"
                      >
                        <Square className="w-2.5 h-2.5" />
                        <span>Dừng {agent.name.split(' ')[0]}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. RECENT ACTIVITY (Nhật ký hoạt động ngắn gọn 5-10 sự kiện) */}
      <section
        id="recent-activity-panel"
        className="glass-card rounded-2xl p-5 sm:p-6 border border-white/10 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-slate-100 font-mono uppercase tracking-wider">
              Hoạt động gần đây (Recent Activity Feed)
            </h3>
          </div>
          <button
            id="view-all-logs-btn"
            onClick={() => onOpenAdvancedTab('activity')}
            className="text-xs font-mono text-cyan-400 hover:text-cyan-300"
          >
            Xem toàn bộ nhật ký hệ thống →
          </button>
        </div>

        <div className="space-y-2">
          {recent_activities.length === 0 ? (
            <p className="text-xs font-mono text-slate-500 py-3 text-center">
              Chưa có hoạt động nào được ghi nhận.
            </p>
          ) : (
            recent_activities.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-black/30 border border-white/5 font-mono text-xs hover:border-white/10 transition-colors"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <span className="text-[10px] text-slate-500 shrink-0">{item.time}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                      item.agent === 'gemini'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : item.agent === 'chatgpt'
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        : item.agent === 'human'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'bg-white/10 text-slate-300'
                    }`}
                  >
                    {item.agent}
                  </span>
                  <span className="text-slate-200 font-medium truncate">{item.text}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 5. GLOBAL COMMAND CENTER (Trung tâm lệnh toàn cầu & Điều khiển khẩn cấp) */}
      <section
        id="command-center-panel"
        className="glass-card rounded-2xl p-5 sm:p-6 border border-white/10 shadow-2xl relative overflow-hidden backdrop-blur-xl"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm sm:text-base font-bold text-white font-mono uppercase tracking-wider">
              Trung tâm lệnh toàn cầu (AI Command Center)
            </h3>
          </div>

          {/* Emergency Controls Toolbar */}
          <div className="flex items-center gap-2">
            <button
              id="emergency-pause-all-btn"
              onClick={handlePauseToggle}
              disabled={actionLoading === 'pause'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all border shadow-md ${
                emergency_state.paused
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-400 shadow-emerald-500/20'
                  : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border-rose-500/40 shadow-rose-950/40'
              }`}
            >
              {emergency_state.paused ? (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Tiếp tục hoạt động (Resume)</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Tạm dừng tất cả (Pause All)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Command Form */}
        <form onSubmit={handleFormSubmit} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2.5">
            {/* Target Agent Selector */}
            <div className="flex items-center">
              <select
                id="target-agent-select"
                value={targetAgent}
                onChange={(e) => setTargetAgent(e.target.value as TargetAgentType)}
                className="w-full sm:w-auto px-3.5 py-3 rounded-xl bg-black/50 border border-white/10 text-slate-100 text-xs sm:text-sm font-mono focus:outline-none focus:border-cyan-500"
              >
                <option value="all" className="bg-slate-900 text-slate-100">📢 Tất cả Agent (@All)</option>
                <option value="chatgpt" className="bg-slate-900 text-slate-100">🧠 ChatGPT (Reviewer)</option>
                <option value="gemini" className="bg-slate-900 text-slate-100">⚡ Gemini (Coder)</option>
                <option value="codex" className="bg-slate-900 text-slate-100">🎯 Codex (Specialist)</option>
              </select>
            </div>

            {/* Input prompt */}
            <div className="flex-1 relative">
              <input
                id="global-command-input"
                type="text"
                value={commandText}
                onChange={(e) => setCommandText(e.target.value)}
                placeholder="Ra lệnh cho đội ngũ AI của bạn... (Ví dụ: @Gemini hãy sửa lỗi bảo mật, @ChatGPT hãy đánh giá lại repo...)"
                className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 text-slate-100 text-xs sm:text-sm placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 font-sans"
              />
            </div>

            {/* Send Button */}
            <button
              id="submit-command-btn"
              type="submit"
              disabled={isSending || !commandText.trim()}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs sm:text-sm transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              <Send className="w-4 h-4" />
              <span>Gửi lệnh</span>
            </button>
          </div>

          {/* Prompt Presets */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-[11px] font-mono text-slate-500 uppercase whitespace-nowrap">
              Gợi ý nhanh:
            </span>
            {presets.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCommandText(preset.text)}
                className="px-3 py-1.5 rounded-lg text-xs font-mono bg-white/5 hover:bg-white/10 text-slate-300 hover:text-cyan-300 transition-colors whitespace-nowrap border border-white/10"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </form>
      </section>
    </div>
  );
};
