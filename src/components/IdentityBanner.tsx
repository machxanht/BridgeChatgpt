import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Save, Send, X } from 'lucide-react';
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

export const IdentityBanner: React.FC = () => {
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [registry, setRegistry] = useState<RegistrySnapshot | null>(null);
  const [expanded, setExpanded] = useState(false);
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
        const snapshot = { workspaces: data.workspaces || [], unbound_instances: data.unbound_instances || [] };
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
  const chatgptBinding = current?.chatgpt_instances?.[0];
  const studioBinding = current?.studio_instances?.[0];
  const chatgptText = chatgptBinding
    ? `${chatgptBinding.account_label || 'ChatGPT'} / ${chatgptBinding.session_label}`
    : (chatgptEmail || 'chưa gắn session');
  const studioText = studioBinding
    ? `${studioBinding.account_label || 'Studio'} / ${studioBinding.session_label}`
    : (geminiEmail || 'chưa gắn session');

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

  return (
    <div className="relative z-30 border-b border-white/5 bg-slate-950/85 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-2">
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-slate-400">
          <span><b className="text-slate-200">Project:</b> <span className="text-white">{current?.project_name || fallbackProject?.project_name || 'Đang tải...'}</span></span>
          <span className="text-slate-700">•</span>
          <span><b className="text-slate-200">Repo:</b> <span className="text-cyan-300">{repository}</span> / {current?.branch || fallbackProject?.default_branch || '—'}</span>
          <span className="text-slate-700">•</span>
          <span><b className="text-slate-200">ChatGPT:</b> {chatgptText}</span>
          <span className="text-slate-700">•</span>
          <span><b className="text-slate-200">Studio:</b> {studioText}</span>
          <button onClick={() => setExpanded(!expanded)} className="ml-auto text-cyan-300 hover:text-white whitespace-nowrap">
            {expanded ? <><ChevronUp className="w-3 h-3 inline mr-1" />Ẩn projects</> : <><ChevronDown className="w-3 h-3 inline mr-1" />Projects ({registry?.workspaces?.length || 1})</>}
          </button>
        </div>

        {expanded && (
          <div className="mt-2 rounded-xl border border-white/10 bg-black/30 p-3 space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(registry?.workspaces || []).map(item => (
                <button key={item.workspace_id} onClick={() => selectWorkspace(item.workspace_id)} className={`min-w-[220px] text-left rounded-xl border px-3 py-2 ${current?.workspace_id === item.workspace_id ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-white/10 bg-black/20'}`}>
                  <div className="text-xs font-bold text-white truncate">{item.project_name}</div>
                  <div className="text-[10px] text-slate-500 mt-1 truncate">{repoName(item.repository_url)} / {item.branch}</div>
                  <div className="text-[10px] text-slate-400 mt-1">ChatGPT {item.chatgpt_instances.length} · Studio {item.studio_instances.length}</div>
                </button>
              ))}
            </div>

            {current && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                <div className="rounded-lg border border-indigo-500/15 bg-indigo-950/20 p-2">
                  <div className="text-[10px] font-semibold text-indigo-300">CHATGPT SESSIONS — {current.project_name}</div>
                  <div className="mt-1 text-[11px] text-slate-300">{current.chatgpt_instances.length ? current.chatgpt_instances.map(item => `${item.account_label || 'ChatGPT'} / ${item.session_label}`).join(' · ') : 'Chưa gắn session'}</div>
                </div>
                <div className="rounded-lg border border-cyan-500/15 bg-cyan-950/20 p-2">
                  <div className="text-[10px] font-semibold text-cyan-300">STUDIO SESSIONS — {current.project_name}</div>
                  <div className="mt-1 text-[11px] text-slate-300">{current.studio_instances.length ? current.studio_instances.map(item => `${item.account_label || 'Studio'} / ${item.session_label}`).join(' · ') : 'Chưa gắn session'}</div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 border-t border-white/5 pt-3">
              <div>
                <div className="text-[10px] font-semibold text-slate-400 mb-2">THÊM PROJECT</div>
                <div className="flex gap-2 flex-col sm:flex-row">
                  <input value={newProjectName} onChange={event => setNewProjectName(event.target.value)} placeholder="Tên project" className="flex-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-white" />
                  <input value={newRepo} onChange={event => setNewRepo(event.target.value)} placeholder="GitHub repo URL (tùy chọn)" className="flex-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-white" />
                  <button onClick={createWorkspace} className="px-3 py-2 rounded-lg bg-white/10 text-xs text-white whitespace-nowrap"><Plus className="w-3 h-3 inline mr-1" />Project</button>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-semibold text-slate-400 mb-2">GẮN SESSION VÀO PROJECT ĐANG CHỌN</div>
                <div className="flex gap-2 flex-col sm:flex-row">
                  <select value={sessionProvider} onChange={event => setSessionProvider(event.target.value as 'chatgpt' | 'google-ai-studio')} className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-white">
                    <option value="chatgpt">ChatGPT</option>
                    <option value="google-ai-studio">AI Studio</option>
                  </select>
                  <input value={sessionAccount} onChange={event => setSessionAccount(event.target.value)} placeholder="Account/email hiển thị" className="flex-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-white" />
                  <input value={sessionLabel} onChange={event => setSessionLabel(event.target.value)} placeholder="Tên session, vd C-01 / G-03" className="flex-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-white" />
                  <button onClick={addSession} disabled={!current} className="px-3 py-2 rounded-lg bg-cyan-500 text-slate-950 text-xs font-bold whitespace-nowrap"><Save className="w-3 h-3 inline mr-1" />Gắn</button>
                </div>
              </div>
            </div>

            <div className="border-t border-white/5 pt-3">
              <div className="text-[10px] font-semibold text-slate-400 mb-2">TẠO TASK ĐÚNG PROJECT + ĐÚNG SESSION</div>
              {taskTargets.length ? (
                <div className="flex gap-2 flex-col lg:flex-row">
                  <select value={taskTarget} onChange={event => setTaskTarget(event.target.value)} className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-white lg:max-w-[300px]">
                    {taskTargets.map(item => (
                      <option key={item.agent_instance_id} value={item.agent_instance_id}>
                        {item.provider === 'chatgpt' ? 'ChatGPT' : 'Studio'} · {item.account_label || 'account'} · {item.session_label}
                      </option>
                    ))}
                  </select>
                  <input value={taskText} onChange={event => setTaskText(event.target.value)} placeholder="Việc cần làm trong project này..." className="flex-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-white" />
                  <button onClick={createBoundTask} disabled={!taskText.trim()} className="px-3 py-2 rounded-lg bg-cyan-500 text-slate-950 text-xs font-bold whitespace-nowrap"><Send className="w-3 h-3 inline mr-1" />Tạo task</button>
                </div>
              ) : (
                <div className="text-[11px] text-amber-300">Gắn ít nhất một ChatGPT/Studio session vào project trước rồi mới tạo task bound.</div>
              )}
            </div>

            {feedback && <div className={`text-[11px] ${feedback.startsWith('Lỗi:') ? 'text-rose-300' : 'text-emerald-300'}`}>{feedback}</div>}
            <div className="text-[10px] text-slate-600 flex items-center gap-1"><X className="w-3 h-3" /> Account là nhãn để mày nhận biết; routing thật dùng project/workspace + agent instance, không ghép ChatGPT A với Studio A.</div>
          </div>
        )}
      </div>
    </div>
  );
};
