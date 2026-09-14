import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Check,
  ChevronDown,
  CircleAlert,
  Code2,
  Copy,
  FolderPlus,
  GitBranch,
  Loader2,
  Menu,
  MoreHorizontal,
  MessageSquare,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Send,
  Sparkles,
  Square,
  Terminal,
  Pencil,
  Archive,
  Trash2,
  RotateCcw,
  UserRound,
  X,
} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Agent = { id: string; label: string; available: boolean; transport?: string; runtime_state?: 'ready'|'blocked'|'offline'; runtime_reason?: string };
type Workspace = { workspace_id: string; project_id: string; project_name: string; repository_url?: string; branch?: string; archived?: boolean; deleted_at?: string | null };
type Conversation = { id: string; agent_id: string; updated_at: string; title?: string | null; archived?: number };
type Message = { id: string; sequence: number; role: string; agent_id: string; content: string; created_at: string };
type Turn = { id: string; status: string; error_code?: string; error_message?: string };
type Feed = { conversation: Conversation; messages: Message[]; turns: Turn[]; has_more: boolean };
type Activity = { handoffs: { id: string; agent_id: string; user_content: string; result: string }[]; queue: { id: string; agent_id: string; status: string }[]; writer: { workspace_id: string; project_id: string; agent_id: string } | null };
type Account = { account_id: string; provider: string; label: string; profile_label: string; status: string; credential_storage: string; credentials_in_bridge: boolean };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Không thể kết nối Bridge');
  return data;
}

const post = (value: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });

function savedSelection(): { workspaceId?: string; agentId?: string; conversationId?: string; accountId?: string } {
  try { return JSON.parse(localStorage.getItem('bridge.chat.selection') || '{}') || {}; } catch { return {}; }
}

function agentName(agent: Agent | undefined, id: string) {
  return agent?.label || ({ chatgpt: 'ChatGPT Standard', gemini: 'Gemini 3.8 Flash', sonnet: 'Claude Sonnet 4.6', opus: 'Claude Opus 4.6', codex: 'Codex Sol', astra: 'Codex Astra' } as Record<string, string>)[id] || id;
}
function accountProviderForAgent(id: string) { return id === 'gemini' || id === 'sonnet' || id === 'opus' ? 'google' : 'openai'; }

function AgentIcon({ id, size = 16 }: { id: string; size?: number }) {
  if (id === 'codex' || id === 'astra') return <Code2 size={size} aria-hidden="true" />;
  if (id === 'gemini' || id === 'chatgpt') return <Sparkles size={size} aria-hidden="true" />;
  if (id === 'sonnet' || id === 'opus') return <Bot size={size} aria-hidden="true" />;
  return <Terminal size={size} aria-hidden="true" />;
}

function formatConversationDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString() ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
}

function MessageBubble({ message, agent, onCopy }: { message: Message; agent?: Agent; onCopy: (content: string) => void }) {
  const mine = message.role === 'human';
  return (
    <article className={`group flex gap-3 ${mine ? 'justify-end' : 'justify-start'}`}>
      {!mine && <div className="mt-1 grid size-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-400/25 to-sky-400/20 text-emerald-200 ring-1 ring-white/10"><AgentIcon id={message.agent_id} size={16} /></div>}
      <div className={`min-w-0 max-w-[min(760px,calc(100%-3rem))] ${mine ? 'items-end' : 'items-start'}`}>
        <div className={`mb-1 flex items-center gap-2 text-[11px] ${mine ? 'justify-end' : ''}`}>
          <span className="font-semibold text-slate-300">{mine ? 'Bạn' : agentName(agent, message.agent_id)}</span>
          <time className="text-slate-500" dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
          {!mine && <button type="button" aria-label="Sao chép tin nhắn" onClick={() => onCopy(message.content)} className="rounded-md p-1 text-slate-500 opacity-0 transition hover:bg-white/10 hover:text-slate-200 group-hover:opacity-100"><Copy size={13} /></button>}
        </div>
        {mine ? <div className="rounded-3xl rounded-tr-md bg-emerald-400 px-4 py-3 text-[14px] leading-7 text-slate-950 shadow-lg shadow-emerald-950/20"><div className="whitespace-pre-wrap break-words">{message.content}</div></div> : <div className="chat-markdown break-words text-[14px] leading-7 text-slate-200"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-emerald-300 underline underline-offset-4">{children}</a>, img: ({ alt, src }) => <a href={src} target="_blank" rel="noopener noreferrer" className="text-emerald-300 underline">{alt || 'Xem hình ảnh'}</a> }}>{message.content}</Markdown></div>}
      </div>
    </article>
  );
}

export function ConversationChat() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState(() => savedSelection().workspaceId || '');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState(() => savedSelection().agentId || 'codex');
  const [accountId, setAccountId] = useState(() => savedSelection().accountId || '');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState(() => savedSelection().conversationId || '');
  const [feed, setFeed] = useState<Feed | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountLabel, setAccountLabel] = useState('');
  const [accountProvider, setAccountProvider] = useState('openai');
  const [accountProfile, setAccountProfile] = useState('default');
  const [accountBusy, setAccountBusy] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [renamingConversation, setRenamingConversation] = useState<Conversation | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectRepo, setProjectRepo] = useState('');
  const [projectFolder, setProjectFolder] = useState('');
  const [projectBranch, setProjectBranch] = useState('main');
  const [creating, setCreating] = useState(false);
  const [activity, setActivity] = useState<Activity | null>(null);
  const drafts = useRef<Record<string, string>>({});
  const retry = useRef<{ key: string; body: object } | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const workspace = workspaces.find(item => item.workspace_id === workspaceId);
  const selectedAgent = agents.find(item => item.id === agentId);
  const activeTurns = feed?.turns.filter(turn => turn.status === 'pending' || turn.status === 'working') || [];
  const projectConversations = useMemo(() => [...conversations].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)), [conversations]);

  useEffect(() => {
    const controller = new AbortController();
    void api<{ workspaces: Workspace[] }>('/api/resource-registry', { signal: controller.signal }).then(data => {
      setWorkspaces(data.workspaces || []);
      setWorkspaceId(current => data.workspaces.some(item => item.workspace_id === current) ? current : data.workspaces[0]?.workspace_id || '');
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    const loadAgents = () => api<{ agents: Agent[] }>('/api/chat/agents', { signal: controller.signal }).then(data => {
      const next = data.agents || [];
      setAgents(next);
      setAgentId(current => next.some(item => item.id === current) ? current : next[0]?.id || 'codex');
    }).catch(() => {});
    void loadAgents();
    const timer = window.setInterval(loadAgents, 15000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);

  useEffect(() => { void api<{accounts: Account[]}>('/api/chat/accounts').then(data => { const next = data.accounts || []; setAccounts(next); setAccountId(current => current && next.some(item => item.account_id === current) ? current : ''); }).catch(() => {}); }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); startNewChat(); } if (event.key === 'Escape') { setMenuId(null); setProjectMenuOpen(false); setShowAccountDialog(false); setShowProjectDialog(false); setRenamingConversation(null); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    setConversations([]); retry.current = null; setFeed(null);
    if (!workspace) return;
    const controller = new AbortController();
    void api<Conversation[]>(`/api/chat/conversations?workspace_id=${encodeURIComponent(workspace.workspace_id)}&project_id=${encodeURIComponent(workspace.project_id)}`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      setConversations(data);
      setConversationId(current => data.some(item => item.id === current) ? current : data.find(item => item.agent_id === agentId)?.id || '');
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [workspaceId, workspace?.project_id, agentId]);

  useEffect(() => {
    setActivity(null);
    if (!workspace) return;
    const controller = new AbortController();
    const load = () => api<Activity>(`/api/chat/project-activity?workspace_id=${encodeURIComponent(workspace.workspace_id)}&project_id=${encodeURIComponent(workspace.project_id)}`, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setActivity(data); }).catch(() => {});
    void load();
    const timer = window.setInterval(load, 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [workspaceId, workspace?.project_id]);

  useEffect(() => { try { localStorage.setItem('bridge.chat.selection', JSON.stringify({ workspaceId, agentId, conversationId, accountId })); } catch {} }, [workspaceId, agentId, conversationId, accountId]);

  useEffect(() => {
    setFeed(null); setConnected(false);
    if (!conversationId) return;
    const controller = new AbortController(); let refreshing = false; let again = false;
    const refresh = async () => {
      if (refreshing) { again = true; return; }
      refreshing = true;
      try {
        do {
          again = false;
          const data = await api<Feed>(`/api/chat/conversations/${encodeURIComponent(conversationId)}`, { signal: controller.signal });
          if (!controller.signal.aborted) setFeed(current => {
            if (current?.conversation.id !== data.conversation.id || !data.messages.length) return data;
            const older = current.messages.filter(message => message.sequence < data.messages[0].sequence);
            return { ...data, messages: [...older, ...data.messages], has_more: older.length ? current.has_more : data.has_more };
          });
        } while (again && !controller.signal.aborted);
      } catch (err) { if (!controller.signal.aborted) setError((err as Error).message); }
      finally { refreshing = false; }
    };
    const stream = new EventSource(`/api/chat/events?conversation_id=${encodeURIComponent(conversationId)}`);
    stream.onopen = () => { setConnected(true); void refresh(); };
    stream.onerror = () => setConnected(false);
    for (const type of ['turn.accepted', 'turn.claimed', 'turn.completed', 'turn.failed', 'turn.cancelled']) stream.addEventListener(type, refresh);
    void refresh();
    return () => { controller.abort(); stream.close(); };
  }, [conversationId]);

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [feed?.messages.at(-1)?.id, activeTurns.length]);

  function switchWorkspace(nextId: string) {
    drafts.current[`${workspaceId}:${agentId}`] = draft;
    setDraft(drafts.current[`${nextId}:${agentId}`] || ''); setWorkspaceId(nextId); setConversationId(''); setFeed(null); setError(''); setSidebarOpen(false);
  }

  function switchAgent(nextId: string) {
    drafts.current[`${workspaceId}:${agentId}`] = draft;
    setDraft(drafts.current[`${workspaceId}:${nextId}`] || ''); setAgentId(nextId); setAccountId(''); setConversationId(conversations.find(item => item.agent_id === nextId)?.id || ''); setFeed(null); setError('');
  }

  function startNewChat() {
    drafts.current[`${workspaceId}:${agentId}`] = draft;
    setConversationId(''); setFeed(null); setDraft(''); setError(''); setNotice('');
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    if (creating || sending || !projectName.trim()) return;
    setCreating(true); setError('');
    try {
      const result = await api<{ workspace: Workspace }>('/api/chat/projects', post({ project_name: projectName.trim(), repository_url: projectRepo.trim(), branch: projectBranch.trim() || 'main', ...(projectFolder.trim() ? { local_path: `Apps/${projectFolder.trim()}` } : {}) }));
      setWorkspaces(list => [...list, result.workspace]); setWorkspaceId(result.workspace.workspace_id); setConversationId(''); setFeed(null); setShowProjectDialog(false); setProjectName(''); setProjectRepo(''); setProjectFolder(''); setProjectBranch('main'); setNotice(`Đã thêm project ${result.workspace.project_name}`);
    } catch (err) { setError((err as Error).message); }
    finally { setCreating(false); }
  }

  async function send() {
    if (!workspace || !draft.trim() || sending || creating) return;
    setSending(true); setError(''); setNotice('');
    const content = draft.trim();
    const key = JSON.stringify([workspaceId, agentId, conversationId, content]);
    if (retry.current?.key !== key) retry.current = { key, body: { workspace_id: workspaceId, project_id: workspace.project_id, agent_id: agentId, account_id: accountId || null, conversation_id: conversationId || null, client_message_id: crypto.randomUUID(), content } };
    try {
      const result = await api<{ conversation: Conversation }>('/api/chat/turns', post(retry.current.body));
      setConversationId(result.conversation.id); setDraft(''); retry.current = null; setConversations(previous => [result.conversation, ...previous.filter(item => item.id !== result.conversation.id)]);
    } catch (err) { setError((err as Error).message); }
    finally { setSending(false); }
  }

  async function cancel(turnId: string) {
    try { await api(`/api/chat/turns/${encodeURIComponent(turnId)}/cancel`, post({})); } catch (err) { setError((err as Error).message); }
  }

  async function conversationAction(item: Conversation, action: 'archive' | 'restore' | 'delete') {
    setMenuId(null); setError('');
    try { const result = await api<{conversation: Conversation}>(`/api/chat/conversations/${encodeURIComponent(item.id)}/${action}`, post({})); setConversations(list => action === 'delete' ? list.filter(row => row.id !== item.id) : list.map(row => row.id === item.id ? result.conversation : row)); if (conversationId === item.id && action === 'delete') { setConversationId(''); setFeed(null); } setNotice(action === 'delete' ? 'Đã xóa cuộc trò chuyện (mã nguồn vẫn giữ nguyên).' : action === 'archive' ? 'Đã lưu trữ cuộc trò chuyện.' : 'Đã khôi phục cuộc trò chuyện.'); } catch (err) { setError((err as Error).message); }
  }
  async function renameChat(event: FormEvent) { event.preventDefault(); if (!renamingConversation || !renameValue.trim()) return; try { const result = await api<{conversation: Conversation}>(`/api/chat/conversations/${encodeURIComponent(renamingConversation.id)}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({title: renameValue.trim()}) }); setConversations(list => list.map(row => row.id === result.conversation.id ? result.conversation : row)); setRenamingConversation(null); setNotice('Đã đổi tên cuộc trò chuyện.'); } catch (err) { setError((err as Error).message); } }
  async function projectAction(action: 'archive' | 'restore' | 'delete') { if (!workspace) return; setProjectMenuOpen(false); try { await api(`/api/chat/projects/${encodeURIComponent(workspace.workspace_id)}/${action}`, post({})); if (action === 'delete') { setWorkspaces(list => list.filter(item => item.workspace_id !== workspace.workspace_id)); setWorkspaceId(''); setConversationId(''); setFeed(null); } else setWorkspaces(list => list.map(item => item.workspace_id === workspace.workspace_id ? {...item, archived: action === 'archive'} : item)); setNotice(action === 'delete' ? 'Đã xóa project khỏi Bridge; thư mục code được giữ lại.' : action === 'archive' ? 'Đã lưu trữ project.' : 'Đã khôi phục project.'); } catch (err) { setError((err as Error).message); } }
  async function renameProject() { if (!workspace) return; const next = window.prompt('Tên project mới', workspace.project_name)?.trim(); if (!next || next === workspace.project_name) return; setProjectMenuOpen(false); try { const result = await api<{workspace: Workspace}>(`/api/chat/projects/${encodeURIComponent(workspace.workspace_id)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({project_name: next})}); setWorkspaces(list => list.map(item => item.workspace_id === result.workspace.workspace_id ? {...item, project_name: result.workspace.project_name} : item)); setNotice('Đã đổi tên project.'); } catch (err) { setError((err as Error).message); } }
  async function addAccount(event: FormEvent) { event.preventDefault(); if (!accountLabel.trim() || accountBusy) return; setAccountBusy(true); try { const result = await api<{account: Account}>('/api/chat/accounts', post({provider: accountProvider, label: accountLabel.trim(), profile_label: accountProfile.trim() || 'default'})); setAccounts(list => [...list, result.account]); setAccountLabel(''); setAccountProfile('default'); setNotice('Đã thêm nhãn tài khoản. Hãy đăng nhập CLI chính thức trên PC để xác thực.'); } catch (err) { setError((err as Error).message); } finally { setAccountBusy(false); } }

  async function older() {
    if (!feed?.messages.length) return;
    try {
      const page = await api<Feed>(`/api/chat/conversations/${encodeURIComponent(conversationId)}?before=${feed.messages[0].sequence}`);
      setFeed(current => current?.conversation.id === conversationId ? { ...current, messages: [...page.messages, ...current.messages], has_more: page.has_more } : current);
    } catch (err) { setError((err as Error).message); }
  }

  function copyMessage(content: string) {
    void navigator.clipboard.writeText(content).then(() => setNotice('Đã sao chép tin nhắn')).catch(() => setError('Không thể sao chép tin nhắn'));
  }

  const statusText = activeTurns.length ? (activeTurns.some(turn => turn.status === 'working') ? 'Đang xử lý' : 'Đang xếp hàng') : selectedAgent?.runtime_state === 'blocked' ? 'Agent bị chặn' : selectedAgent?.runtime_state === 'offline' ? 'Runner offline / cần login PC' : connected ? 'Đã kết nối' : 'Sẵn sàng';
  const agentBlocked = selectedAgent?.runtime_state === 'blocked';
  const agentUnavailable = Boolean(selectedAgent && !selectedAgent.available);
  const hasActivity = Boolean(activity && (activity.writer || activity.queue.length || activity.handoffs.length));

  return (
    <main className="flex h-dvh min-h-0 overflow-hidden bg-[#111714] text-slate-100">
      {sidebarOpen && <button type="button" aria-label="Đóng thanh bên" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-30 bg-black/50 lg:hidden" />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[286px] shrink-0 flex-col border-r border-white/[0.08] bg-[#0d120f] transition-transform duration-200 lg:static ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-14 items-center gap-2 border-b border-white/[0.07] px-3"><div className="grid size-8 place-items-center rounded-xl bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-950/30"><MessageSquare size={17} /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold tracking-wide">Bridge</p><p className="truncate text-[10px] text-slate-500">Agent workspace</p></div><button type="button" aria-label="Đóng thanh bên" onClick={() => setSidebarOpen(false)} className="hidden rounded-lg p-2 text-slate-500 hover:bg-white/10 hover:text-slate-200 lg:block"><PanelLeftClose size={16} /></button></div>
        <div className="p-3"><button type="button" onClick={startNewChat} disabled={sending} className="flex h-10 w-full items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.04] px-3 text-left text-[13px] font-medium transition hover:bg-white/[0.09] disabled:opacity-50"><MessageSquarePlus size={16} className="text-emerald-300" /> Cuộc trò chuyện mới <span className="ml-auto text-[10px] text-slate-600">Ctrl K</span></button></div>
        <div className="px-3 pb-3"><div className="mb-2 flex items-center justify-between px-1"><span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Project</span><div className="flex items-center gap-1"><button type="button" aria-label="Thêm project" onClick={() => setShowProjectDialog(true)} className="rounded-md p-1 text-slate-500 hover:bg-white/10 hover:text-emerald-300"><FolderPlus size={15} /></button>{workspace && <div className="relative"><button type="button" aria-label="Tùy chọn project" onClick={() => setProjectMenuOpen(value => !value)} className="rounded-md p-1 text-slate-500 hover:bg-white/10 hover:text-slate-200"><MoreHorizontal size={15} /></button>{projectMenuOpen && <div className="absolute right-0 top-7 z-50 w-44 rounded-xl border border-white/10 bg-[#18211b] p-1 shadow-2xl"><button type="button" onClick={renameProject} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-slate-300 hover:bg-white/10"><Pencil size={13}/> Đổi tên</button><button type="button" onClick={() => void projectAction(workspace.archived ? 'restore' : 'archive')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-slate-300 hover:bg-white/10">{workspace.archived ? <RotateCcw size={13}/> : <Archive size={13}/>} {workspace.archived ? 'Khôi phục' : 'Lưu trữ'}</button><button type="button" onClick={() => void projectAction('delete')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-rose-300 hover:bg-rose-400/10"><Trash2 size={13}/> Xóa project</button></div>}</div>}</div></div><div className="relative"><select aria-label="Chọn project" disabled={sending} value={workspaceId} onChange={event => switchWorkspace(event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-white/[0.1] bg-[#151d18] px-3 pr-9 text-[13px] font-medium outline-none transition focus:border-emerald-400/60">{workspaces.length === 0 && <option value="">Chưa có project</option>}{workspaces.map(item => <option key={item.workspace_id} value={item.workspace_id}>{item.project_name}{item.archived ? ' · đã lưu trữ' : ''}</option>)}</select><ChevronDown size={15} className="pointer-events-none absolute right-3 top-3.5 text-slate-500" /></div>{workspace && <div className="mt-2 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[11px] text-slate-500"><p className="truncate text-slate-300">{workspace.project_name}</p><p className="mt-1 flex items-center gap-1 truncate"><GitBranch size={11} /> {workspace.branch || 'main'} {workspace.repository_url ? '· GitHub' : '· local'}</p></div>}</div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 [scrollbar-width:thin] [scrollbar-color:#26352b_transparent]"><div className="mb-2 flex items-center gap-2 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500"><MessageSquare size={12} /> Lịch sử</div>{projectConversations.length === 0 && <p className="px-2 py-4 text-[12px] leading-5 text-slate-600">Chưa có cuộc trò chuyện trong project này.</p>}<div className="space-y-0.5">{projectConversations.map(item => { const agent = agents.find(candidate => candidate.id === item.agent_id); const active = item.id === conversationId; return <div key={item.id} className={`group relative flex items-center gap-2 rounded-lg px-2.5 py-2.5 text-left transition ${active ? 'bg-white/[0.1] text-slate-100' : 'text-slate-400 hover:bg-white/[0.055] hover:text-slate-200'}`}><button type="button" onClick={() => { setAgentId(item.agent_id); setConversationId(item.id); setFeed(null); setSidebarOpen(false); }} className="flex min-w-0 flex-1 items-center gap-2 text-left"><span className={`grid size-6 shrink-0 place-items-center rounded-md ${active ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/[0.05] text-slate-500'}`}><AgentIcon id={item.agent_id} size={13} /></span><span className="min-w-0 flex-1"><span className="block truncate text-[12px]">{item.title || `${agentName(agent, item.agent_id)} · ${item.id.slice(-6)}`}</span><span className="mt-0.5 block text-[10px] text-slate-600">{formatConversationDate(item.updated_at)}{item.archived ? ' · lưu trữ' : ''}</span></span></button><button type="button" aria-label="Tùy chọn cuộc trò chuyện" onClick={() => setMenuId(menuId === item.id ? null : item.id)} className="rounded-md p-1 text-slate-500 opacity-0 transition hover:bg-white/10 hover:text-slate-200 group-hover:opacity-100"><MoreHorizontal size={14}/></button>{menuId === item.id && <div className="absolute right-1 top-10 z-50 w-40 rounded-xl border border-white/10 bg-[#18211b] p-1 shadow-2xl"><button type="button" onClick={() => { setMenuId(null); setRenamingConversation(item); setRenameValue(item.title || ''); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-slate-300 hover:bg-white/10"><Pencil size={13}/> Đổi tên</button><button type="button" onClick={() => void conversationAction(item, item.archived ? 'restore' : 'archive')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-slate-300 hover:bg-white/10">{item.archived ? <RotateCcw size={13}/> : <Archive size={13}/>} {item.archived ? 'Khôi phục' : 'Lưu trữ'}</button><button type="button" onClick={() => void conversationAction(item, 'delete')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-rose-300 hover:bg-rose-400/10"><Trash2 size={13}/> Xóa</button></div>}</div>; })}</div></div>
        <div className="border-t border-white/[0.07] p-3"><button type="button" onClick={() => setShowAccountDialog(true)} className="mb-2 flex w-full items-center gap-2 rounded-xl bg-white/[0.035] px-3 py-2 text-left text-[11px] text-slate-400 hover:bg-white/[0.08]"><UserRound size={14} className="text-emerald-300"/><span className="min-w-0 flex-1"><span className="block text-slate-300">Tài khoản native</span><span className="block truncate text-[10px] text-slate-600">{accounts.filter(item => item.status === 'active').length} đã xác thực · {accounts.length} hồ sơ</span></span></button><div className="flex items-center gap-2 rounded-xl bg-white/[0.035] px-3 py-2.5"><span className={`size-2 rounded-full ${activeTurns.length ? 'bg-amber-300' : connected ? 'bg-emerald-300' : 'bg-slate-600'}`} /><div className="min-w-0"><p className="text-[11px] font-medium text-slate-300">{statusText}</p><p className="truncate text-[10px] text-slate-600">{selectedAgent?.label || 'Bridge runner'}</p></div></div></div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.08] bg-[#111714]/95 px-3 backdrop-blur-xl sm:px-5"><button type="button" aria-label="Mở thanh bên" onClick={() => setSidebarOpen(value => !value)} className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.08] hover:text-slate-100 lg:hidden">{sidebarOpen ? <PanelLeftClose size={18} /> : <Menu size={18} />}</button><button type="button" aria-label="Mở thanh bên" onClick={() => setSidebarOpen(true)} className="hidden rounded-lg p-2 text-slate-400 hover:bg-white/[0.08] hover:text-slate-100 lg:block">{sidebarOpen ? <PanelLeftOpen size={18} className="opacity-0" /> : <PanelLeftOpen size={18} />}</button><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold text-slate-100">{workspace?.project_name || 'Bridge'}</p><p className="truncate text-[11px] text-slate-500">{workspace?.repository_url || 'Chọn project để bắt đầu'}</p></div><div className="hidden items-center gap-2 sm:flex"><span className={`size-2 rounded-full ${selectedAgent?.available ? 'bg-emerald-300' : 'bg-slate-600'}`} /><span className="max-w-40 truncate text-[11px] text-slate-400">{selectedAgent?.label || 'Agent'}</span></div><button type="button" onClick={startNewChat} disabled={sending} className="grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-white/[0.08] hover:text-slate-100" title="Cuộc trò chuyện mới"><Plus size={18} /></button></header>
        {hasActivity && activity && <div className="flex shrink-0 items-center gap-2 border-b border-amber-300/15 bg-amber-300/[0.05] px-4 py-2 text-[11px] text-amber-100 sm:px-8"><CircleAlert size={14} className="shrink-0 text-amber-300" /><span className="truncate">{activity.writer ? `${agentName(agents.find(item => item.id === activity.writer?.agent_id), activity.writer.agent_id)} đang làm việc.` : activity.queue.length ? `${activity.queue.length} lượt đang xếp hàng.` : 'Có bàn giao mới trong project.'}</span>{activity.queue.map(item => <button type="button" key={item.id} onClick={() => void cancel(item.id)} className="ml-auto shrink-0 underline underline-offset-2">Hủy</button>)}<details className="shrink-0"><summary className="cursor-pointer text-amber-300">Chi tiết</summary><div className="absolute right-4 z-20 mt-2 w-80 rounded-xl border border-white/10 bg-[#18211b] p-3 text-slate-300 shadow-2xl"><p>{activity.writer ? `Đang chạy: ${agentName(agents.find(item => item.id === activity.writer?.agent_id), activity.writer.agent_id)}` : 'Runner đang chờ lượt tiếp theo.'}</p>{activity.handoffs.length > 0 && <p className="mt-2 text-slate-400">Đã nhận {activity.handoffs.length} bản bàn giao.</p>}</div></details></div>}
        <section aria-label="Tin nhắn" className="min-h-0 flex-1 overflow-y-auto px-4 py-6 [scrollbar-width:thin] [scrollbar-color:#2b3b30_transparent] sm:px-8"><div className="mx-auto flex min-h-full max-w-3xl flex-col justify-end gap-7 pb-4">{!conversationId && <div className="mb-auto flex flex-col items-center justify-center py-20 text-center"><div className="mb-5 grid size-14 place-items-center rounded-2xl bg-emerald-400 text-slate-950 shadow-xl shadow-emerald-950/30"><MessageSquare size={26} /></div><h1 className="text-2xl font-semibold tracking-tight text-slate-100">Bạn muốn làm gì hôm nay?</h1><p className="mt-2 max-w-md text-[13px] leading-6 text-slate-500">Chọn agent ở dưới, mô tả việc cần làm và Bridge sẽ gửi đúng project đang chọn.</p><div className="mt-6 flex flex-wrap justify-center gap-2 text-[11px] text-slate-500"><span className="rounded-full border border-white/[0.09] px-3 py-1.5">Project: {workspace?.project_name || 'chưa chọn'}</span><span className="rounded-full border border-white/[0.09] px-3 py-1.5">Agent: {selectedAgent?.label || 'chưa chọn'}</span></div></div>}{feed?.has_more && <button type="button" onClick={() => void older()} className="mx-auto rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-slate-400 hover:bg-white/[0.06]">Xem tin nhắn trước</button>}{feed?.messages.map(message => <MessageBubble key={message.id} message={message} agent={agents.find(item => item.id === message.agent_id)} onCopy={copyMessage} />)}{activeTurns.map(turn => <div key={turn.id} className="flex items-center gap-3 text-[13px] text-slate-400"><div className="grid size-8 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300"><Loader2 size={16} className="animate-spin" /></div><span>{turn.status === 'pending' ? 'Đang chờ agent…' : 'Agent đang xử lý…'}</span><button type="button" aria-label="Dừng trả lời" onClick={() => void cancel(turn.id)} className="ml-1 rounded-lg border border-white/10 p-1.5 text-slate-500 hover:text-slate-100"><Square size={13} /></button></div>)}{feed?.turns.filter(turn => turn.status === 'failed' || turn.status === 'cancelled').map(turn => <p key={turn.id} className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2 text-[12px] text-rose-200">{turn.status === 'cancelled' ? 'Đã dừng yêu cầu.' : turn.error_message || 'Agent chưa hoàn thành yêu cầu.'}</p>)}<div ref={end} /></div></section>
        <footer className="shrink-0 px-3 pb-3 sm:px-8 sm:pb-5"><div className="mx-auto max-w-3xl">{error && <p role="alert" className="mb-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2 text-[12px] text-rose-200">{error}</p>}{agentBlocked && <p role="alert" className="mb-2 rounded-lg border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-[12px] text-amber-100">{selectedAgent?.runtime_reason || 'Runner đã chặn agent sau lỗi native.'} Cập nhật runner/quyền trên PC rồi khởi động lại.</p>}{agentUnavailable && !agentBlocked && <p role="status" className="mb-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-slate-400">{selectedAgent?.transport === 'cli' ? 'Agent native chỉ chạy khi CLI đã đăng nhập trên PC và runner đang online.' : 'ChatGPT Standard chưa kết nối. Trên PC, mở Bridge và ChatGPT trong cùng profile Chrome/Edge, đăng nhập rồi bật Bridge Wake 2.1.0. Trình duyệt trong Codex không chạy extension này.'}</p>}{notice && !error && !agentBlocked && <p role="status" className="mb-2 text-center text-[11px] text-emerald-300">{notice}</p>}<form onSubmit={event => { event.preventDefault(); void send(); }} className="rounded-3xl border border-white/[0.14] bg-[#18211b] p-2 shadow-2xl shadow-black/20 transition focus-within:border-emerald-400/50 focus-within:shadow-emerald-950/20"><textarea aria-label="Tin nhắn" placeholder={workspace ? `Nhắn ${selectedAgent?.label || 'agent'} trong ${workspace.project_name}…` : 'Chọn project để bắt đầu…'} value={draft} maxLength={100000} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} rows={2} className="max-h-48 min-h-12 w-full resize-none bg-transparent px-3 py-2 text-[14px] leading-6 text-slate-100 outline-none placeholder:text-slate-600" /><div className="flex items-center justify-between gap-2 px-1 pb-1"><div className="relative flex min-w-0 items-center gap-1.5"><select aria-label="Chọn agent" disabled={sending || creating} value={agentId} onChange={event => switchAgent(event.target.value)} className="max-w-[220px] appearance-none rounded-xl border border-white/[0.08] bg-white/[0.04] py-2 pl-2.5 pr-7 text-[11px] font-medium text-slate-300 outline-none hover:bg-white/[0.08]"><option value="" disabled>Chọn agent</option>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.label}{agent.available ? '' : ' · offline'}</option>)}</select><ChevronDown size={13} className="pointer-events-none absolute right-2 text-slate-500" />{selectedAgent?.transport !== 'browser' && accounts.some(account => account.provider === accountProviderForAgent(agentId)) && <select aria-label="Chọn tài khoản" disabled={sending || creating} value={accountId} onChange={event => setAccountId(event.target.value)} className="max-w-[170px] rounded-xl border border-white/[0.08] bg-white/[0.04] px-2 py-2 text-[11px] text-slate-300 outline-none"><option value="">Tài khoản mặc định</option>{accounts.filter(account => account.provider === accountProviderForAgent(agentId)).map(account => <option key={account.account_id} value={account.account_id}>{account.label}{account.status === "active" ? "" : " · cần login"}</option>)}</select>}<span className="hidden text-[10px] text-slate-600 sm:inline">Enter gửi · Shift + Enter xuống dòng</span></div><button type="submit" aria-label="Gửi tin nhắn" disabled={sending || creating || !workspace || !draft.trim() || agentUnavailable} className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-400 text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-35">{sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}</button></div></form><p className="mt-2 text-center text-[10px] text-slate-600">ChatGPT Standard dùng tài khoản ChatGPT trong profile trình duyệt chạy Bridge Wake. Các model native dùng CLI trên PC.</p></div></footer>
      </section>
      {showProjectDialog && <div role="dialog" aria-modal="true" aria-labelledby="project-dialog-title" className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"><form onSubmit={event => void createProject(event)} className="w-full max-w-lg rounded-2xl border border-white/[0.12] bg-[#18211b] p-5 shadow-2xl"><div className="mb-5 flex items-start justify-between gap-3"><div><h2 id="project-dialog-title" className="text-lg font-semibold">Thêm project</h2><p className="mt-1 text-[12px] leading-5 text-slate-500">Bridge sẽ giữ project riêng và không tự ghi đè code đang có.</p></div><button type="button" aria-label="Đóng" onClick={() => setShowProjectDialog(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-slate-100"><X size={18} /></button></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-[12px] text-slate-400 sm:col-span-2">Tên project<input required maxLength={100} value={projectName} onChange={event => setProjectName(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-white/[0.12] bg-[#101611] px-3 text-[13px] text-slate-100 outline-none focus:border-emerald-400/60" /></label><label className="text-[12px] text-slate-400 sm:col-span-2">Repo GitHub <span className="text-slate-600">(không bắt buộc)</span><input type="url" placeholder="https://github.com/ban/project" value={projectRepo} onChange={event => setProjectRepo(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-white/[0.12] bg-[#101611] px-3 text-[13px] text-slate-100 outline-none focus:border-emerald-400/60" /></label><label className="text-[12px] text-slate-400">Thư mục trong Apps<input placeholder="Để trống = tên project" value={projectFolder} onChange={event => setProjectFolder(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-white/[0.12] bg-[#101611] px-3 text-[13px] text-slate-100 outline-none focus:border-emerald-400/60" /></label><label className="text-[12px] text-slate-400">Nhánh<input value={projectBranch} onChange={event => setProjectBranch(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-white/[0.12] bg-[#101611] px-3 text-[13px] text-slate-100 outline-none focus:border-emerald-400/60" /></label></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setShowProjectDialog(false)} className="rounded-xl px-4 py-2 text-[13px] text-slate-400 hover:bg-white/[0.06]">Hủy</button><button type="submit" disabled={creating || sending || !projectName.trim()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2 text-[13px] font-semibold text-slate-950 disabled:opacity-40">{creating && <Loader2 size={14} className="animate-spin" />}{creating ? 'Đang thêm…' : 'Thêm project'}</button></div></form></div>}
      {renamingConversation && <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"><form onSubmit={renameChat} className="w-full max-w-sm rounded-2xl border border-white/[0.12] bg-[#18211b] p-5 shadow-2xl"><h2 className="text-lg font-semibold">Đổi tên cuộc trò chuyện</h2><input autoFocus required maxLength={120} value={renameValue} onChange={event => setRenameValue(event.target.value)} className="mt-4 h-10 w-full rounded-xl border border-white/[0.12] bg-[#101611] px-3 text-[13px] text-slate-100 outline-none focus:border-emerald-400/60" /><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setRenamingConversation(null)} className="rounded-xl px-4 py-2 text-[13px] text-slate-400 hover:bg-white/[0.06]">Hủy</button><button type="submit" className="rounded-xl bg-emerald-400 px-4 py-2 text-[13px] font-semibold text-slate-950">Lưu</button></div></form></div>}
      {showAccountDialog && <div role="dialog" aria-modal="true" aria-labelledby="account-dialog-title" className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"><div className="w-full max-w-lg rounded-2xl border border-white/[0.12] bg-[#18211b] p-5 shadow-2xl"><div className="mb-4 flex items-start justify-between"><div><h2 id="account-dialog-title" className="text-lg font-semibold">Tài khoản native</h2><p className="mt-1 text-[12px] leading-5 text-slate-500">Bridge chỉ lưu nhãn. Login vẫn ở terminal của PC; không có login provider trực tiếp trong web.</p></div><button type="button" aria-label="Đóng" onClick={() => setShowAccountDialog(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/10"><X size={18}/></button></div><div className="mb-4 space-y-2">{accounts.length === 0 && <p className="rounded-xl border border-white/10 px-3 py-3 text-[12px] text-slate-500">Chưa có tài khoản metadata.</p>}{accounts.map(account => <div key={account.account_id} className="flex items-center gap-3 rounded-xl border border-white/[0.08] px-3 py-2.5"><UserRound size={15} className="text-emerald-300"/><div className="min-w-0 flex-1"><p className="truncate text-[12px] text-slate-200">{account.label}</p><p className="truncate text-[10px] text-slate-500">{account.provider} · nhãn profile {account.profile_label} · {account.status === 'active' ? 'metadata active' : 'chưa xác minh'}</p></div><button type="button" aria-label="Xóa tài khoản" onClick={() => void api(`/api/chat/accounts/${account.account_id}`, {method:'DELETE'}).then(() => setAccounts(list => list.filter(row => row.account_id !== account.account_id))).catch(err => setError(err.message))} className="rounded-md p-1 text-slate-500 hover:text-rose-300"><Trash2 size={14}/></button></div>)}</div><div className="mb-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] px-3 py-3 text-[11px] leading-5 text-amber-100"><p className="font-semibold">Lệnh login trên PC</p><p className="mt-1"><b>Antigravity / Gemini / Claude:</b> mở terminal bằng tài khoản BridgeAgent và chạy <code>agy</code>, hoàn tất Google login một lần.</p><p className="mt-1"><b>Codex Sol / Astra:</b> chạy <code>codex login</code>, hoàn tất device login trong browser rồi quay lại terminal.</p><p className="mt-1 text-slate-400">Claude Sonnet/Opus trong Bridge dùng Antigravity model slug, nên dùng cùng login Google của <code>agy</code>, không có Claude web login riêng. Đổi profile label trên UI chỉ là ghi nhớ; runner hiện dùng profile native mặc định trên PC và cần khởi động lại sau khi đổi.</p></div><form onSubmit={addAccount} className="grid gap-2 sm:grid-cols-[1fr_1fr]"><input required maxLength={120} placeholder="Nhãn (ví dụ: Công việc)" value={accountLabel} onChange={event => setAccountLabel(event.target.value)} className="h-10 rounded-xl border border-white/[0.12] bg-[#101611] px-3 text-[12px] text-slate-100 outline-none"/><input maxLength={120} placeholder="Tên profile CLI" value={accountProfile} onChange={event => setAccountProfile(event.target.value)} className="h-10 rounded-xl border border-white/[0.12] bg-[#101611] px-3 text-[12px] text-slate-100 outline-none"/><select value={accountProvider} onChange={event => setAccountProvider(event.target.value)} className="h-10 rounded-xl border border-white/[0.12] bg-[#101611] px-3 py-2 text-[11px] text-slate-100 outline-none"><option value="openai">Codex / OpenAI</option><option value="google">Antigravity / Google</option><option value="anthropic">Claude (không dùng trong route AGY)</option></select><button type="submit" disabled={accountBusy || !accountLabel.trim()} className="h-10 rounded-xl bg-emerald-400 text-[12px] font-semibold text-slate-950 disabled:opacity-40">{accountBusy ? 'Đang thêm…' : 'Thêm nhãn profile'}</button></form></div></div>}
    </main>
  );
}
