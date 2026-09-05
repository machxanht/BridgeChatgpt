import React, { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Folder,
  Github,
  Link2,
  Plus,
  Radio,
  Save,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import type { WorkspaceState } from '../types.js';

const CHATGPT_EMAIL_KEY = 'bridge.display.chatgptEmail';
const GEMINI_EMAIL_KEY = 'bridge.display.geminiEmail';
const ACTIVE_WORKSPACE_KEY = 'bridge.active.workspaceId';

interface AgentInstance {
  agent_instance_id: string;
  provider: 'chatgpt' | 'google-ai-studio';
  workspace_id: string;
  project_id: string;
  account_label: string;
  session_label: string;
  status: 'active' | 'idle' | 'offline';
  last_seen_at: string;
}

interface RegistryWorkspace {
  workspace_id: string;
  project_id: string;
  project_name: string;
  repository_url: string;
  branch: string;
  chatgpt_instances: AgentInstance[];
  studio_instances: AgentInstance[];
}

interface RegistrySnapshot {
  workspaces: RegistryWorkspace[];
  unbound_instances: AgentInstance[];
}

function safeRead(key: string) {
  try { return window.localStorage.getItem(key) || ''; } catch { return ''; }
}

function safeWrite(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* display state only */ }
}

function repoName(url?: string) {
  if (!url) return 'Chưa xác định';
  return url.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '') || url;
}

function newInstanceId(provider: 'chatgpt' | 'google-ai-studio') {
  const prefix = provider === 'chatgpt' ? 'chatgpt' : 'studio';
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function statusText(status: AgentInstance['status']) {
  if (status === 'active') return 'Đang hoạt động';
  if (status === 'idle') return 'Đang nghỉ';
  return 'Offline';
}

function statusDot(status: AgentInstance['status']) {
  if (status === 'active') return 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.6)]';
  if (status === 'idle') return 'bg-amber-400';
  return 'bg-slate-600';
}

export const IdentityBanner: React.FC = () => {
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [registry, setRegistry] = useState<RegistrySnapshot | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => safeRead(ACTIVE_WORKSPACE_KEY));
  const [chatgptEmail, setChatgptEmail] = useState(() => safeRead(CHATGPT_EMAIL_KEY));
  const [geminiEmail, setGeminiEmail] = useState(() => safeRead(GEMINI_EMAIL_KEY));
  const [newProjectName, setNewProjectName] = useState('');
  const [newRepo, setNewRepo] = useState('');
  const [sessionProvider, setSessionProvider] = useState<'chatgpt' | 'google-ai-studio'>('chatgpt');
  const [sessionAccount, setSessionAccount] = useState('');
  const [sessionLabel, setSessionLabel] = useState('');
  const [taskTarget, setTaskTarget] = useState('');
  const [taskText, setTaskText] = useState('');
  const [copiedInstance, setCopiedInstance] = useState('');
  const [feedback, setFeedback] = useState('');

  const load = async () => {
    try {
      const [workspaceRes, registryRes] = await Promise.all([
        fetch('/api/workspace'),
        fetch('/api/studio-relay/registry'),
      ]);
      if (workspaceRes.ok) setWorkspace(await workspaceRes.json());
      if (registryRes.ok) {
        const data = await registryRes.json();
        const snapshot: RegistrySnapshot = {
          workspaces: data.workspaces || [],
          unbound_instances: data.unbound_instances || [],
        };
        setRegistry(snapshot);
        if (!activeWorkspaceId && snapshot.workspaces[0]) {
          setActiveWorkspaceId(snapshot.workspaces[0].workspace_id);
          safeWrite(ACTIVE_WORKSPACE_KEY, snapshot.workspaces[0].workspace_id);
        }
      }
    } catch {
      // Keep the main app usable if registry is temporarily unavailable.
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const current = useMemo(() => {
    const list = registry?.workspaces || [];
    return list.find(item => item.workspace_id === activeWorkspaceId) || list[0] || null;
  }, [registry, activeWorkspaceId]);

  const taskTargets = useMemo(() => {
    if (!current) return [];
    return [
      ...current.chatgpt_instances.map(instance => ({ ...instance, assignee: 'chatgpt' as const })),
      ...current.studio_instances.map(instance => ({ ...instance, assignee: 'gemini' as const })),
    ];
  }, [current]);

  useEffect(() => {
    if (!taskTargets.length) {
      setTaskTarget('');
      return;
    }
    if (!taskTargets.some(item => item.agent_instance_id === taskTarget)) {
      setTaskTarget(taskTargets[0].agent_instance_id);
    }
  }, [taskTargets, taskTarget]);

  const fallbackProject = workspace?.project;
  const repository = repoName(current?.repository_url || fallbackProject?.repository_url);

  const selectWorkspace = (workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
    safeWrite(ACTIVE_WORKSPACE_KEY, workspaceId);
  };

  const createWorkspace = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    setFeedback('');
    try {
      const id = `workspace-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || Date.now().toString(36)}`;
      const res = await fetch('/api/studio-relay/registry/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: id,
          project_id: id.replace(/^workspace-/, 'project-'),
          project_name: name,
          repository_url: newRepo.trim() || fallbackProject?.repository_url || '',
          branch: fallbackProject?.default_branch || 'main',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không tạo được project');
      setNewProjectName('');
      setNewRepo('');
      selectWorkspace(data.workspace.workspace_id);
      setFeedback('Đã tạo project/workspace.');
      await load();
    } catch (error: any) {
      setFeedback(`Lỗi: ${error?.message || 'không tạo được project'}`);
    }
  };

  const addSession = async () => {
    if (!current) return;
    const label = sessionLabel.trim() || (sessionProvider === 'chatgpt' ? 'ChatGPT session' : 'Studio session');
    const account = sessionAccount.trim() || (sessionProvider === 'chatgpt' ? chatgptEmail : geminiEmail);
    setFeedback('');
    try {
      const res = await fetch('/api/studio-relay/registry/instances/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_instance_id: newInstanceId(sessionProvider),
          provider: sessionProvider,
          workspace_id: current.workspace_id,
          project_id: current.project_id,
          account_label: account,
          session_label: label,
          status: 'idle',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thêm được session');
      if (sessionProvider === 'chatgpt' && account) {
        setChatgptEmail(account);
        safeWrite(CHATGPT_EMAIL_KEY, account);
      }
      if (sessionProvider === 'google-ai-studio' && account) {
        setGeminiEmail(account);
        safeWrite(GEMINI_EMAIL_KEY, account);
      }
      setSessionAccount('');
      setSessionLabel('');
      setFeedback(`Đã gắn ${label} vào ${current.project_name}.`);
      await load();
    } catch (error: any) {
      setFeedback(`Lỗi: ${error?.message || 'không thêm được session'}`);
    }
  };

  const createBoundTask = async () => {
    const text = taskText.trim();
    const target = taskTargets.find(item => item.agent_instance_id === taskTarget);
    if (!current || !target || !text) return;
    setFeedback('');
    try {
      const firstLine = text.split('\n').map(line => line.trim()).find(Boolean) || text;
      const title = firstLine.length > 100 ? `${firstLine.slice(0, 97)}...` : firstLine;
      const res = await fetch('/api/studio-relay/bound-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: text,
          priority: 'high',
          assignee: target.assignee,
          workspace_id: current.workspace_id,
          project_id: current.project_id,
          agent_instance_id: target.agent_instance_id,
          related_files: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không tạo được task');
      setTaskText('');
      setFeedback(`Đã tạo ${data.task.id} cho ${target.session_label} trong ${current.project_name}.`);
    } catch (error: any) {
      setFeedback(`Lỗi: ${error?.message || 'không tạo được task'}`);
    }
  };

  const copyStudioActivation = async (instance: AgentInstance) => {
    if (!current) return;
    const command = [
      'Check Bridge and use this exact Studio identity for all relay calls until this project changes:',
      `workspace_id=${current.workspace_id}`,
      `project_id=${current.project_id}`,
      `agent_instance_id=${instance.agent_instance_id}`,
      'Claim and process pending tasks only for this workspace/project. Do not use studio-legacy for this session.',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(command);
      setCopiedInstance(instance.agent_instance_id);
      window.setTimeout(() => setCopiedInstance(''), 1800);
    } catch {
      setFeedback('Lỗi: Không copy được lệnh kích Studio trên thiết bị này.');
    }
  };

  return (
    <div className="relative z-30 border-b border-white/5 bg-slate-950/90 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="group rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/15 to-violet-950/20 p-3 text-left hover:border-violet-400/40 transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-violet-300 text-[10px] font-bold uppercase tracking-wider"><Folder className="w-4 h-4" />Project</div>
              {expanded ? <ChevronUp className="w-4 h-4 text-violet-400" /> : <ChevronDown className="w-4 h-4 text-violet-400" />}
            </div>
            <div className="mt-2 text-sm font-bold text-white truncate">{current?.project_name || fallbackProject?.project_name || 'Đang tải...'}</div>
            <div className="mt-1 text-[10px] text-violet-300/70">{registry?.workspaces?.length || 1} project trong Bridge</div>
          </button>

          <div className="rounded-2xl border border-slate-500/20 bg-gradient-to-br from-slate-500/10 to-black/20 p-3">
            <div className="flex items-center gap-2 text-slate-300 text-[10px] font-bold uppercase tracking-wider"><Github className="w-4 h-4" />Repository</div>
            <div className="mt-2 text-sm font-semibold text-white truncate">{repository}</div>
            <div className="mt-1 text-[10px] text-slate-500">branch <span className="text-slate-300">{current?.branch || fallbackProject?.default_branch || '—'}</span></div>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/15 to-emerald-950/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-emerald-300 text-[10px] font-bold uppercase tracking-wider"><Bot className="w-4 h-4" />ChatGPT</div>
              <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">{current?.chatgpt_instances.length || 0}</span>
            </div>
            <div className="mt-2 text-sm font-semibold text-white">{current?.chatgpt_instances.length ? `${current.chatgpt_instances.length} phiên đã đăng ký` : 'Chưa có phiên'}</div>
            <div className="mt-1 text-[10px] text-emerald-300/70 truncate">{current?.chatgpt_instances[0]?.session_label || 'Sẽ chuyển sang URL-based'}</div>
          </div>

          <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/15 to-cyan-950/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-cyan-300 text-[10px] font-bold uppercase tracking-wider"><Sparkles className="w-4 h-4" />AI Studio</div>
              <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] font-bold text-cyan-300">{current?.studio_instances.length || 0}</span>
            </div>
            <div className="mt-2 text-sm font-semibold text-white">{current?.studio_instances.length ? `${current.studio_instances.length} app/session` : 'Chưa có app'}</div>
            <div className="mt-1 text-[10px] text-cyan-300/70 truncate">{current?.studio_instances[0]?.session_label || 'Sẽ chuyển sang URL-based'}</div>
          </div>
        </div>

        {expanded && (
          <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 shadow-2xl shadow-black/20">
            <div className="border-b border-white/5 bg-white/[0.025] p-3">
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {(registry?.workspaces || []).map(item => (
                  <button
                    key={item.workspace_id}
                    onClick={() => selectWorkspace(item.workspace_id)}
                    className={`min-w-[210px] rounded-xl border px-3 py-2 text-left transition-all ${current?.workspace_id === item.workspace_id ? 'border-violet-400/50 bg-violet-500/15 ring-1 ring-violet-400/10' : 'border-white/10 bg-black/20 hover:border-white/20'}`}
                  >
                    <div className="flex items-center gap-2">
                      <Folder className={`w-3.5 h-3.5 ${current?.workspace_id === item.workspace_id ? 'text-violet-300' : 'text-slate-500'}`} />
                      <span className="text-xs font-bold text-white truncate">{item.project_name}</span>
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500 truncate">{repoName(item.repository_url)}</div>
                    <div className="mt-2 flex gap-2 text-[9px]">
                      <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">GPT {item.chatgpt_instances.length}</span>
                      <span className="rounded-md bg-cyan-500/10 px-1.5 py-0.5 text-cyan-300">Studio {item.studio_instances.length}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {current && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 p-3">
                <section className="rounded-2xl border border-emerald-500/20 bg-emerald-950/15 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-emerald-500/10 px-3 py-2.5">
                    <div className="flex items-center gap-2 text-emerald-300"><Bot className="w-4 h-4" /><span className="text-xs font-bold">ChatGPT</span></div>
                    <span className="text-[10px] text-emerald-300/70">{current.chatgpt_instances.length} phiên</span>
                  </div>
                  <div className="p-2 space-y-2">
                    {current.chatgpt_instances.length ? current.chatgpt_instances.map(instance => (
                      <div key={instance.agent_instance_id} className="rounded-xl border border-emerald-500/10 bg-black/20 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${statusDot(instance.status)}`} />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-white truncate">{instance.session_label}</div>
                            <div className="text-[10px] text-slate-500 truncate">{instance.account_label || 'Không có nhãn account'}</div>
                          </div>
                          <span className="text-[9px] text-slate-500">{statusText(instance.status)}</span>
                        </div>
                      </div>
                    )) : (
                      <div className="rounded-xl border border-dashed border-emerald-500/20 px-3 py-5 text-center text-[11px] text-emerald-300/60">Chưa có ChatGPT session trong project này</div>
                    )}
                  </div>
                </section>

                <section className="rounded-2xl border border-cyan-500/20 bg-cyan-950/15 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-cyan-500/10 px-3 py-2.5">
                    <div className="flex items-center gap-2 text-cyan-300"><Sparkles className="w-4 h-4" /><span className="text-xs font-bold">Google AI Studio</span></div>
                    <span className="text-[10px] text-cyan-300/70">{current.studio_instances.length} app/session</span>
                  </div>
                  <div className="p-2 space-y-2">
                    {current.studio_instances.length ? current.studio_instances.map(instance => (
                      <div key={instance.agent_instance_id} className="rounded-xl border border-cyan-500/10 bg-black/20 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${statusDot(instance.status)}`} />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-white truncate">{instance.session_label}</div>
                            <div className="text-[10px] text-slate-500 truncate">{instance.account_label || 'Không có nhãn'} · <span className="font-mono text-cyan-300/70">{instance.agent_instance_id}</span></div>
                          </div>
                          <button onClick={() => copyStudioActivation(instance)} className="shrink-0 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-2 py-1.5 text-[10px] text-cyan-200 hover:bg-cyan-500/20" title="Copy lệnh kích đúng Studio session này">
                            {copiedInstance === instance.agent_instance_id ? <><Check className="w-3 h-3 inline mr-1" />Đã copy</> : <><Clipboard className="w-3 h-3 inline mr-1" />Kích</>}
                          </button>
                        </div>
                      </div>
                    )) : (
                      <div className="rounded-xl border border-dashed border-cyan-500/20 px-3 py-5 text-center text-[11px] text-cyan-300/60">Chưa có AI Studio app/session trong project này</div>
                    )}
                  </div>
                </section>
              </div>
            )}

            <div className="px-3 pb-3">
              <section className="rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-950/20 to-orange-950/10 p-3">
                <div className="flex items-center gap-2 text-amber-300"><Send className="w-4 h-4" /><span className="text-xs font-bold">Tạo task</span></div>
                <div className="mt-3">
                  {taskTargets.length ? (
                    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_auto] gap-2">
                      <select value={taskTarget} onChange={event => setTaskTarget(event.target.value)} className="rounded-xl bg-black/40 border border-amber-500/20 px-3 py-2.5 text-xs text-white">
                        {taskTargets.map(item => (
                          <option key={item.agent_instance_id} value={item.agent_instance_id}>
                            {item.provider === 'chatgpt' ? '🟢 ChatGPT' : '🔵 Studio'} · {item.session_label}
                          </option>
                        ))}
                      </select>
                      <input value={taskText} onChange={event => setTaskText(event.target.value)} placeholder="Nhập việc cần làm..." className="rounded-xl bg-black/40 border border-amber-500/20 px-3 py-2.5 text-xs text-white placeholder:text-slate-600" />
                      <button onClick={createBoundTask} disabled={!taskText.trim()} className="rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-40"><Send className="w-3.5 h-3.5 inline mr-1.5" />Giao việc</button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-amber-300/70">Chưa có target để giao task.</div>
                  )}
                </div>
              </section>
            </div>

            <div className="border-t border-white/5 px-3 py-2.5">
              <button onClick={() => setShowSetup(!showSetup)} className="flex items-center gap-2 text-[11px] font-semibold text-slate-400 hover:text-white">
                <Link2 className="w-3.5 h-3.5" />
                Thiết lập kỹ thuật / legacy
                {showSetup ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {showSetup && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 border-t border-white/5 bg-black/20 p-3">
                <section className="rounded-xl border border-violet-500/15 bg-violet-950/10 p-3">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-violet-300"><Plus className="w-3.5 h-3.5" />Thêm project</div>
                  <div className="mt-2 space-y-2">
                    <input value={newProjectName} onChange={event => setNewProjectName(event.target.value)} placeholder="Tên project" className="w-full rounded-lg bg-black/40 border border-violet-500/15 px-3 py-2 text-xs text-white" />
                    <input value={newRepo} onChange={event => setNewRepo(event.target.value)} placeholder="GitHub repo URL" className="w-full rounded-lg bg-black/40 border border-violet-500/15 px-3 py-2 text-xs text-white" />
                    <button onClick={createWorkspace} className="w-full rounded-lg bg-violet-500/20 border border-violet-400/20 px-3 py-2 text-xs font-semibold text-violet-200"><Plus className="w-3 h-3 inline mr-1" />Tạo project</button>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-500/15 bg-slate-900/30 p-3">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-300"><Radio className="w-3.5 h-3.5" />Gắn session kiểu cũ</div>
                  <div className="mt-2 space-y-2">
                    <select value={sessionProvider} onChange={event => setSessionProvider(event.target.value as 'chatgpt' | 'google-ai-studio')} className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-white">
                      <option value="chatgpt">ChatGPT</option>
                      <option value="google-ai-studio">AI Studio</option>
                    </select>
                    <input value={sessionAccount} onChange={event => setSessionAccount(event.target.value)} placeholder="Account/email hiển thị" className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-white" />
                    <input value={sessionLabel} onChange={event => setSessionLabel(event.target.value)} placeholder="Tên session" className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-white" />
                    <button onClick={addSession} disabled={!current} className="w-full rounded-lg bg-slate-700 px-3 py-2 text-xs font-semibold text-white"><Save className="w-3 h-3 inline mr-1" />Gắn legacy session</button>
                  </div>
                </section>

                <div className="lg:col-span-2 flex items-start gap-2 rounded-xl border border-amber-500/10 bg-amber-950/10 px-3 py-2 text-[10px] text-amber-200/70">
                  <X className="mt-0.5 w-3.5 h-3.5 shrink-0" />
                  Phần này sẽ được thay bằng Repo URL + AI Studio URL + ChatGPT URL. Account label và agent instance hiện chỉ giữ để tương thích backend cũ.
                </div>
              </div>
            )}

            {feedback && <div className={`border-t border-white/5 px-3 py-2 text-[11px] ${feedback.startsWith('Lỗi:') ? 'text-rose-300' : 'text-emerald-300'}`}>{feedback}</div>}
          </div>
        )}
      </div>
    </div>
  );
};
