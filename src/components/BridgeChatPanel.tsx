import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Clock3,
  Cpu,
  Loader2,
  MessageCircleMore,
  Send,
  Sparkles,
  User,
  Zap,
} from 'lucide-react';
import type { Message, Task } from '../types.js';

interface ResourceTarget {
  target_id: string;
  provider: 'chatgpt' | 'google-ai-studio';
  resource_id: string;
  resource_url: string;
  workspace_id: string;
  project_id: string;
  label: string;
  agent_instance_id: string;
  connection_status: 'registered' | 'active' | 'idle' | 'offline';
  last_seen_at: string | null;
  session_label?: string | null;
}

interface ResourceWorkspace {
  workspace_id: string;
  project_id: string;
  project_name: string;
  repository_url: string;
  branch: string;
  studio_targets: ResourceTarget[];
  chatgpt_targets: ResourceTarget[];
}

const ACTIVE_WORKSPACE_KEY = 'bridge.resource.activeWorkspace';
const BINDING_START = '<!-- BRIDGE_TASK_BINDING_V1';
const BINDING_END = 'BRIDGE_TASK_BINDING_V1 -->';

function readActiveWorkspace() {
  try { return window.localStorage.getItem(ACTIVE_WORKSPACE_KEY) || ''; } catch { return ''; }
}

function parseBinding(description: string) {
  const source = String(description || '');
  const start = source.indexOf(BINDING_START);
  const end = source.indexOf(BINDING_END, start + BINDING_START.length);
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(source.slice(start + BINDING_START.length, end).trim()) as { workspace_id?: string; project_id?: string; agent_instance_id?: string | null };
  } catch {
    return null;
  }
}

function displayTarget(target: ResourceTarget) {
  return target.session_label?.trim() || target.label?.trim() || (target.provider === 'chatgpt' ? 'ChatGPT' : 'AI Studio');
}

function taskStatus(status: Task['status']) {
  const labels: Record<Task['status'], string> = {
    pending: 'CHỜ', assigned: 'ĐÃ GIAO', working: 'ĐANG LÀM', blocked: 'BỊ CHẶN', review: 'CHỜ DUYỆT', completed: 'XONG', cancelled: 'ĐÃ HỦY',
  };
  return labels[status];
}

function avatar(agent: string) {
  if (agent === 'human') return <User className="h-4 w-4" />;
  if (agent === 'chatgpt') return <Brain className="h-4 w-4" />;
  if (agent === 'gemini') return <Cpu className="h-4 w-4" />;
  return <Sparkles className="h-4 w-4" />;
}

function agentName(agent: string) {
  if (agent === 'human') return 'Mày';
  if (agent === 'chatgpt') return 'ChatGPT';
  if (agent === 'gemini') return 'AI Studio';
  return 'Bridge';
}

export const BridgeChatPanel: React.FC = () => {
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(readActiveWorkspace);
  const [workspace, setWorkspace] = useState<ResourceWorkspace | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [targetId, setTargetId] = useState('auto');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const feedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      setActiveWorkspaceId(detail.workspace_id || readActiveWorkspace());
      setTargetId('auto');
    };
    window.addEventListener('bridge:active-project-changed', handle as EventListener);
    return () => window.removeEventListener('bridge:active-project-changed', handle as EventListener);
  }, []);

  const load = async () => {
    try {
      const [registryResponse, taskResponse, messageResponse] = await Promise.all([
        fetch('/api/resource-registry', { cache: 'no-store' }),
        fetch('/api/tasks?limit=300', { cache: 'no-store' }),
        fetch('/api/messages?limit=300', { cache: 'no-store' }),
      ]);
      if (!registryResponse.ok) return;
      const registry = await registryResponse.json();
      const workspaces: ResourceWorkspace[] = registry.workspaces || [];
      const wanted = activeWorkspaceId || readActiveWorkspace();
      const current = workspaces.find(item => item.workspace_id === wanted) || workspaces[0] || null;
      setWorkspace(current);
      if (current && current.workspace_id !== activeWorkspaceId) setActiveWorkspaceId(current.workspace_id);
      if (taskResponse.ok) setTasks(await taskResponse.json());
      if (messageResponse.ok) setMessages(await messageResponse.json());
    } catch {
      // Keep previous feed visible while polling retries.
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 4500);
    return () => window.clearInterval(timer);
  }, [activeWorkspaceId]);

  const projectTasks = useMemo(() => {
    if (!workspace) return [];
    return tasks.filter(task => {
      const binding = parseBinding(task.description);
      return binding?.workspace_id === workspace.workspace_id && binding?.project_id === workspace.project_id;
    });
  }, [tasks, workspace]);

  const projectTaskIds = useMemo(() => new Set(projectTasks.map(task => task.id)), [projectTasks]);

  const feed = useMemo(() => {
    const relevantMessages = messages
      .filter(message => Boolean(message.task_id && projectTaskIds.has(message.task_id)))
      .map(message => ({ kind: 'message' as const, at: message.created_at, message }));

    const resultEntries = projectTasks
      .filter(task => task.result && !relevantMessages.some(entry => entry.message.task_id === task.id && entry.message.type === 'result'))
      .map(task => ({ kind: 'result' as const, at: task.updated_at, task }));

    return [...relevantMessages, ...resultEntries]
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      .slice(-80);
  }, [messages, projectTasks, projectTaskIds]);

  useEffect(() => {
    const node = feedRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [feed.length, workspace?.workspace_id]);

  const targets = useMemo(() => workspace ? [...workspace.chatgpt_targets, ...workspace.studio_targets] : [], [workspace]);

  const chooseTarget = () => {
    if (!workspace) return null;
    if (targetId !== 'auto') return targets.find(target => target.target_id === targetId) || null;
    const newestChat = [...workspace.chatgpt_targets].reverse()[0];
    return newestChat || workspace.studio_targets[0] || null;
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = text.trim();
    if (!content || !workspace) return;
    const target = chooseTarget();
    if (!target) {
      setFeedback('Project này chưa có ChatGPT/Studio session để giao việc.');
      return;
    }

    setBusy(true);
    setFeedback('');
    try {
      const firstLine = content.split('\n').map(line => line.trim()).find(Boolean) || content;
      const taskResponse = await fetch('/api/studio-relay/bound-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: firstLine.length > 100 ? `${firstLine.slice(0, 97)}...` : firstLine,
          description: content,
          priority: 'high',
          assignee: target.provider === 'chatgpt' ? 'chatgpt' : 'gemini',
          workspace_id: workspace.workspace_id,
          project_id: workspace.project_id,
          agent_instance_id: target.agent_instance_id,
          related_files: [],
        }),
      });
      const taskData = await taskResponse.json().catch(() => ({}));
      if (!taskResponse.ok) throw new Error(taskData.error || 'Không tạo được task');

      const messageResponse = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'human',
          to: target.provider === 'chatgpt' ? 'chatgpt' : 'gemini',
          type: 'task',
          content,
          task_id: taskData.task.id,
        }),
      });
      if (!messageResponse.ok) {
        const data = await messageResponse.json().catch(() => ({}));
        throw new Error(data.error || 'Task đã tạo nhưng không ghi được vào chat feed');
      }

      setText('');
      setFeedback(`Đã giao ${taskData.task.id} → ${displayTarget(target)}`);
      await load();
    } catch (error: any) {
      setFeedback(`Lỗi: ${error?.message || 'không gửi được'}`);
    } finally {
      setBusy(false);
    }
  };

  const activeTasks = projectTasks.filter(task => !['completed', 'cancelled'].includes(task.status)).slice(0, 6);

  return (
    <section className="overflow-hidden rounded-3xl border border-cyan-400/15 bg-slate-950/80 shadow-2xl shadow-cyan-950/10">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-500/10">
            <MessageCircleMore className="h-5 w-5 text-cyan-200" />
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
          </div>
          <div><div className="text-sm font-black text-white">BRIDGE CHAT</div><div className="text-[11px] text-slate-500">{workspace ? `${workspace.project_name} · task + handoff + result trong một feed` : 'Chọn project để bắt đầu'}</div></div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/5 px-2.5 py-1 text-[9px] font-bold text-emerald-300"><Zap className="h-3 w-3" /> AUTO ROUTE</div>
      </div>

      {activeTasks.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto border-b border-white/8 px-4 py-2 sm:px-5">
          {activeTasks.map(task => <div key={task.id} className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-[9px] ${task.status === 'blocked' ? 'border-rose-400/20 bg-rose-500/8 text-rose-200' : task.status === 'review' ? 'border-violet-400/20 bg-violet-500/8 text-violet-200' : 'border-white/10 bg-white/5 text-slate-300'}`}>{task.status === 'working' ? <Loader2 className="h-3 w-3 animate-spin" /> : task.status === 'blocked' ? <AlertTriangle className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}<b>{task.id}</b><span>{taskStatus(task.status)}</span></div>)}
        </div>
      )}

      <div ref={feedRef} className="max-h-[460px] min-h-[240px] space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
        {!workspace ? <div className="py-14 text-center text-xs text-slate-500">Chưa có project active.</div> : feed.length === 0 ? <div className="py-14 text-center"><Sparkles className="mx-auto h-7 w-7 text-cyan-400/50" /><div className="mt-2 text-xs font-bold text-slate-300">Chat của {workspace.project_name} đang trống</div><div className="mt-1 text-[10px] text-slate-600">Nhập việc bên dưới. Câu của mày sẽ hiện lại ở đây, agent trả lời cũng hiện ở đây.</div></div> : feed.map((entry, index) => {
          if (entry.kind === 'result') {
            return <div key={`result-${entry.task.id}-${index}`} className="mx-auto max-w-[92%] rounded-2xl border border-emerald-400/15 bg-emerald-500/7 p-3 text-xs text-emerald-100"><div className="mb-1 flex items-center gap-1.5 text-[10px] font-black text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> RESULT · {entry.task.id}</div><div className="whitespace-pre-wrap leading-relaxed">{entry.task.result}</div></div>;
          }
          const message = entry.message;
          const mine = message.from === 'human';
          const agentClass = message.from === 'chatgpt' ? 'border-violet-400/20 bg-violet-500/8' : message.from === 'gemini' ? 'border-cyan-400/20 bg-cyan-500/8' : mine ? 'border-emerald-400/20 bg-emerald-500/8' : 'border-white/10 bg-white/5';
          return <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[92%] rounded-2xl border px-3 py-2.5 ${agentClass}`}><div className="mb-1 flex items-center gap-1.5 text-[10px] font-black text-slate-300">{avatar(message.from)}<span>{agentName(message.from)}</span>{message.task_id && <span className="font-mono font-normal text-slate-600">· {message.task_id}</span>}</div><div className="whitespace-pre-wrap text-xs leading-relaxed text-slate-100">{message.content}</div><div className="mt-1 text-right text-[8px] text-slate-600">{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div></div></div>;
        })}
      </div>

      <form onSubmit={send} className="border-t border-white/10 bg-black/15 p-3 sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <select value={targetId} onChange={e => setTargetId(e.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-[10px] font-bold text-slate-200 sm:max-w-[220px]">
            <option value="auto">✨ Auto · ưu tiên ChatGPT lead</option>
            {targets.map(target => <option key={target.target_id} value={target.target_id}>{target.provider === 'chatgpt' ? '🧠' : '🔵'} {displayTarget(target)}</option>)}
          </select>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder={workspace ? `Nhắn hoặc giao việc cho ${workspace.project_name}...` : 'Chọn project trước'} disabled={!workspace} className="min-w-0 flex-1 resize-none rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-400/40 disabled:opacity-40" />
          <button type="submit" disabled={!text.trim() || busy || !workspace} className="inline-flex min-w-[92px] items-center justify-center gap-1.5 rounded-xl bg-cyan-400 px-4 py-2.5 text-xs font-black text-slate-950 disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Gửi</button>
        </div>
        {feedback && <div className={`mt-2 text-[10px] ${feedback.startsWith('Lỗi:') ? 'text-rose-300' : 'text-emerald-300'}`}>{feedback}</div>}
      </form>
    </section>
  );
};
