import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  Boxes,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  File as FileIcon,
  Image as ImageIcon,
  Loader2,
  MonitorCog,
  Paperclip,
  Sparkles,
  TriangleAlert,
  User,
  Video,
  X,
} from 'lucide-react';
import { userFacingResult } from '../chatMode.js';
import type { Message, Task } from '../types.js';
import { buildMultiRolePlan, requiresAction, shouldAutoDebate, wantsMultiAgentDebate } from '../chatRouting.js';

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
const ATTACHMENT_START = '<!-- BRIDGE_ATTACHMENTS_V1';
const ATTACHMENT_END = 'BRIDGE_ATTACHMENTS_V1 -->';
const DEBATE_MARKER = '<!-- BRIDGE_DEBATE_V1 -->';
const CHAT_MARKER = '<!-- BRIDGE_CHAT_V1 -->';
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

type UploadedAttachment = { id:string; name:string; type:string; size:number; url:string; created_at:string };

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
      ? 'border-studio/20 bg-studio/8'
      : gpt
        ? 'border-gpt/20 bg-gpt/8'
        : 'border-border bg-surface';

  return (
    <div className={`flex animate-rise gap-2.5 ${mine ? 'flex-row-reverse' : ''}`}>
      <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-border bg-surface ${accent}`}>
        <Icon className="size-3.5" />
      </span>
      <div className={`min-w-0 max-w-[min(46rem,88%)] ${mine ? 'items-end text-right' : ''}`}>
        <div className={`mb-1 flex items-center gap-2 text-[11px] ${mine ? 'justify-end' : ''}`}>
          <span className={`font-semibold ${accent}`}>{name}</span>
          <span className="text-muted-foreground">{timeLabel(message.created_at)}</span>
        </div>
        <div className={`rounded-xl border px-3 py-2 text-left text-[13.5px] leading-relaxed ${bubble}`}>
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>
      </div>
    </div>
  );
}

export const BridgeChatPanel: React.FC = () => {
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(readActiveWorkspace);
  const [workspace, setWorkspace] = useState<ResourceWorkspace | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [targetId, setTargetId] = useState('auto');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [deliveryState, setDeliveryState] = useState<'idle' | 'sending' | 'delivered'>('idle');
  const feedRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      // Keep the previous chat visible while polling retries.
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 1000);
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
    const userMessages = messages
      .filter(message => message.from === 'human' && ['task', 'question'].includes(message.type)
        && !/^New task TASK-\d+ assigned: /.test(message.content)
        && Boolean(message.task_id && projectTaskIds.has(message.task_id)));
    // Tasks are the canonical answer, avoiding stale/duplicate result messages and logs.
    const answers: Message[] = projectTasks
      .filter(task => task.status === 'completed' && task.result)
      .map(task => ({ id: 'answer-' + task.id, from: task.description.includes(DEBATE_MARKER) ? 'chatgpt' : task.assignee,
        to: 'human', type: 'result', content: userFacingResult(task.result!),
        task_id: task.id, created_at: task.updated_at }));
    return [...userMessages, ...answers]
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      .slice(-100);
  }, [messages, projectTasks, projectTaskIds]);

  useEffect(() => {
    const node = feedRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [feed, workspace?.workspace_id]);

  const targets = useMemo(() => workspace ? [...workspace.chatgpt_targets, ...workspace.studio_targets] : [], [workspace]);

  const chooseTarget = () => {
    if (!workspace) return null;
    if (targetId !== 'auto') return targets.find(target => target.target_id === targetId) || null;
    return [...workspace.chatgpt_targets].reverse().find(item => item.connection_status !== 'offline')
      || workspace.studio_targets.find(item => item.connection_status !== 'offline') || null;
  };

  const targetLabel = () => {
    if (targetId === 'auto') return 'Auto';
    const target = targets.find(item => item.target_id === targetId);
    return target ? displayTarget(target) : 'Auto';
  };

  const send = async () => {
    const content = text.trim() || (attachments.length ? 'Analyze the attached file(s).' : '');
    if (!content || !workspace || busy) return;
    const chosenTarget = chooseTarget();
    const rolePlan = buildMultiRolePlan(content);
    const chatRoleTarget = [...workspace.chatgpt_targets].reverse().find(item => item.connection_status !== 'offline') || null;
    const studioRoleTarget = workspace.studio_targets.find(item => item.connection_status !== 'offline') || null;
    if ((rolePlan.length || wantsMultiAgentDebate(content)) && (!chatRoleTarget || !studioRoleTarget)) {
      setFeedback('Multi-role cần cả ChatGPT và AI Studio đang được bind/online để mỗi vai trò có reply riêng.');
      return;
    }
    const fastChat = !rolePlan.length && !requiresAction(content);
    const debateStudio = !rolePlan.length && shouldAutoDebate(
      content,
      workspace.studio_targets.map(item => item.connection_status),
      workspace.chatgpt_targets.map(item => item.connection_status),
    ) ? workspace.studio_targets.find(item => item.connection_status !== 'offline') || null : null;
    const fastChatTarget = fastChat && !debateStudio && targetId === 'auto'
      ? [...workspace.chatgpt_targets].reverse().find(item => item.connection_status !== 'offline') || null
      : null;
    const target = debateStudio || fastChatTarget || chosenTarget;
    if (!rolePlan.length && !target) {
      setFeedback((workspace.execution_target || 'studio') === 'pc'
        ? 'PC mode cần bind ChatGPT conversation để xử lý lệnh tự nhiên. Local Executor vẫn dùng được trong System Details.'
        : 'Project này chưa có AI Studio/ChatGPT session để giao việc.');
      return;
    }

    setBusy(true);
    setDeliveryState('sending');
    setFeedback('');
    try {
      const uploaded: UploadedAttachment[] = [];
      for (const file of attachments) {
        const response = await fetch('/api/attachments', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name), 'x-file-type': file.type || 'application/octet-stream' }, body: file });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Không upload được ${file.name}`);
        uploaded.push(data.attachment);
      }
      const attachmentBlock = uploaded.length ? `\n\n${ATTACHMENT_START}\n${JSON.stringify(uploaded)}\n${ATTACHMENT_END}` : '';
      const firstLine = content.split('\n').map(line => line.trim()).find(Boolean) || content;

      if (rolePlan.length) {
        const roleKeys = rolePlan.map((_, index) => `ROLE-${index + 1}`);
        const batchTasks = rolePlan.map((step, index) => {
          const roleTarget = step.assignee === 'chatgpt' ? chatRoleTarget! : studioRoleTarget!;
          return {
            key: roleKeys[index],
            title: `${step.label}: ${step.instruction.slice(0, 72)}`,
            description: `${content}${attachmentBlock}\n\nAssigned role: ${step.label}\nFocus only on this role: ${step.instruction}\nReturn a concrete role result for the next collaborator.\n\n${BINDING_START}\n${JSON.stringify({ workspace_id: workspace.workspace_id, project_id: workspace.project_id, agent_instance_id: roleTarget.agent_instance_id })}\n${BINDING_END}`,
            assignee: step.assignee,
            priority: 'high',
            depends_on: index === 0 ? [] : [roleKeys[index - 1]],
            related_files: [],
          };
        });
        batchTasks.push({
          key: 'SYNTHESIS',
          title: 'ChatGPT: synthesize all role results',
          description: `${content}${attachmentBlock}\n\nSynthesis role: read every dependency output, resolve conflicts, state what each role contributed, and return one final user-facing answer/result. Do not silently drop any role.\n\n${BINDING_START}\n${JSON.stringify({ workspace_id: workspace.workspace_id, project_id: workspace.project_id, agent_instance_id: chatRoleTarget!.agent_instance_id })}\n${BINDING_END}`,
          assignee: 'chatgpt',
          priority: 'high',
          depends_on: roleKeys,
          related_files: [],
        });

        const batchResponse = await fetch('/api/batches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: firstLine.length > 100 ? `${firstLine.slice(0, 97)}...` : firstLine, goal: content, tasks: batchTasks, created_by: 'human', auto_start: true, limits: { max_parallel_tasks: 1 } }),
        });
        const batchData = await batchResponse.json().catch(() => ({}));
        if (!batchResponse.ok) throw new Error(batchData.error || 'Không tạo được multi-role workflow');
        const firstBridgeTaskId = batchData.tasks?.find((item: any) => item.bridge_task_id)?.bridge_task_id;
        if (!firstBridgeTaskId) throw new Error('Multi-role workflow đã tạo nhưng child task đầu chưa materialize');
        const messageResponse = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'human', to: rolePlan[0].assignee, type: 'task', content: uploaded.length ? `${content}\n\nAttachments:\n${uploaded.map(item => `• ${item.name} — ${item.url}`).join('\n')}` : content, task_id: firstBridgeTaskId }),
        });
        if (!messageResponse.ok) throw new Error('Multi-role workflow đã tạo nhưng không ghi được chat feed');
        setText('');
        setAttachments([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setDeliveryState('delivered');
        setFeedback('');
        await load();
        window.setTimeout(() => setDeliveryState('idle'), 1400);
        return;
      }

      if (!target) throw new Error('Không có agent target khả dụng');
      const taskResponse = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: firstLine.length > 100 ? `${firstLine.slice(0, 97)}...` : firstLine,
          description: debateStudio
            ? `${content}${attachmentBlock}\n\n${DEBATE_MARKER}\nAI Studio đưa ra quan điểm mạnh nhất trước, nêu điểm chưa chắc và phản biện có thể có. Không sửa file, không build/test, không Publish. Trả kết quả dạng tóm tắt với artifacts: [].\nChatGPT nhận kết quả Studio, phản biện độc lập rồi trả lời cuối cùng cho người dùng bằng tiếng Việt.\n\n${BINDING_START}\n${JSON.stringify({ workspace_id: workspace.workspace_id, project_id: workspace.project_id, agent_instance_id: target.agent_instance_id })}\n${BINDING_END}`
            : fastChat
              ? `${content}${attachmentBlock}\n\n${CHAT_MARKER}\nĐây là Fast Chat, không phải coding workflow. Trả lời trực tiếp bằng tiếng Việt; không audit repo, không sửa file, không chạy build/test trừ khi yêu cầu gốc nói rõ phải thực hiện hành động.\n\n${BINDING_START}\n${JSON.stringify({ workspace_id: workspace.workspace_id, project_id: workspace.project_id, agent_instance_id: target.agent_instance_id })}\n${BINDING_END}`
              : `${content}${attachmentBlock}\n\n${BINDING_START}\n${JSON.stringify({ workspace_id: workspace.workspace_id, project_id: workspace.project_id, agent_instance_id: target.agent_instance_id })}\n${BINDING_END}`,
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
          content: uploaded.length ? `${content}\n\nAttachments:\n${uploaded.map(item => `• ${item.name} — ${item.url}`).join('\n')}` : content,
          task_id: taskData.id,
        }),
      });
      if (!messageResponse.ok) {
        const data = await messageResponse.json().catch(() => ({}));
        throw new Error(data.error || 'Task đã tạo nhưng không ghi được chat feed');
      }

      setText('');
      setAttachments([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setDeliveryState('delivered');
      setFeedback('');
      await load();
      window.setTimeout(() => setDeliveryState('idle'), 1400);
    } catch (error: any) {
      setDeliveryState('idle');
      setFeedback(`Lỗi: ${error?.message || 'không gửi được'}`);
    } finally {
      setBusy(false);
    }
  };

  const activeTasks = projectTasks.filter(task => !['completed', 'cancelled'].includes(task.status));
  const currentTask = [...activeTasks].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0] || null;

  return (
    <section className="flex min-h-[360px] flex-1 flex-col overflow-hidden bg-background/35">
      {currentTask && <div role="status" className="mx-auto flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />{currentTask.status === 'blocked' ? 'Agent đang gặp trở ngại' : 'Đang trả lời…'}
      </div>}

      <div ref={feedRef} className="thin-scrollbar flex-1 overflow-y-auto px-3 pb-2 sm:px-4">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 py-3">
          {!workspace ? (
            <div className="py-16 text-center text-[13px] text-muted-foreground">Choose a project to start.</div>
          ) : feed.length === 0 ? (
            <div className="py-16 text-center">
              <Sparkles className="mx-auto size-7 text-gpt/50" />
              <div className="mt-2 text-[13px] font-medium text-foreground">{workspace.project_name} is ready</div>
              <div className="mt-1 text-[11px] text-muted-foreground">Type below. Your instruction and agent responses will stay in this feed.</div>
            </div>
          ) : (
            feed.map(message => <MessageRow key={message.id} message={message} />)
          )}
        </div>
      </div>

      <div className="sticky bottom-0 shrink-0 border-t border-border bg-background/90 px-3 py-2.5 backdrop-blur sm:px-4">
        <div className="mx-auto max-w-4xl">
          {pickerOpen && (
            <div className="mb-2 flex animate-rise flex-wrap gap-1.5">
              <button onClick={() => { setTargetId('auto'); setPickerOpen(false); }} className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] ${targetId === 'auto' ? 'border-gpt/40 bg-gpt/10 text-gpt' : 'border-border bg-surface text-muted-foreground'}`}>
                {(workspace?.execution_target || 'studio') === 'pc' ? <MonitorCog className="size-3.5" /> : <Sparkles className="size-3.5" />} Auto
              </button>
              {targets.map(target => (
                <button key={target.target_id} onClick={() => { setTargetId(target.target_id); setPickerOpen(false); }} className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] ${targetId === target.target_id ? 'border-gpt/40 bg-gpt/10 text-gpt' : 'border-border bg-surface text-muted-foreground hover:text-foreground'}`}>
                  {target.provider === 'chatgpt' ? <Brain className="size-3.5" /> : <Boxes className="size-3.5" />}
                  {displayTarget(target)}<span title={target.connection_status} className={`size-1.5 rounded-full ${target.connection_status === 'offline' ? 'bg-muted-foreground' : 'bg-gpt'}`} />
                </button>
              ))}
            </div>
          )}

          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((file, index) => { const Icon = file.type.startsWith('image/') ? ImageIcon : file.type.startsWith('video/') ? Video : FileIcon; return (
                <span key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-[11px] text-muted-foreground">
                  <Icon className="size-3.5 shrink-0" /><span className="max-w-44 truncate">{file.name}</span><span>{Math.ceil(file.size / 1024)} KB</span>
                  <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setAttachments(items => items.filter((_, i) => i !== index))}><X className="size-3" /></button>
                </span>
              ); })}
            </div>
          )}
          <input ref={fileInputRef} type="file" multiple hidden accept="image/*,video/*,.pdf,.txt,.md,.json,.csv,.zip,.doc,.docx,.xls,.xlsx" onChange={event => {
            const files = Array.from(event.target.files ?? []) as File[];
            const invalid = files.find(file => file.size > MAX_ATTACHMENT_BYTES);
            if (invalid) { setFeedback(`Lỗi: ${invalid.name} vượt quá 25 MB`); event.target.value = ''; return; }
            setAttachments(current => { const combined = [...current, ...files]; if (combined.length > MAX_ATTACHMENTS) setFeedback(`Tối đa ${MAX_ATTACHMENTS} file mỗi tin nhắn`); return combined.slice(0, MAX_ATTACHMENTS); });
          }} />

          <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 shadow-panel focus-within:ring-2 focus-within:ring-ring/60">
            <button type="button" onClick={() => fileInputRef.current?.click()} aria-label="Attach image, video, or file" className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted-foreground transition-colors hover:text-foreground"><Paperclip className="size-4" /></button>
            <button onClick={() => setPickerOpen(value => !value)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-surface-2 px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground">
              {targetId === 'auto' ? ((workspace?.execution_target || 'studio') === 'pc' ? <MonitorCog className="size-3.5" /> : <Sparkles className="size-3.5" />) : chooseTarget()?.provider === 'chatgpt' ? <Brain className="size-3.5" /> : <Boxes className="size-3.5" />}
              <span className="hidden max-w-36 truncate sm:inline">{targetLabel()}</span>
              <ChevronDown className={`size-3 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
            </button>

            <textarea
              value={text}
              rows={3}
              onChange={event => setText(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder={workspace ? `Message ${workspace.project_name}...` : 'Choose a project first'}
              disabled={!workspace}
              className="max-h-40 min-h-20 flex-1 resize-y bg-transparent px-1 py-2 text-[14px] leading-snug text-foreground outline-none placeholder:text-muted-foreground/70 disabled:opacity-40"
            />

            <button onClick={send} disabled={(!text.trim() && attachments.length === 0) || busy || !workspace} aria-label="Send" className={`grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-all duration-200 hover:opacity-90 disabled:opacity-30 ${deliveryState === 'sending' ? 'scale-95' : ''}`}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
            </button>
          </div>

          <div className="flex h-5 items-center justify-between pt-1 text-[10.5px] text-muted-foreground">
            <span className={feedback.startsWith('Lỗi:') ? 'text-destructive' : ''}>{feedback}</span>
            <span>
              {deliveryState === 'sending' && <span className="animate-fade">Sending…</span>}
              {deliveryState === 'delivered' && <span className="animate-fade text-gpt">Delivered</span>}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
