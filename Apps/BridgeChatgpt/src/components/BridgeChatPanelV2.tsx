import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Boxes, Brain, ChevronDown, Loader2, MonitorCog, Sparkles, User } from 'lucide-react';
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
  execution_target?: 'pc' | 'studio';
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
    return JSON.parse(source.slice(start + BINDING_START.length, end).trim()) as {
      workspace_id?: string;
      project_id?: string;
      agent_instance_id?: string | null;
    };
  } catch {
    return null;
  }
}

function isLegacyDeployTask(task: Task) {
  const title = String(task.title || '').toLowerCase();
  const description = String(task.description || '').toLowerCase();
  return title.includes('deploy verified compact bridge shell to production')
    || description.includes('deploy only. github machxanht/bridgechatgpt main is the source of truth');
}

function displayTarget(target: ResourceTarget) {
  return target.session_label?.trim() || target.label?.trim() || (target.provider === 'chatgpt' ? 'ChatGPT' : 'AI Studio');
}

function timeLabel(value: string) {
  try { return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}

function MessageRow({ message }: { message: Message; key?: React.Key }) {
  const mine = message.from === 'human';
  const studio = message.from === 'gemini';
  const gpt = message.from === 'chatgpt';
  const Icon = mine ? User : studio ? Boxes : Brain;
  const name = mine ? 'You' : studio ? 'AI Studio' : gpt ? 'ChatGPT' : 'Bridge';
  const accent = mine ? 'text-human' : studio ? 'text-studio' : gpt ? 'text-gpt' : 'text-muted-foreground';
  const bubble = mine
    ? 'border-human/25 bg-human/10'
    : studio
      ? 'border-studio/25 bg-studio/10'
      : gpt
        ? 'border-gpt/25 bg-gpt/10'
        : 'border-border bg-surface';

  return (
    <div className={`flex gap-2.5 ${mine ? 'flex-row-reverse' : ''}`}>
      <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl border border-border bg-surface ${accent}`}>
        <Icon className="size-4" />
      </span>
      <div className={`min-w-0 max-w-[min(48rem,88%)] ${mine ? 'text-right' : ''}`}>
        <div className={`mb-1 flex items-center gap-2 text-[11px] ${mine ? 'justify-end' : ''}`}>
          <span className={`font-semibold ${accent}`}>{name}</span>
          <span className="text-muted-foreground">{timeLabel(message.created_at)}</span>
        </div>
        <div className={`rounded-2xl border px-3.5 py-2.5 text-left text-[13.5px] leading-relaxed shadow-sm ${bubble}`}>
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>
      </div>
    </div>
  );
}

export const BridgeChatPanelV2: React.FC = () => {
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(readActiveWorkspace);
  const [workspace, setWorkspace] = useState<ResourceWorkspace | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [targetId, setTargetId] = useState('auto');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const feedRef = useRef<HTMLDivElement | null>(null);

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
      // Keep the last good UI while polling retries.
    }
  };

  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      setActiveWorkspaceId(detail.workspace_id || readActiveWorkspace());
      setTargetId('auto');
      setPickerOpen(false);
    };
    window.addEventListener('bridge:active-project-changed', handle as EventListener);
    return () => window.removeEventListener('bridge:active-project-changed', handle as EventListener);
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 4500);
    return () => window.clearInterval(timer);
  }, [activeWorkspaceId]);

  const projectTasks = useMemo(() => {
    if (!workspace) return [];
    return tasks.filter(task => {
      if (isLegacyDeployTask(task)) return false;
      const binding = parseBinding(task.description);
      return binding?.workspace_id === workspace.workspace_id && binding?.project_id === workspace.project_id;
    });
  }, [tasks, workspace]);

  const projectTaskIds = useMemo(() => new Set(projectTasks.map(task => task.id)), [projectTasks]);

  const feed = useMemo(() => messages
    .filter(message => Boolean(message.task_id && projectTaskIds.has(message.task_id)))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    .slice(-100), [messages, projectTaskIds]);

  useEffect(() => {
    const node = feedRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [feed.length, workspace?.workspace_id]);

  const targets = useMemo(() => workspace ? [...workspace.chatgpt_targets, ...workspace.studio_targets] : [], [workspace]);

  const chooseTarget = () => {
    if (!workspace) return null;
    if (targetId !== 'auto') return targets.find(target => target.target_id === targetId) || null;
    const newestChat = [...workspace.chatgpt_targets].reverse()[0];
    return (workspace.execution_target || 'studio') === 'pc'
      ? newestChat || null
      : workspace.studio_targets[0] || newestChat || null;
  };

  const targetLabel = () => {
    if (targetId === 'auto') return (workspace?.execution_target || 'studio') === 'pc' ? 'Auto · PC' : 'Auto · Studio';
    const target = targets.find(item => item.target_id === targetId);
    return target ? displayTarget(target) : 'Auto';
  };

  const send = async () => {
    const content = text.trim();
    if (!content || !workspace || busy) return;
    const target = chooseTarget();
    if (!target) {
      setFeedback((workspace.execution_target || 'studio') === 'pc'
        ? 'Bind ChatGPT để xử lý lệnh tự nhiên trên PC. Local Executor vẫn chạy lệnh trực tiếp trong System Details.'
        : 'Bind AI Studio hoặc ChatGPT để giao task.');
      return;
    }

    setBusy(true);
    setFeedback('');
    try {
      const firstLine = content.split('\n').map(line => line.trim()).find(Boolean) || content;
      const taskResponse = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: firstLine.length > 100 ? `${firstLine.slice(0, 97)}...` : firstLine,
          description: `${content}\n\n${BINDING_START}\n${JSON.stringify({ version: 1, workspace_id: workspace.workspace_id, project_id: workspace.project_id, agent_instance_id: target.agent_instance_id })}\n${BINDING_END}`,
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
          task_id: taskData.id,
        }),
      });
      if (!messageResponse.ok) throw new Error('Task đã tạo nhưng không ghi được chat feed');

      setText('');
      setFeedback(`${taskData.id} → ${displayTarget(target)}`);
      await load();
    } catch (error: any) {
      setFeedback(`Lỗi: ${error?.message || 'không gửi được'}`);
    } finally {
      setBusy(false);
    }
  };

  const executionTarget = workspace?.execution_target || 'studio';
  const activeTasks = projectTasks.filter(task => !['completed', 'cancelled'].includes(task.status));

  return (
    <section className="flex min-h-[420px] flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,rgba(15,23,42,0.28),transparent_44%)]">
      <div className="shrink-0 border-b border-border/80 px-3 py-2.5 sm:px-4">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
          <div className="mr-auto min-w-0">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
              <Sparkles className="size-4 text-gpt" />
              Bridge Chat
            </div>
            <div className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
              {workspace ? `${workspace.project_name} · ${activeTasks.length} active task${activeTasks.length === 1 ? '' : 's'}` : 'Choose a project'}
            </div>
          </div>

          <button onClick={() => setTargetId('auto')} className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-medium transition-colors ${targetId === 'auto' ? 'border-gpt/35 bg-gpt/10 text-gpt' : 'border-border bg-surface text-muted-foreground hover:text-foreground'}`}>
            {executionTarget === 'pc' ? <MonitorCog className="size-3.5" /> : <Boxes className="size-3.5" />}
            {executionTarget === 'pc' ? 'PC Local' : 'AI Studio'}
          </button>
        </div>
      </div>

      <div ref={feedRef} className="thin-scrollbar flex-1 overflow-y-auto px-3 sm:px-4">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 py-4">
          {!workspace ? (
            <div className="py-20 text-center text-[13px] text-muted-foreground">Choose a project to start.</div>
          ) : feed.length === 0 ? (
            <div className="mx-auto mt-8 w-full max-w-2xl rounded-3xl border border-border/80 bg-surface/70 p-7 text-center shadow-panel backdrop-blur">
              <div className={`mx-auto grid size-12 place-items-center rounded-2xl border ${executionTarget === 'pc' ? 'border-human/30 bg-human/10 text-human' : 'border-studio/30 bg-studio/10 text-studio'}`}>
                {executionTarget === 'pc' ? <MonitorCog className="size-6" /> : <Boxes className="size-6" />}
              </div>
              <div className="mt-4 text-lg font-semibold text-foreground">{workspace.project_name}</div>
              <div className="mt-1 text-[12px] text-muted-foreground">
                {executionTarget === 'pc' ? 'PC Local Executor selected · Studio remains optional' : 'AI Studio selected · PC remains available'}
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-background/70 p-3 text-left">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gpt">ChatGPT</div>
                  <div className="mt-1 text-[12px] font-medium">{workspace.chatgpt_targets[0] ? displayTarget(workspace.chatgpt_targets[0]) : 'Chưa bind'}</div>
                </div>
                <div className="rounded-2xl border border-border bg-background/70 p-3 text-left">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-studio">AI Studio</div>
                  <div className="mt-1 text-[12px] font-medium">{workspace.studio_targets[0] ? displayTarget(workspace.studio_targets[0]) : 'Chưa bind'}</div>
                </div>
              </div>
            </div>
          ) : feed.map(message => <MessageRow key={message.id} message={message} />)}
        </div>
      </div>

      <div className="sticky bottom-0 shrink-0 border-t border-border bg-background/90 px-3 py-3 backdrop-blur-xl sm:px-4">
        <div className="mx-auto max-w-5xl">
          {pickerOpen && (
            <div className="mb-2 flex flex-wrap gap-1.5 rounded-2xl border border-border bg-surface/95 p-2 shadow-panel">
              <button onClick={() => { setTargetId('auto'); setPickerOpen(false); }} className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] ${targetId === 'auto' ? 'border-gpt/35 bg-gpt/10 text-gpt' : 'border-border text-muted-foreground'}`}>
                {executionTarget === 'pc' ? <MonitorCog className="size-3.5" /> : <Sparkles className="size-3.5" />}
                Auto · {executionTarget === 'pc' ? 'PC' : 'Studio'}
              </button>
              {targets.map(target => (
                <button key={target.target_id} onClick={() => { setTargetId(target.target_id); setPickerOpen(false); }} className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] ${targetId === target.target_id ? 'border-gpt/35 bg-gpt/10 text-gpt' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                  {target.provider === 'chatgpt' ? <Brain className="size-3.5" /> : <Boxes className="size-3.5" />}
                  {displayTarget(target)}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 shadow-panel focus-within:ring-2 focus-within:ring-ring/60">
            <button onClick={() => setPickerOpen(value => !value)} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-surface-2 px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground">
              {targetId === 'auto' ? (executionTarget === 'pc' ? <MonitorCog className="size-3.5" /> : <Sparkles className="size-3.5" />) : chooseTarget()?.provider === 'chatgpt' ? <Brain className="size-3.5" /> : <Boxes className="size-3.5" />}
              <span className="hidden max-w-36 truncate sm:inline">{targetLabel()}</span>
              <ChevronDown className={`size-3 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
            </button>

            <textarea
              value={text}
              rows={1}
              onChange={event => setText(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder={workspace ? `Message ${workspace.project_name}...` : 'Choose a project first'}
              disabled={!workspace}
              className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-1 py-2.5 text-[14px] leading-snug text-foreground outline-none placeholder:text-muted-foreground/70 disabled:opacity-40"
            />

            <button onClick={send} disabled={!text.trim() || busy || !workspace} aria-label="Send" className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-all hover:opacity-90 disabled:opacity-30">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
            </button>
          </div>

          <div className="h-5 pt-1 text-[10.5px] text-muted-foreground">
            <span className={feedback.startsWith('Lỗi:') ? 'text-destructive' : ''}>{feedback}</span>
          </div>
        </div>
      </div>
    </section>
  );
};
