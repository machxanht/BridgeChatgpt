import { useEffect, useRef, useState } from 'react';
import { Bot, Sparkles, Terminal, Send, Plus, Square, Copy } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Agent = { id: string; label: string; available: boolean };
type Workspace = { workspace_id: string; project_id: string; project_name: string };
type Conversation = { id: string; agent_id: string; updated_at: string };
type Message = { id: string; sequence: number; role: string; agent_id: string; content: string; created_at: string };
type Turn = { id: string; status: string; error_code?: string;error_message?:string };
type Feed = { conversation: Conversation; messages: Message[]; turns: Turn[]; has_more: boolean };
type Activity = {handoffs:{id:string;agent_id:string;user_content:string;result:string}[];queue:{id:string;agent_id:string;status:string}[];writer:{workspace_id:string;project_id:string;agent_id:string}|null};
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Không thể kết nối Bridge');
  return data;
}
const post = (value: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
function savedSelection(): { workspaceId?: string; agentId?: string; conversationId?: string } {
  try { return JSON.parse(localStorage.getItem('bridge.chat.selection') || '{}') || {}; } catch { return {}; }
}
function AgentIcon({ id }: { id: string }) { const Icon = id === 'codex' || id === 'astra' ? Terminal : id === 'gemini' || id === 'chatgpt' ? Sparkles : Bot; return <Icon size={18} aria-hidden="true" />; }

export function ConversationChat() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState(() => savedSelection().workspaceId || '');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState(() => savedSelection().agentId || 'codex');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState(() => savedSelection().conversationId || '');
  const [feed, setFeed] = useState<Feed | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [showProject,setShowProject]=useState(false),[projectName,setProjectName]=useState(''),[projectRepo,setProjectRepo]=useState(''),[projectFolder,setProjectFolder]=useState(''),[projectBranch,setProjectBranch]=useState('main'),[creating,setCreating]=useState(false);
  const [activity,setActivity]=useState<Activity|null>(null);
  const drafts=useRef<Record<string,string>>({});
  const retry = useRef<{ key: string; body: object; content: string } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const workspace = workspaces.find(w => w.workspace_id === workspaceId);
  const selected = agents.find(a => a.id === agentId);
  const active = feed?.turns.filter(t => t.status === 'pending' || t.status === 'working') || [];

  useEffect(() => {
    const controller = new AbortController();
    void api<{ workspaces: Workspace[] }>('/api/resource-registry', { signal: controller.signal }).then(data => {
      setWorkspaces(data.workspaces);
      setWorkspaceId(current => data.workspaces.some(w => w.workspace_id === current) ? current : data.workspaces[0]?.workspace_id || '');
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    const loadAgents = () => api<{ agents: Agent[] }>('/api/chat/agents', { signal: controller.signal }).then(data => setAgents(data.agents)).catch(() => {});
    void loadAgents(); const timer = setInterval(loadAgents, 15000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);
  useEffect(() => {
    setConversations([]); retry.current = null;
    if (!workspace) return;
    const controller = new AbortController();
    void api<Conversation[]>(`/api/chat/conversations?workspace_id=${encodeURIComponent(workspace.workspace_id)}&project_id=${encodeURIComponent(workspace.project_id)}`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      setConversations(data);
      setConversationId(current => data.some(c => c.id === current && c.agent_id === agentId) ? current : data.find(c=>c.agent_id===agentId)?.id||'');
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [workspaceId, workspace?.project_id,agentId]);
  useEffect(()=>{
    setActivity(null);if(!workspace)return;
    const controller=new AbortController();
    const load=()=>api<Activity>(`/api/chat/project-activity?workspace_id=${encodeURIComponent(workspace.workspace_id)}&project_id=${encodeURIComponent(workspace.project_id)}`,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setActivity(data);}).catch(()=>{});
    void load();const timer=setInterval(load,5000);return()=>{controller.abort();clearInterval(timer);};
  },[workspaceId,workspace?.project_id]);
  function switchSelection(wid:string,aid:string){
    drafts.current[workspaceId+':'+agentId]=draft;setDraft(drafts.current[wid+':'+aid]||'');
    setWorkspaceId(wid);setAgentId(aid);setConversationId(wid===workspaceId?conversations.find(c=>c.agent_id===aid)?.id||'':'');setFeed(null);setError('');retry.current=null;
  }
  async function createProject(){
    if(creating||sending||!projectName.trim())return;setCreating(true);setError('');
    try{
      const result=await api<{workspace:Workspace}>('/api/chat/projects',post({project_name:projectName.trim(),repository_url:projectRepo.trim(),branch:projectBranch.trim()||'main',...(projectFolder.trim()?{local_path:'Apps/'+projectFolder.trim()}:{} )}));
      setWorkspaces(list=>[...list,result.workspace]);switchSelection(result.workspace.workspace_id,agentId);setShowProject(false);setProjectName('');setProjectRepo('');setProjectFolder('');
    }catch(err){setError((err as Error).message);}finally{setCreating(false);}
  }
  useEffect(() => { try { localStorage.setItem('bridge.chat.selection', JSON.stringify({ workspaceId, agentId, conversationId })); } catch {} }, [workspaceId, agentId, conversationId]);
  useEffect(() => {
    setFeed(null); setConnected(false);
    if (!conversationId) return;
    const controller = new AbortController(); let refreshing = false, again = false;
    const refresh = async () => {
      if (refreshing) { again = true; return; }
      refreshing = true;
      try {
        do {
          again = false;
          const data = await api<Feed>(`/api/chat/conversations/${encodeURIComponent(conversationId)}`, { signal: controller.signal });
          if (!controller.signal.aborted) setFeed(current => {
            if (current?.conversation.id !== data.conversation.id || !data.messages.length) return data;
            const older = current.messages.filter(m => m.sequence < data.messages[0].sequence);
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
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [feed?.messages.at(-1)?.id, active.length]);

  async function send() {
    if (!workspace || !draft.trim() || sending || creating) return;
    setSending(true); setError('');
    const content = draft.trim();
    const key = JSON.stringify([workspaceId, agentId, conversationId, content]);
    if (retry.current?.key !== key) retry.current = { key, content, body: { workspace_id: workspaceId, project_id: workspace.project_id, agent_id: agentId, conversation_id: conversationId || null, client_message_id: crypto.randomUUID(), content } };
    try {
      const result = await api<{ conversation: Conversation }>('/api/chat/turns', post(retry.current.body));
      setConversationId(result.conversation.id); setDraft(''); retry.current = null;
      setConversations(previous => [result.conversation, ...previous.filter(c => c.id !== result.conversation.id)]);
    } catch (err) { setError((err as Error).message); }
    finally { setSending(false); }
  }
  async function cancel(turnId: string) {
    try { await api(`/api/chat/turns/${encodeURIComponent(turnId)}/cancel`, post({})); } catch (err) { setError((err as Error).message); }
  }
  async function older() {
    if (!feed?.messages.length) return;
    const id = conversationId;
    try {
      const page = await api<Feed>(`/api/chat/conversations/${encodeURIComponent(id)}?before=${feed.messages[0].sequence}`);
      setFeed(current => current?.conversation.id === id ? { ...current, messages: [...page.messages, ...current.messages], has_more: page.has_more } : current);
    } catch (err) { setError((err as Error).message); }
  }
  return <main className="flex h-dvh flex-col bg-background text-foreground">
    <header className="flex flex-wrap items-center gap-3 border-b border-border p-3">
      <strong className="mr-auto text-lg">Bridge</strong>
      <select disabled={sending} aria-label="Dự án" value={workspaceId} onChange={e => switchSelection(e.target.value,agentId)} className="max-w-48 rounded-lg border border-border bg-background p-2">{workspaces.map(w => <option key={w.workspace_id} value={w.workspace_id}>{w.project_name}</option>)}</select>
      <button disabled={sending} onClick={()=>setShowProject(v=>!v)} className="rounded-lg border border-border p-2 text-sm">Thêm project</button>
      <select disabled={sending} aria-label="Agent" value={agentId} onChange={e => switchSelection(workspaceId,e.target.value)} className="max-w-52 rounded-lg border border-border bg-background p-2">{agents.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
      <button disabled={sending} aria-label="Cuộc trò chuyện mới" onClick={() => { setConversationId(''); setFeed(null); setError(''); }} className="rounded-lg border border-border p-2"><Plus size={20} /></button>
    </header>
    {showProject&&<form onSubmit={e=>{e.preventDefault();void createProject();}} className="grid gap-3 border-b border-border bg-surface p-4 sm:grid-cols-2">
      <label className="text-sm">Tên project<input required maxLength={100} value={projectName} onChange={e=>setProjectName(e.target.value)} className="mt-1 block w-full rounded border border-border bg-background p-2"/></label>
      <label className="text-sm">Repo GitHub (không bắt buộc)<input type="url" placeholder="https://github.com/ban/project" value={projectRepo} onChange={e=>setProjectRepo(e.target.value)} className="mt-1 block w-full rounded border border-border bg-background p-2"/></label>
      <label className="text-sm">Tên thư mục trong Apps<input placeholder="Để trống để dùng tên project" value={projectFolder} onChange={e=>setProjectFolder(e.target.value)} className="mt-1 block w-full rounded border border-border bg-background p-2"/></label>
      <label className="text-sm">Nhánh dùng khi clone<input value={projectBranch} onChange={e=>setProjectBranch(e.target.value)} className="mt-1 block w-full rounded border border-border bg-background p-2"/></label>
      <p className="text-xs text-muted-foreground sm:col-span-2">Có thể dùng thư mục đã tồn tại trong Apps. Repo chỉ được clone khi thư mục chưa có; Bridge không tự ghi đè code hay đổi nhánh hiện tại. Runner chuẩn bị project khi xử lý yêu cầu đầu tiên.</p>
      <div className="flex gap-2"><button disabled={creating||sending} type="submit" className="rounded bg-primary px-4 py-2 text-primary-foreground">{creating?'Đang thêm…':'Thêm project'}</button><button type="button" onClick={()=>setShowProject(false)}>Đóng</button></div>
    </form>}
    {activity&&<div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
      <p>{activity.writer?`${agents.find(a=>a.id===activity.writer?.agent_id)?.label||activity.writer.agent_id} đang làm ${workspaces.find(w=>w.workspace_id===activity.writer?.workspace_id)?.project_name||'project khác'}. Các lượt tiếp theo chờ đến khi hoàn tất.`:'PC xử lý lần lượt từng yêu cầu; bạn có thể đổi model để giao việc tiếp theo.'}</p>
      {activity.queue.map(t=><div key={t.id} className="mt-1 flex items-center gap-2"><span>{agents.find(a=>a.id===t.agent_id)?.label||t.agent_id}: {t.status==='working'?'đang làm':'đang xếp hàng'}</span><button onClick={()=>void cancel(t.id)} className="underline">Hủy lượt</button></div>)}
      {!!activity.handoffs.length&&<details className="mt-2"><summary className="cursor-pointer">Bàn giao của project · tự gửi cho agent tiếp theo</summary><div className="max-h-56 space-y-3 overflow-auto pt-2">{activity.handoffs.map(h=><div key={h.id}><strong>{agents.find(a=>a.id===h.agent_id)?.label||h.agent_id}</strong><p className="whitespace-pre-wrap">{h.result}</p></div>)}</div></details>}
    </div>}
    <nav aria-label="Lịch sử trò chuyện" className="flex shrink-0 gap-2 overflow-x-auto border-b border-border px-3 py-2">{conversations.filter(c => c.agent_id === agentId).map(c => <button key={c.id} aria-current={c.id === conversationId ? 'page' : undefined} onClick={() => setConversationId(c.id)} className={`shrink-0 rounded-lg px-3 py-2 text-xs ${c.id === conversationId ? 'bg-primary text-primary-foreground' : 'bg-surface'}`}>{new Date(c.updated_at).toLocaleString()}</button>)}</nav>
    <section aria-label="Tin nhắn" className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-6">
        {!conversationId && <div className="py-16 text-center"><h1 className="text-2xl font-semibold">Bạn muốn làm gì hôm nay?</h1><p className="mt-3 text-sm text-muted-foreground">Chọn agent và gửi yêu cầu cho dự án của bạn.</p></div>}
        {feed?.has_more && <button onClick={older} className="w-full text-sm underline">Xem tin nhắn trước</button>}
        {feed?.messages.map(message => <article key={message.id} className={message.role === 'human' ? 'ml-8 rounded-2xl bg-surface p-4' : 'mr-4'}>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">{message.role === 'assistant' && <AgentIcon id={message.agent_id} />}<span>{message.role === 'human' ? 'Bạn' : agents.find(a => a.id === message.agent_id)?.label || 'Agent'}</span><time className="ml-auto text-xs font-normal text-muted-foreground" dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><button aria-label="Sao chép tin nhắn" onClick={() => { void navigator.clipboard.writeText(message.content).catch(() => setError('Không thể sao chép tin nhắn')); }}><Copy size={14} /></button></div>
          {message.role === 'human' ? <div className="whitespace-pre-wrap break-words text-sm leading-7">{message.content}</div> : <div className="chat-markdown break-words text-sm leading-7"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>, img: ({ alt, src }) => <a href={src} target="_blank" rel="noopener noreferrer">{alt || 'Xem hình ảnh'}</a> }}>{message.content}</Markdown></div>}
        </article>)}
        {active.map(turn => <div key={turn.id} className="flex items-center gap-3 text-sm text-muted-foreground"><AgentIcon id={agentId} /><span role="status">{turn.status === 'pending' ? 'Đang chờ agent…' : 'Agent đang xử lý…'}</span><button aria-label="Dừng trả lời" onClick={() => cancel(turn.id)} className="ml-auto rounded-lg border border-border p-2"><Square size={14} /></button></div>)}
        {feed?.turns.filter(t => t.status === 'failed' || t.status === 'cancelled').map(t => <p key={t.id} className="text-sm text-muted-foreground">{t.status === 'cancelled' ? 'Đã dừng yêu cầu.' : t.error_message||'Agent chưa hoàn thành yêu cầu. Xem nguyên nhân trước khi gửi lại.'}</p>)}
        <div ref={end} />
      </div>
    </section>
    <footer className="mx-auto w-full max-w-3xl px-4 pb-4">
      {error && <p role="alert" className="mb-2 text-sm text-red-500">{error}</p>}
      <form onSubmit={e => { e.preventDefault(); void send(); }} className="flex items-end gap-2 rounded-2xl border border-border bg-surface p-3">
        <textarea aria-label="Tin nhắn" placeholder={`Nhắn ${selected?.label || 'agent'}…`} value={draft} maxLength={100000} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} rows={3} className="max-h-48 min-h-16 flex-1 resize-y bg-transparent text-sm outline-none" />
        <button type="submit" aria-label="Gửi tin nhắn" disabled={sending || creating || !workspace || !draft.trim()} className="rounded-xl bg-primary p-3 text-primary-foreground disabled:opacity-40"><Send size={18} /></button>
      </form>
      <p className="mt-2 text-center text-xs text-muted-foreground">{selected?.available ? `${selected.label} sẵn sàng` : `${selected?.label || 'Agent'} chưa kết nối`}{conversationId && !connected ? ' · Đang kết nối lại' : ''} · Shift + Enter để xuống dòng</p>
    </footer>
  </main>;
}
