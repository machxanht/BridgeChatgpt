import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Brain,
  Bot,
  CheckCircle2,
  Clipboard,
  Clock,
  Cpu,
  FolderGit2,
  GitBranch,
  Pause,
  Play,
  Send,
  Square,
  Terminal,
  User,
  XCircle,
  Zap,
} from 'lucide-react';
import { AgentDisplayInfo, MissionControlData, TargetAgentType, WorkspaceState } from '../types.js';

interface Props {
  state: WorkspaceState;
  missionControl: MissionControlData;
  onSendCommand: (command: string, target: TargetAgentType) => Promise<void>;
  onPauseAll: () => Promise<void>;
  onResumeAll: () => Promise<void>;
  onStopAgent: (agent: string) => Promise<void>;
  onCancelTask: (id?: string) => Promise<void>;
  onTriggerAutoReviewCycle: () => Promise<void>;
  isAutoReviewing: boolean;
  onOpenAdvancedTab: (tab: string) => void;
}

type CommandTarget = TargetAgentType | 'batch';

interface BatchDashboard {
  active_batch: null | {
    id: string;
    title: string;
    goal: string;
    status: 'planned' | 'running' | 'paused' | 'blocked' | 'completed' | 'cancelled';
    pause_reason?: string | null;
  };
  counts: {
    total: number;
    completed: number;
    working: number;
    waiting_chatgpt: number;
    waiting_studio: number;
    review: number;
    blocked: number;
    queued: number;
  };
  elapsed_ms: number;
  progress_percent: number;
  human_action_required: boolean;
  human_action_text: string;
  blockers: Array<{ key: string; title: string; reason: string | null }>;
}

const statusLabels: Record<string, string> = {
  pending: 'CHỜ XỬ LÝ',
  assigned: 'ĐÃ GIAO',
  working: 'ĐANG LÀM',
  blocked: 'BỊ CHẶN',
  review: 'CHỜ DUYỆT',
  completed: 'XONG',
  cancelled: 'ĐÃ HỦY',
};

const batchStatusLabels: Record<string, string> = {
  planned: 'ĐÃ LẬP KẾ HOẠCH',
  running: 'ĐANG CHẠY',
  paused: 'TẠM DỪNG',
  blocked: 'BỊ CHẶN',
  completed: 'HOÀN THÀNH',
  cancelled: 'ĐÃ HỦY',
};

function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds} giây`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  return `${hours} giờ ${minutes % 60} phút`;
}

function formatLocalTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);
}

export const MissionControlView: React.FC<Props> = ({
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
  const [targetAgent, setTargetAgent] = useState<CommandTarget>('chatgpt');
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState<string | null>(null);
  const [sendFeedback, setSendFeedback] = useState('');
  const [batchDashboard, setBatchDashboard] = useState<BatchDashboard | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/batches/dashboard');
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setBatchDashboard(data);
      } catch {
        // Batch dashboard is additive; keep the normal task UI working if unavailable.
      }
    };
    load();
    const timer = window.setInterval(load, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local', []);
  const elapsed = current_job ? formatDuration(now - Date.parse(current_job.created_at)) : '—';
  const progress = current_job
    ? Math.round(((current_job.current_stage_index + 1) / Math.max(1, current_job.stages.length)) * 100)
    : 0;
  const activeBatch = batchDashboard?.active_batch || null;

  const attentionAgent = agents.find(agent => agent.connection_status === 'blocked')
    || agents.find(agent => agent.connection_status === 'stale');

  const visibleActivities = recent_activities
    .filter(item => !/agent status:\s*idle|idle\s*[—-]\s*idle|heartbeat/i.test(item.text || ''))
    .slice(0, 6);

  const humanNextAction = (() => {
    if (emergency_state.paused) return 'Hệ thống đang tạm dừng. Bấm “Tiếp tục” để chạy lại.';
    if (activeBatch && batchDashboard) return batchDashboard.human_action_text;
    if (attentionAgent?.recovery_action) return attentionAgent.recovery_action;
    if (!current_job) return 'Không có việc đang chạy. Mày có thể tạo task mới ở ô bên dưới.';
    if (current_job.status === 'review') return `${current_job.id} đang chờ ChatGPT duyệt.`;
    if (current_job.status === 'assigned' || current_job.status === 'pending') {
      return current_job.assignee === 'gemini'
        ? 'Task đã giao cho AI Studio. Nếu Studio đang nghỉ, kích nó một lần để nhận việc.'
        : 'Task đã giao cho ChatGPT. Quay lại cuộc chat và nhắn làm task Bridge mới nhất.';
    }
    if (current_job.status === 'blocked') return 'Có vấn đề cần xử lý. Xem thẻ màu đỏ bên dưới.';
    if (current_job.status === 'working') return 'Không cần làm gì. Agent đang xử lý.';
    return 'Không cần thao tác.';
  })();

  const heroNeedsAttention = Boolean(activeBatch ? batchDashboard?.human_action_required : attentionAgent);

  const badge = (status: AgentDisplayInfo['connection_status']) => {
    const labels: Record<string, [string, string, string]> = {
      working: ['ĐANG LÀM', 'text-amber-200', 'bg-amber-500/10 border-amber-500/30'],
      reviewing: ['ĐANG DUYỆT', 'text-sky-200', 'bg-sky-500/10 border-sky-500/30'],
      connected: ['ĐANG KẾT NỐI', 'text-emerald-200', 'bg-emerald-500/10 border-emerald-500/30'],
      waiting: ['ĐANG NGHỈ', 'text-indigo-200', 'bg-indigo-500/10 border-indigo-500/30'],
      stale: ['ĐANG NGHỈ', 'text-amber-200', 'bg-amber-500/10 border-amber-500/30'],
      blocked: ['BỊ CHẶN', 'text-rose-200', 'bg-rose-500/10 border-rose-500/30'],
      disconnected: ['CHƯA KẾT NỐI', 'text-slate-300', 'bg-slate-500/10 border-slate-500/30'],
      error: ['LỖI', 'text-rose-200', 'bg-rose-500/10 border-rose-500/30'],
    };
    const item = labels[status] || labels.disconnected;
    return <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${item[1]} ${item[2]}`}>● {item[0]}</span>;
  };

  const icon = (avatar: string) => {
    if (avatar === 'chatgpt') return <Brain className="w-5 h-5 text-indigo-300" />;
    if (avatar === 'gemini') return <Cpu className="w-5 h-5 text-cyan-300" />;
    if (avatar === 'human') return <User className="w-5 h-5 text-purple-300" />;
    return <Bot className="w-5 h-5" />;
  };

  const copyAction = async (agent: AgentDisplayInfo) => {
    if (!agent.recovery_action) return;
    try {
      await navigator.clipboard.writeText(agent.recovery_action);
      setCopied(agent.id);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  };

  const createTask = async (assignee: 'chatgpt' | 'gemini', text: string) => {
    const firstLine = text.split('\n').map(line => line.trim()).find(Boolean) || text;
    const title = firstLine.length > 100 ? `${firstLine.slice(0, 97)}...` : firstLine;
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: text,
        priority: 'high',
        assignee,
        created_by: 'human',
        related_files: [],
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Không tạo được task');
    }
    return res.json();
  };

  const batchControl = async () => {
    if (!activeBatch) return;
    setBusy('batch');
    try {
      const action = activeBatch.status === 'running' ? 'pause' : activeBatch.status === 'planned' ? 'start' : 'resume';
      const response = await fetch(`/api/batches/${activeBatch.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'pause' ? { reason: 'Paused from Mission Control.' } : {}),
      });
      if (!response.ok) throw new Error('Không đổi được trạng thái batch');
      const dashboard = await fetch('/api/batches/dashboard');
      if (dashboard.ok) setBatchDashboard(await dashboard.json());
    } catch (error: any) {
      setSendFeedback(`Lỗi: ${error?.message || 'không điều khiển được batch'}`);
    } finally {
      setBusy(null);
    }
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = commandText.trim();
    if (!text) return;
    setBusy('send');
    setSendFeedback('');
    try {
      if (targetAgent === 'batch') {
        const task = await createTask('chatgpt', `[YÊU CẦU LẬP BATCH / PROJECT LỚN]\n\n${text}\n\nHãy phân tích yêu cầu này thành Batch Orchestrator với dependency DAG, giao phần khó cho ChatGPT và phần workspace/build/test phù hợp cho AI Studio.`);
        setSendFeedback(`Đã tạo ${task.id} yêu cầu ChatGPT lập batch. Quay lại chat và nhắn “làm project Bridge mới nhất”.`);
      } else if (targetAgent === 'chatgpt' || targetAgent === 'gemini') {
        const task = await createTask(targetAgent, text);
        setSendFeedback(`Đã tạo ${task.id} cho ${targetAgent === 'chatgpt' ? 'ChatGPT' : 'AI Studio'}.`);
      } else {
        await onSendCommand(text, targetAgent);
        setSendFeedback('Đã gửi ghi chú cho cả đội.');
      }
      setCommandText('');
    } catch (error: any) {
      setSendFeedback(`Lỗi: ${error?.message || 'không gửi được'}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4 pb-10">
      <section className="grid grid-cols-1 xl:grid-cols-[1.45fr_0.55fr] gap-4">
        <div className="glass-card rounded-2xl p-5 border border-cyan-500/20">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold tracking-wide text-cyan-300 uppercase">{activeBatch ? 'Project lớn đang chạy' : 'Đang làm gì?'}</div>
              <h2 className="text-xl sm:text-2xl font-bold text-white mt-1 truncate">
                {activeBatch ? activeBatch.title : current_job ? current_job.title : 'Hệ thống đang rảnh'}
              </h2>

              {activeBatch && batchDashboard ? (
                <>
                  <div className="text-xs text-slate-400 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-white">{activeBatch.id}</span>
                    <span>· {batchStatusLabels[activeBatch.status] || activeBatch.status}</span>
                    <span>· {batchDashboard.counts.completed}/{batchDashboard.counts.total} task xong</span>
                    <span>· {batchDashboard.progress_percent}%</span>
                    <span>· chạy {formatDuration(batchDashboard.elapsed_ms)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-black/40 overflow-hidden mt-3">
                    <div className="h-full bg-cyan-400 transition-all duration-500" style={{ width: `${batchDashboard.progress_percent}%` }} />
                  </div>
                  <div className="text-[11px] text-slate-500 mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    <span>{batchDashboard.counts.working} đang chạy</span>
                    <span>{batchDashboard.counts.waiting_chatgpt} chờ ChatGPT</span>
                    <span>{batchDashboard.counts.waiting_studio} chờ Studio</span>
                    <span>{batchDashboard.counts.review} chờ duyệt</span>
                    <span className={batchDashboard.counts.blocked ? 'text-rose-300' : ''}>{batchDashboard.counts.blocked} bị chặn</span>
                  </div>
                  {current_job && <div className="text-xs text-slate-400 mt-2 truncate">Đang xử lý: <b className="text-slate-200">{current_job.id}</b> · {current_job.title}</div>}
                </>
              ) : (
                <div className="text-xs text-slate-400 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {current_job ? (
                    <>
                      <span className="font-semibold text-white">{current_job.id}</span>
                      <span>· {statusLabels[current_job.status] || current_job.status}</span>
                      <span>· {current_job.assignee === 'gemini' ? 'AI Studio' : 'ChatGPT'}</span>
                      <span>· {progress}%</span>
                      <span>· chạy {elapsed}</span>
                      <span>· bắt đầu {formatLocalTime(current_job.created_at)}</span>
                    </>
                  ) : <span>Không có task đang chạy.</span>}
                </div>
              )}
            </div>

            <div className="text-right shrink-0 text-[11px] text-slate-500">
              <div>{formatLocalTime(new Date(now).toISOString())}</div>
              <div className="text-cyan-300">{timezone}</div>
              {activeBatch && activeBatch.status !== 'completed' && activeBatch.status !== 'cancelled' && (
                <button onClick={batchControl} disabled={busy === 'batch'} className="mt-2 text-[11px] text-slate-300 hover:text-white border border-white/10 rounded-lg px-2 py-1">
                  {activeBatch.status === 'running' ? <><Pause className="w-3 inline" /> Tạm dừng batch</> : <><Play className="w-3 inline" /> Tiếp tục batch</>}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className={`rounded-2xl p-4 border ${heroNeedsAttention ? 'bg-rose-950/30 border-rose-500/30' : 'glass-card border-emerald-500/20'}`}>
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            {heroNeedsAttention ? <AlertTriangle className="w-5 h-5 text-rose-300" /> : <CheckCircle2 className="w-5 h-5 text-emerald-300" />}
            Mày cần làm gì?
          </div>
          <p className="text-sm text-slate-300 mt-2 leading-5">{humanNextAction}</p>
        </div>
      </section>

      <section className="glass-card rounded-2xl px-4 py-3 border border-white/10">
        <div className="flex justify-between gap-3 flex-wrap items-center">
          <div className="flex gap-3 items-center min-w-0">
            <FolderGit2 className="w-4 h-4 text-cyan-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-bold text-white truncate">{repository.name} <span className="text-cyan-300 text-xs font-mono"><GitBranch className="w-3 inline" /> {repository.branch}</span></div>
              <div className="text-[11px] text-slate-500 truncate">{repository.status_clean ? 'Mã nguồn sạch' : `${repository.modified_count} tệp thay đổi`} · {repository.last_commit_message || 'Chưa có commit'}</div>
            </div>
          </div>
          <button onClick={onTriggerAutoReviewCycle} disabled={isAutoReviewing} className="px-3 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 text-xs"><Zap className="w-3 inline" /> {isAutoReviewing ? 'Đang xử lý...' : 'Duyệt tự động'}</button>
        </div>
      </section>

      {current_job && (
        <section className="glass-card rounded-2xl p-4 border border-white/10">
          <div className="flex justify-between gap-3 items-start flex-wrap">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-cyan-300">CHI TIẾT {current_job.id}</div>
              <p className="text-sm text-slate-300 mt-1 leading-5">{current_job.description}</p>
            </div>
            <button onClick={() => onCancelTask(current_job.id)} className="text-xs text-rose-300 shrink-0"><XCircle className="w-3 inline" /> Hủy task</button>
          </div>
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
            {current_job.stages.map((stage, index) => (
              <div key={stage.id} className={`min-w-[112px] px-3 py-2 rounded-xl border text-xs ${stage.status === 'current' ? 'border-cyan-400 bg-cyan-500/15 text-white' : stage.status === 'completed' ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-100' : 'border-white/5 bg-black/30 text-slate-500'}`}>
                <div className="flex gap-2 items-center"><span className="text-[10px] opacity-60">{index + 1}</span><b>{stage.label}</b></div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex justify-between mb-3 gap-3"><h3 className="text-sm font-semibold text-white">TÀI KHOẢN & AI ĐANG DÙNG</h3><span className="text-xs text-slate-500">Chỉ hiện thông tin cần biết</span></div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {agents.map(agent => {
            const stoppable = ['connected', 'working', 'reviewing'].includes(agent.connection_status);
            const needsHelp = agent.connection_status === 'blocked';
            return (
              <div key={agent.id} className={`rounded-2xl p-4 border ${needsHelp ? 'bg-rose-950/20 border-rose-500/30' : 'glass-card border-white/10'}`}>
                <div className="flex justify-between gap-3 items-start">
                  <div className="flex gap-3">{icon(agent.avatar_type)}<div><b className="text-white">{agent.name}</b><div className="text-xs text-slate-400">{agent.role}</div></div></div>
                  {badge(agent.connection_status)}
                </div>
                <div className="text-xs text-slate-300 mt-3 leading-5">{agent.current_activity_detail}</div>
                <div className="text-[11px] text-slate-500 mt-2">Cập nhật: {agent.last_active_at ? formatLocalTime(agent.last_active_at) : agent.last_seen_text}</div>

                {agent.recovery_action && needsHelp && (
                  <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
                    <div className="text-[11px] font-semibold text-amber-200">CẦN LÀM</div>
                    <p className="text-xs text-amber-50/90 mt-1 leading-5">{agent.recovery_action}</p>
                    <button onClick={() => copyAction(agent)} className="mt-2 text-[11px] text-cyan-200 hover:text-white"><Clipboard className="w-3 inline" /> {copied === agent.id ? 'Đã copy' : 'Copy hướng dẫn'}</button>
                  </div>
                )}

                {stoppable && <button onClick={() => onStopAgent(agent.id)} className="mt-3 text-xs text-rose-300"><Square className="w-3 inline" /> Dừng {agent.name}</button>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="glass-card rounded-2xl p-4 border border-white/10">
          <h3 className="text-sm font-semibold text-white mb-3"><Clock className="w-4 inline text-cyan-400" /> HOẠT ĐỘNG GẦN ĐÂY</h3>
          <div className="space-y-2">
            {visibleActivities.length === 0 && <div className="text-sm text-slate-500">Chưa có hoạt động đáng chú ý.</div>}
            {visibleActivities.map(item => (
              <div key={item.id} className="px-3 py-2 rounded-xl bg-black/30 text-xs flex gap-2 items-start">
                <span className="text-slate-500 font-mono shrink-0">{formatLocalTime(item.created_at || item.time)}</span>
                <div><b className="text-cyan-300">{item.agent.toUpperCase()}</b> <span className="text-slate-200">{item.text}</span></div>
              </div>
            ))}
          </div>
          <button onClick={() => onOpenAdvancedTab('activity')} className="text-xs text-cyan-400 mt-3">Xem nhật ký đầy đủ →</button>
        </div>

        <div className="glass-card rounded-2xl p-4 border border-cyan-500/20">
          <div className="flex justify-between flex-wrap gap-3 items-center">
            <h3 className="font-semibold text-white"><Terminal className="w-5 inline text-cyan-400" /> TẠO TASK / PROJECT</h3>
            <button onClick={async () => { setBusy('pause'); try { if (emergency_state.paused) await onResumeAll(); else await onPauseAll(); } finally { setBusy(null); } }} disabled={busy === 'pause'} className="px-3 py-2 rounded-lg bg-rose-500/15 text-rose-200 text-xs">
              {emergency_state.paused ? <><Play className="w-3 inline" /> Tiếp tục</> : <><Pause className="w-3 inline" /> Tạm dừng</>}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2">Việc nhỏ thì giao trực tiếp. Project lớn thì chọn “Project lớn” để ChatGPT lập batch và chia việc.</p>
          <form onSubmit={send} className="flex flex-col gap-2 mt-3">
            <select value={targetAgent} onChange={event => setTargetAgent(event.target.value as CommandTarget)} className="px-3 py-3 bg-black/50 rounded-xl text-sm border border-white/10">
              <option value="batch">🧩 Project lớn → ChatGPT lập Batch</option>
              <option value="chatgpt">🧠 Việc khó → ChatGPT</option>
              <option value="gemini">⚡ Việc nhẹ / tool / build → AI Studio</option>
              <option value="all">📢 Chỉ gửi ghi chú cho cả đội</option>
            </select>
            <textarea value={commandText} onChange={event => setCommandText(event.target.value)} placeholder="Mô tả việc hoặc nguyên project mày muốn làm..." rows={4} className="w-full px-4 py-3 bg-black/50 rounded-xl text-sm border border-white/10 resize-none" />
            <button disabled={busy === 'send'} className="px-6 py-3 bg-cyan-500 text-slate-950 rounded-xl font-bold"><Send className="w-4 inline" /> {targetAgent === 'all' ? 'Gửi ghi chú' : targetAgent === 'batch' ? 'Giao project lớn' : 'Tạo task'}</button>
          </form>
          {sendFeedback && <div className={`text-xs mt-2 ${sendFeedback.startsWith('Lỗi:') ? 'text-rose-300' : 'text-emerald-300'}`}>{sendFeedback}</div>}
          <div className="text-[11px] text-slate-500 mt-3 leading-5">
            ChatGPT và AI Studio không tự thức nền. Bridge giữ batch/task/state; khi có phần cần agent đang nghỉ, ô “Mày cần làm gì?” sẽ nói đúng agent nào cần kích.
          </div>
        </div>
      </section>
    </div>
  );
};
