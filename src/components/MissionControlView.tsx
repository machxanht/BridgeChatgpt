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
  Timer,
  User,
  Wifi,
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

const statusLabels: Record<string, string> = {
  pending: 'CHỜ XỬ LÝ',
  assigned: 'ĐÃ GIAO VIỆC',
  working: 'ĐANG LÀM',
  blocked: 'BỊ CHẶN',
  review: 'CHỜ REVIEW',
  completed: 'HOÀN THÀNH',
  cancelled: 'ĐÃ HỦY',
};

function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds} giây`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} phút ${seconds % 60} giây`;
  const hours = Math.floor(minutes / 60);
  return `${hours} giờ ${minutes % 60} phút`;
}

function formatLocalTime(value?: string | null, withDate = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    ...(withDate ? { year: 'numeric', month: '2-digit', day: '2-digit' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
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
  const { repository, agents, current_job, recent_activities, emergency_state, stats } = missionControl;
  const [commandText, setCommandText] = useState('');
  const [targetAgent, setTargetAgent] = useState<TargetAgentType>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local', []);
  const currentElapsed = current_job ? formatDuration(now - Date.parse(current_job.created_at)) : '0 phút';
  const currentIdle = current_job ? formatDuration(now - Date.parse(current_job.updated_at)) : '—';
  const progress = current_job
    ? Math.round(((current_job.current_stage_index + 1) / Math.max(1, current_job.stages.length)) * 100)
    : 0;

  const attentionAgent = agents.find(agent => agent.connection_status === 'blocked')
    || agents.find(agent => agent.connection_status === 'stale');

  const humanNextAction = (() => {
    if (emergency_state.paused) return 'Hệ thống đang tạm dừng. Bấm “Tiếp tục hệ thống” khi muốn chạy lại.';
    if (attentionAgent?.recovery_action) return attentionAgent.recovery_action;
    if (!current_job) return 'Không có task đang chạy. Hệ thống đang rảnh và chờ lệnh mới.';
    if (current_job.status === 'review') return `Quay lại ChatGPT và yêu cầu review ${current_job.id}.`;
    if (current_job.status === 'assigned' || current_job.status === 'pending') {
      return current_job.assignee === 'gemini'
        ? 'Mở AI Studio và gửi lệnh “Check Bridge for the next available task…” để Studio nhận task.'
        : `Agent ${current_job.assignee} đang chờ được kích hoạt.`;
    }
    if (current_job.status === 'blocked') return 'Có blocker. Xem thẻ agent màu đỏ bên dưới để biết nguyên nhân và cách xử lý.';
    if (current_job.status === 'working') return 'Không cần thao tác. Agent đang làm việc; chỉ can thiệp nếu trạng thái chuyển sang BỊ CHẶN.';
    return 'Không cần thao tác.';
  })();

  const badge = (status: AgentDisplayInfo['connection_status']) => {
    const labels: Record<string, [string, string, string]> = {
      working: ['ĐANG LÀM', 'text-amber-200', 'bg-amber-500/10 border-amber-500/30'],
      reviewing: ['ĐANG REVIEW', 'text-sky-200', 'bg-sky-500/10 border-sky-500/30'],
      connected: ['ĐÃ KẾT NỐI', 'text-emerald-200', 'bg-emerald-500/10 border-emerald-500/30'],
      waiting: ['ĐANG CHỜ', 'text-indigo-200', 'bg-indigo-500/10 border-indigo-500/30'],
      stale: ['MẤT HEARTBEAT', 'text-amber-200', 'bg-amber-500/10 border-amber-500/30'],
      blocked: ['BỊ CHẶN', 'text-rose-200', 'bg-rose-500/10 border-rose-500/30'],
      disconnected: ['MẤT KẾT NỐI', 'text-slate-300', 'bg-slate-500/10 border-slate-500/30'],
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

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!commandText.trim()) return;
    setBusy('send');
    try {
      await onSendCommand(commandText.trim(), targetAgent);
      setCommandText('');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5 pb-10">
      <section className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.65fr] gap-4">
        <div className="glass-card rounded-2xl p-5 border border-cyan-500/20">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs font-semibold tracking-wide text-cyan-300 uppercase">Bridge đang làm gì?</div>
              <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">
                {current_job ? current_job.title : 'Hệ thống đang rảnh'}
              </h2>
              <p className="text-sm text-slate-400 mt-2 max-w-3xl">
                {current_job
                  ? `${current_job.id} · ${statusLabels[current_job.status] || current_job.status} · phụ trách: ${current_job.assignee}`
                  : 'Không có nhiệm vụ pending / assigned / working / review.'}
              </p>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-slate-500 uppercase">Giờ trên thiết bị của bạn</div>
              <div className="text-lg font-mono font-bold text-white">{formatLocalTime(new Date(now).toISOString())}</div>
              <div className="text-[11px] text-cyan-300">{timezone}</div>
            </div>
          </div>

          {current_job && (
            <div className="mt-5">
              <div className="flex justify-between text-xs text-slate-400 mb-2">
                <span>Tiến độ: bước {current_job.current_stage_index + 1}/{current_job.stages.length}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-black/40 overflow-hidden border border-white/5">
                <div className="h-full bg-cyan-400 transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                <div className="rounded-xl bg-black/30 border border-white/5 p-3">
                  <div className="text-[11px] text-slate-500">ĐÃ CHẠY</div>
                  <div className="font-bold text-white mt-1 flex items-center gap-2"><Timer className="w-4 h-4 text-cyan-300" /> {currentElapsed}</div>
                </div>
                <div className="rounded-xl bg-black/30 border border-white/5 p-3">
                  <div className="text-[11px] text-slate-500">BẮT ĐẦU LÚC</div>
                  <div className="font-bold text-white mt-1">{formatLocalTime(current_job.created_at, true)}</div>
                </div>
                <div className="rounded-xl bg-black/30 border border-white/5 p-3">
                  <div className="text-[11px] text-slate-500">THAY ĐỔI GẦN NHẤT</div>
                  <div className="font-bold text-white mt-1">{formatLocalTime(current_job.updated_at)} · {currentIdle} trước</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={`rounded-2xl p-5 border ${attentionAgent ? 'bg-rose-950/30 border-rose-500/30' : 'glass-card border-emerald-500/20'}`}>
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            {attentionAgent ? <AlertTriangle className="w-5 h-5 text-rose-300" /> : <CheckCircle2 className="w-5 h-5 text-emerald-300" />}
            Bạn cần làm gì bây giờ?
          </div>
          <p className="text-sm text-slate-300 mt-3 leading-6">{humanNextAction}</p>
          <div className="grid grid-cols-3 gap-2 mt-4 text-center">
            <div className="rounded-xl bg-black/25 p-2"><div className="text-lg font-bold text-white">{stats.total_tasks}</div><div className="text-[10px] text-slate-500">TỔNG TASK</div></div>
            <div className="rounded-xl bg-black/25 p-2"><div className="text-lg font-bold text-emerald-300">{stats.completed_tasks}</div><div className="text-[10px] text-slate-500">ĐÃ XONG</div></div>
            <div className="rounded-xl bg-black/25 p-2"><div className="text-lg font-bold text-amber-300">{stats.open_findings}</div><div className="text-[10px] text-slate-500">FINDING MỞ</div></div>
          </div>
        </div>
      </section>

      <section className="glass-card rounded-2xl p-5 border border-white/10">
        <div className="flex justify-between gap-4 flex-wrap items-start">
          <div>
            <div className="text-xs font-mono text-slate-400 flex gap-2 items-center"><FolderGit2 className="w-4 h-4 text-cyan-400" /> REPOSITORY</div>
            <div className="flex gap-3 items-center mt-2 flex-wrap"><h2 className="font-bold text-white text-lg">{repository.name}</h2><span className="text-cyan-300 text-xs font-mono"><GitBranch className="w-3 inline" /> {repository.branch}</span></div>
            <div className="text-xs text-slate-400 mt-2">{repository.status_clean ? '✓ Working tree clean' : `⚠ ${repository.modified_count} tệp thay đổi`} · Commit <b className="text-cyan-300">{repository.last_commit_hash}</b> {repository.last_commit_message}</div>
          </div>
          <button onClick={onTriggerAutoReviewCycle} disabled={isAutoReviewing} className="px-3 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 text-xs"><Zap className="w-3 inline" /> {isAutoReviewing ? 'Đang xử lý...' : 'Kích hoạt Auto-Review'}</button>
        </div>
      </section>

      {current_job && (
        <section className="glass-card rounded-2xl p-5 border border-white/10">
          <div className="flex justify-between gap-3 items-start flex-wrap">
            <div>
              <div className="text-xs font-mono text-cyan-300">CHI TIẾT {current_job.id}</div>
              <p className="text-sm text-slate-300 mt-2 leading-6">{current_job.description}</p>
            </div>
            <button onClick={() => onCancelTask(current_job.id)} className="text-xs text-rose-300"><XCircle className="w-3 inline" /> Hủy task</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-4">
            {current_job.stages.map((stage, index) => (
              <div key={stage.id} className={`p-3 rounded-xl border text-xs ${stage.status === 'current' ? 'border-cyan-400 bg-cyan-500/15 text-white' : stage.status === 'completed' ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-100' : 'border-white/5 bg-black/30 text-slate-500'}`}>
                <div className="flex gap-2 items-center"><span className="text-[10px] opacity-60">{index + 1}</span><b>{stage.label}</b></div>
                <div className="text-[10px] mt-1 leading-4">{stage.description}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex justify-between mb-3 gap-3"><h3 className="text-sm font-mono text-white">AI TEAM ({agents.length})</h3><span className="text-xs text-slate-400">Trạng thái thật từ Bridge runtime</span></div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {agents.map(agent => {
            const stoppable = ['connected', 'working', 'reviewing'].includes(agent.connection_status);
            const needsHelp = ['blocked', 'stale'].includes(agent.connection_status);
            return (
              <div key={agent.id} className={`rounded-2xl p-5 border ${needsHelp ? 'bg-rose-950/20 border-rose-500/30' : 'glass-card border-white/10'}`}>
                <div className="flex justify-between gap-3 items-start">
                  <div className="flex gap-3">{icon(agent.avatar_type)}<div><b className="text-white">{agent.name}</b><div className="text-xs text-slate-400">{agent.role}</div></div></div>
                  {badge(agent.connection_status)}
                </div>

                <div className="bg-black/35 rounded-xl p-3 mt-4 text-xs space-y-2">
                  <div><span className="text-slate-500">Đang làm:</span><div className="text-slate-200 mt-1 font-medium leading-5">{agent.current_activity_detail}</div></div>
                  <div className="border-t border-white/5 pt-2"><span className="text-slate-500">Bước hiện tại:</span><div className="text-cyan-200 mt-1 leading-5">{agent.current_step_text}</div></div>
                  <div className="border-t border-white/5 pt-2"><span className="text-slate-500">Hiểu đơn giản:</span><div className="text-slate-300 mt-1 leading-5">{agent.status_explanation || 'Không có thêm chi tiết.'}</div></div>
                </div>

                <div className="mt-3 flex justify-between gap-3 text-[11px] text-slate-500">
                  <span><Clock className="w-3 inline" /> Hoạt động gần nhất</span>
                  <span>{agent.last_active_at ? formatLocalTime(agent.last_active_at) : agent.last_seen_text}</span>
                </div>

                {agent.recovery_action && (
                  <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
                    <div className="text-[11px] font-semibold text-amber-200">CÁCH XỬ LÝ</div>
                    <p className="text-xs text-amber-50/90 mt-1 leading-5">{agent.recovery_action}</p>
                    <button onClick={() => copyAction(agent)} className="mt-2 text-[11px] text-cyan-200 hover:text-white"><Clipboard className="w-3 inline" /> {copied === agent.id ? 'Đã copy' : 'Copy hướng dẫn'}</button>
                  </div>
                )}

                <div className="mt-3 text-[10px] text-slate-500 flex items-center gap-1"><Wifi className="w-3 h-3" /> Bridge usage: {agent.quota.requests_count} request · {agent.quota.tests_executed} test</div>
                {stoppable && <button onClick={() => onStopAgent(agent.id)} className="mt-3 text-xs text-rose-300"><Square className="w-3 inline" /> Dừng {agent.name}</button>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="glass-card rounded-2xl p-5 border border-white/10">
          <h3 className="text-sm font-mono text-white mb-3"><Clock className="w-4 inline text-cyan-400" /> HOẠT ĐỘNG GẦN ĐÂY</h3>
          <div className="space-y-2">
            {recent_activities.length === 0 && <div className="text-sm text-slate-500">Chưa có activity.</div>}
            {recent_activities.slice(0, 8).map(item => (
              <div key={item.id} className="p-3 rounded-xl bg-black/30 text-xs">
                <div className="flex gap-2 items-center flex-wrap"><span className="text-slate-500 font-mono">{formatLocalTime(item.created_at || item.time)}</span><b className="text-cyan-300">{item.agent.toUpperCase()}</b></div>
                <div className="text-slate-200 mt-1 leading-5">{item.text}</div>
              </div>
            ))}
          </div>
          <button onClick={() => onOpenAdvancedTab('activity')} className="text-xs text-cyan-400 mt-3">Xem toàn bộ nhật ký →</button>
        </div>

        <div className="glass-card rounded-2xl p-5 border border-white/10">
          <div className="flex justify-between flex-wrap gap-3">
            <h3 className="font-mono text-white"><Terminal className="w-5 inline text-cyan-400" /> GỬI LỆNH NHANH</h3>
            <button onClick={async () => { setBusy('pause'); try { if (emergency_state.paused) await onResumeAll(); else await onPauseAll(); } finally { setBusy(null); } }} disabled={busy === 'pause'} className="px-3 py-2 rounded-lg bg-rose-500/20 text-rose-200 text-xs">
              {emergency_state.paused ? <><Play className="w-3 inline" /> Tiếp tục hệ thống</> : <><Pause className="w-3 inline" /> Tạm dừng tất cả</>}
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">Dùng khi muốn gửi ghi chú hoặc lệnh ngắn cho agent. Task code chính vẫn nên đi qua Bridge task/artifact flow.</p>
          <form onSubmit={send} className="flex flex-col gap-2 mt-4">
            <select value={targetAgent} onChange={event => setTargetAgent(event.target.value as TargetAgentType)} className="px-3 py-3 bg-black/50 rounded-xl text-xs border border-white/10"><option value="all">📢 Tất cả Agent</option><option value="chatgpt">🧠 ChatGPT</option><option value="gemini">⚡ Gemini</option></select>
            <textarea value={commandText} onChange={event => setCommandText(event.target.value)} placeholder="Ví dụ: Kiểm tra Bridge và tiếp tục task hiện tại..." rows={4} className="w-full px-4 py-3 bg-black/50 rounded-xl text-sm border border-white/10 resize-none" />
            <button disabled={busy === 'send'} className="px-6 py-3 bg-cyan-500 text-slate-950 rounded-xl font-bold"><Send className="w-4 inline" /> Gửi lệnh</button>
          </form>
        </div>
      </section>
    </div>
  );
};
