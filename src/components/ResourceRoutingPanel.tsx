import React, { useEffect, useMemo, useState } from 'react';
import {
  Brain,
  Check,
  Clipboard,
  Cpu,
  ExternalLink,
  FolderGit2,
  GitBranch,
  Layers3,
  Link2,
  Plus,
  Send,
  Trash2,
} from 'lucide-react';

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

interface ResourceSnapshot {
  workspaces: ResourceWorkspace[];
  server_time: string;
}

const ACTIVE_RESOURCE_WORKSPACE = 'bridge.resource.activeWorkspace';

function readLocal(key: string) {
  try { return window.localStorage.getItem(key) || ''; } catch { return ''; }
}

function writeLocal(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* optional browser preference */ }
}

function splitUrls(value: string) {
  return value
    .split(/[\n,]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function shortId(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

function repoName(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/^\//, '').replace(/\.git$/i, '') || url;
  } catch {
    return url;
  }
}

function relativeSeen(value: string | null) {
  if (!value) return 'chưa handshake';
  const diff = Math.max(0, Date.now() - Date.parse(value));
  if (!Number.isFinite(diff)) return 'đã kết nối';
  if (diff < 60_000) return `${Math.max(1, Math.round(diff / 1000))} giây trước`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} phút trước`;
  return `${Math.round(diff / 3_600_000)} giờ trước`;
}

export const ResourceRoutingPanel: React.FC = () => {
  const [snapshot, setSnapshot] = useState<ResourceSnapshot | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => readLocal(ACTIVE_RESOURCE_WORKSPACE));
  const [repoUrl, setRepoUrl] = useState('');
  const [projectName, setProjectName] = useState('');
  const [studioUrls, setStudioUrls] = useState('');
  const [chatgptUrls, setChatgptUrls] = useState('');
  const [studioAdd, setStudioAdd] = useState('');
  const [chatgptAdd, setChatgptAdd] = useState('');
  const [taskTarget, setTaskTarget] = useState('');
  const [taskText, setTaskText] = useState('');
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState('');
  const [copied, setCopied] = useState('');

  const load = async () => {
    try {
      const response = await fetch('/api/resource-registry');
      if (!response.ok) return;
      const data = await response.json();
      const next: ResourceSnapshot = {
        workspaces: data.workspaces || [],
        server_time: data.server_time || new Date().toISOString(),
      };
      setSnapshot(next);
      if ((!activeWorkspaceId || !next.workspaces.some(item => item.workspace_id === activeWorkspaceId)) && next.workspaces[0]) {
        setActiveWorkspaceId(next.workspaces[0].workspace_id);
        writeLocal(ACTIVE_RESOURCE_WORKSPACE, next.workspaces[0].workspace_id);
      }
    } catch {
      // The rest of Mission Control can remain usable while this optional panel retries.
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 12_000);
    return () => window.clearInterval(timer);
  }, []);

  const current = useMemo(() => {
    const workspaces = snapshot?.workspaces || [];
    return workspaces.find(item => item.workspace_id === activeWorkspaceId) || workspaces[0] || null;
  }, [snapshot, activeWorkspaceId]);

  const allTargets = useMemo(() => {
    if (!current) return [];
    return [...current.chatgpt_targets, ...current.studio_targets];
  }, [current]);

  useEffect(() => {
    if (!allTargets.length) {
      setTaskTarget('');
      return;
    }
    if (!allTargets.some(item => item.target_id === taskTarget)) setTaskTarget(allTargets[0].target_id);
  }, [allTargets, taskTarget]);

  const selectWorkspace = (workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
    writeLocal(ACTIVE_RESOURCE_WORKSPACE, workspaceId);
    setFeedback('');
  };

  const addTarget = async (workspaceId: string, resourceUrl: string) => {
    const response = await fetch('/api/resource-registry/targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: workspaceId, resource_url: resourceUrl }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Không thêm được URL ${resourceUrl}`);
    return data.target as ResourceTarget;
  };

  const saveQuickProject = async () => {
    const repo = repoUrl.trim();
    if (!repo) {
      setFeedback('Lỗi: Dán Repo URL trước.');
      return;
    }
    setBusy('quick');
    setFeedback('');
    try {
      const projectResponse = await fetch('/api/resource-registry/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repository_url: repo, project_name: projectName.trim() || undefined }),
      });
      const projectData = await projectResponse.json().catch(() => ({}));
      if (!projectResponse.ok) throw new Error(projectData.error || 'Không tạo được project');
      const workspace = projectData.workspace as ResourceWorkspace;
      const resources = [...splitUrls(studioUrls), ...splitUrls(chatgptUrls)];
      for (const resourceUrl of resources) await addTarget(workspace.workspace_id, resourceUrl);
      setRepoUrl('');
      setProjectName('');
      setStudioUrls('');
      setChatgptUrls('');
      selectWorkspace(workspace.workspace_id);
      await load();
      setFeedback(`Đã lưu ${workspace.project_name}: repo + ${resources.length} session/app URL.`);
    } catch (error: any) {
      setFeedback(`Lỗi: ${error?.message || 'không lưu được project'}`);
    } finally {
      setBusy('');
    }
  };

  const addMany = async (provider: 'studio' | 'chatgpt') => {
    if (!current) return;
    const raw = provider === 'studio' ? studioAdd : chatgptAdd;
    const urls = splitUrls(raw);
    if (!urls.length) return;
    setBusy(provider);
    setFeedback('');
    try {
      for (const url of urls) await addTarget(current.workspace_id, url);
      if (provider === 'studio') setStudioAdd(''); else setChatgptAdd('');
      await load();
      setFeedback(`Đã thêm ${urls.length} ${provider === 'studio' ? 'AI Studio app' : 'ChatGPT chat'} vào ${current.project_name}.`);
    } catch (error: any) {
      setFeedback(`Lỗi: ${error?.message || 'không thêm được URL'}`);
    } finally {
      setBusy('');
    }
  };

  const removeTarget = async (target: ResourceTarget) => {
    setBusy(target.target_id);
    setFeedback('');
    try {
      const response = await fetch(`/api/resource-registry/targets/${encodeURIComponent(target.target_id)}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Không xóa được target');
      await load();
      setFeedback(`Đã bỏ ${target.label} khỏi project.`);
    } catch (error: any) {
      setFeedback(`Lỗi: ${error?.message || 'không xóa được target'}`);
    } finally {
      setBusy('');
    }
  };

  const copyActivation = async (target: ResourceTarget) => {
    if (!current) return;
    const text = target.provider === 'google-ai-studio'
      ? [
          `Use Bridge for project: ${current.project_name}`,
          `repo=${current.repository_url}`,
          `workspace_id=${current.workspace_id}`,
          `project_id=${current.project_id}`,
          `agent_instance_id=${target.agent_instance_id}`,
          `studio_app_id=${target.resource_id}`,
          'For every Bridge relay call include workspace_id, project_id and agent_instance_id. Claim only tasks for this project. Process pending tasks completely, but do not Publish unless explicitly asked.',
        ].join('\n')
      : [
          `Join Bridge project: ${current.project_name}`,
          `repo=${current.repository_url}`,
          `workspace_id=${current.workspace_id}`,
          `project_id=${current.project_id}`,
          `chatgpt_conversation_id=${target.resource_id}`,
          'Use this repo/project as the shared source of truth. Check Bridge tasks/handoffs before continuing work in this conversation.',
        ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(target.target_id);
      window.setTimeout(() => setCopied(''), 1800);
    } catch {
      setFeedback('Lỗi: Trình duyệt không cho copy clipboard.');
    }
  };

  const createBoundTask = async () => {
    if (!current || !taskText.trim()) return;
    const target = allTargets.find(item => item.target_id === taskTarget);
    if (!target) return;
    setBusy('task');
    setFeedback('');
    try {
      const text = taskText.trim();
      const firstLine = text.split('\n').map(line => line.trim()).find(Boolean) || text;
      const response = await fetch('/api/studio-relay/bound-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: firstLine.length > 100 ? `${firstLine.slice(0, 97)}...` : firstLine,
          description: text,
          priority: 'high',
          assignee: target.provider === 'chatgpt' ? 'chatgpt' : 'gemini',
          workspace_id: current.workspace_id,
          project_id: current.project_id,
          agent_instance_id: target.agent_instance_id,
          related_files: [],
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Không tạo được task');
      setTaskText('');
      setFeedback(`Đã tạo ${data.task.id} → ${target.label}.`);
    } catch (error: any) {
      setFeedback(`Lỗi: ${error?.message || 'không tạo được task'}`);
    } finally {
      setBusy('');
    }
  };

  const statusPill = (target: ResourceTarget) => {
    if (target.provider === 'chatgpt') {
      return <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-200">● ĐÃ LƯU CHAT</span>;
    }
    if (target.connection_status === 'active') {
      return <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold text-cyan-200">● ĐANG KẾT NỐI</span>;
    }
    if (target.connection_status === 'idle') {
      return <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-2 py-1 text-[10px] font-semibold text-sky-200">● ĐANG NGHỈ</span>;
    }
    return <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-[10px] font-semibold text-amber-200">● CHƯA KÍCH</span>;
  };

  return (
    <section className="rounded-3xl border border-violet-400/20 bg-slate-950/70 p-4 sm:p-5 shadow-2xl shadow-violet-950/20">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-violet-400/30 bg-violet-500/15">
            <Layers3 className="h-5 w-5 text-violet-300" />
          </div>
          <div>
            <div className="text-sm font-black text-white">PROJECT ROUTER</div>
            <div className="text-xs text-slate-400">Repo + URL Studio + URL ChatGPT. Không cần nhớ account, C-01, G-01 hay agent ID.</div>
          </div>
        </div>
        <div className="rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1 text-[11px] font-semibold text-violet-200">
          {snapshot?.workspaces.length || 0} PROJECT
        </div>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {(snapshot?.workspaces || []).map(item => {
          const selected = item.workspace_id === current?.workspace_id;
          return (
            <button
              key={item.workspace_id}
              onClick={() => selectWorkspace(item.workspace_id)}
              className={`min-w-[220px] rounded-2xl border px-3 py-3 text-left transition ${selected ? 'border-violet-400/45 bg-violet-500/15 shadow-lg shadow-violet-950/20' : 'border-white/10 bg-black/20 hover:bg-white/5'}`}
            >
              <div className="flex items-center gap-2">
                <FolderGit2 className={`h-4 w-4 ${selected ? 'text-violet-300' : 'text-slate-500'}`} />
                <span className="truncate text-xs font-bold text-white">{item.project_name}</span>
              </div>
              <div className="mt-1 truncate text-[10px] text-slate-500">{repoName(item.repository_url)}</div>
              <div className="mt-2 flex gap-2 text-[10px]">
                <span className="rounded-md bg-cyan-500/10 px-1.5 py-0.5 text-cyan-200">Studio {item.studio_targets.length}</span>
                <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-emerald-200">GPT {item.chatgpt_targets.length}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-violet-400/20 bg-violet-950/15 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold text-violet-200">
          <Plus className="h-4 w-4" /> THÊM PROJECT NHANH — ĐÚNG 3 THỨ
        </div>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <div className="rounded-2xl border border-slate-400/15 bg-black/25 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-white"><FolderGit2 className="h-4 w-4 text-violet-300" /> 1. REPO URL</div>
            <input value={repoUrl} onChange={event => setRepoUrl(event.target.value)} placeholder="https://github.com/user/repo" className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-xs text-white outline-none focus:border-violet-400/50" />
            <input value={projectName} onChange={event => setProjectName(event.target.value)} placeholder="Tên project — để trống sẽ tự lấy từ repo" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-[11px] text-white outline-none focus:border-violet-400/50" />
          </div>

          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-950/15 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-cyan-100"><Cpu className="h-4 w-4 text-cyan-300" /> 2. AI STUDIO URL</div>
            <textarea value={studioUrls} onChange={event => setStudioUrls(event.target.value)} rows={3} placeholder={'https://aistudio.google.com/u/3/apps/15c1d80d-...\nMỗi app một dòng'} className="w-full resize-none rounded-xl border border-cyan-400/15 bg-slate-950/80 px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-400/50" />
          </div>

          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-950/15 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-emerald-100"><Brain className="h-4 w-4 text-emerald-300" /> 3. CHATGPT URL</div>
            <textarea value={chatgptUrls} onChange={event => setChatgptUrls(event.target.value)} rows={3} placeholder={'https://chatgpt.com/c/...\nMỗi chat một dòng'} className="w-full resize-none rounded-xl border border-emerald-400/15 bg-slate-950/80 px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-400/50" />
          </div>
        </div>
        <button onClick={saveQuickProject} disabled={busy === 'quick' || !repoUrl.trim()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-violet-950/30 disabled:opacity-40">
          <Link2 className="h-4 w-4" /> {busy === 'quick' ? 'ĐANG LƯU...' : 'LƯU PROJECT + CÁC SESSION'}
        </button>
      </div>

      {current && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[0.8fr_1fr_1fr]">
            <div className="rounded-2xl border border-violet-400/20 bg-violet-950/15 p-4">
              <div className="flex items-center gap-2 text-xs font-black text-violet-200"><FolderGit2 className="h-4 w-4" /> REPOSITORY</div>
              <div className="mt-3 break-all text-sm font-bold text-white">{repoName(current.repository_url)}</div>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400"><GitBranch className="h-3.5 w-3.5 text-violet-300" /> {current.branch}</div>
              <a href={current.repository_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-violet-300 hover:text-white"><ExternalLink className="h-3 w-3" /> Mở repo</a>
            </div>

            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-950/15 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-black text-cyan-100"><Cpu className="h-4 w-4 text-cyan-300" /> AI STUDIO <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px]">{current.studio_targets.length}</span></div>
              </div>
              <div className="mt-3 space-y-2">
                {current.studio_targets.length === 0 && <div className="rounded-xl border border-dashed border-cyan-400/20 p-3 text-xs text-cyan-100/50">Chưa có Studio app.</div>}
                {current.studio_targets.map(target => (
                  <div key={target.target_id} className="rounded-xl border border-cyan-400/15 bg-black/25 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><div className="truncate text-xs font-bold text-white">{target.label}</div><div className="mt-1 font-mono text-[10px] text-cyan-300">ID: {shortId(target.resource_id)}</div></div>
                      {statusPill(target)}
                    </div>
                    <div className="mt-2 text-[10px] text-slate-500">{relativeSeen(target.last_seen_at)}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a href={target.resource_url} target="_blank" rel="noreferrer" className="rounded-lg border border-cyan-400/20 px-2 py-1 text-[10px] text-cyan-200"><ExternalLink className="mr-1 inline h-3 w-3" />Mở</a>
                      <button onClick={() => copyActivation(target)} className="rounded-lg border border-cyan-400/20 px-2 py-1 text-[10px] text-cyan-200"><Clipboard className="mr-1 inline h-3 w-3" />{copied === target.target_id ? 'Đã copy' : 'Kích Studio'}</button>
                      <button onClick={() => removeTarget(target)} disabled={busy === target.target_id} className="rounded-lg border border-rose-400/15 px-2 py-1 text-[10px] text-rose-300"><Trash2 className="inline h-3 w-3" /></button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input value={studioAdd} onChange={event => setStudioAdd(event.target.value)} placeholder="Dán thêm Studio URL" className="min-w-0 flex-1 rounded-xl border border-cyan-400/15 bg-slate-950/80 px-3 py-2 text-[11px] text-white outline-none" />
                <button onClick={() => addMany('studio')} disabled={!studioAdd.trim() || busy === 'studio'} className="rounded-xl bg-cyan-500 px-3 text-slate-950 disabled:opacity-40"><Plus className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-950/15 p-4">
              <div className="flex items-center gap-2 text-xs font-black text-emerald-100"><Brain className="h-4 w-4 text-emerald-300" /> CHATGPT <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px]">{current.chatgpt_targets.length}</span></div>
              <div className="mt-3 space-y-2">
                {current.chatgpt_targets.length === 0 && <div className="rounded-xl border border-dashed border-emerald-400/20 p-3 text-xs text-emerald-100/50">Chưa có ChatGPT chat.</div>}
                {current.chatgpt_targets.map(target => (
                  <div key={target.target_id} className="rounded-xl border border-emerald-400/15 bg-black/25 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><div className="truncate text-xs font-bold text-white">{target.label}</div><div className="mt-1 font-mono text-[10px] text-emerald-300">ID: {shortId(target.resource_id)}</div></div>
                      {statusPill(target)}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a href={target.resource_url} target="_blank" rel="noreferrer" className="rounded-lg border border-emerald-400/20 px-2 py-1 text-[10px] text-emerald-200"><ExternalLink className="mr-1 inline h-3 w-3" />Mở chat</a>
                      <button onClick={() => copyActivation(target)} className="rounded-lg border border-emerald-400/20 px-2 py-1 text-[10px] text-emerald-200"><Clipboard className="mr-1 inline h-3 w-3" />{copied === target.target_id ? 'Đã copy' : 'Copy Join'}</button>
                      <button onClick={() => removeTarget(target)} disabled={busy === target.target_id} className="rounded-lg border border-rose-400/15 px-2 py-1 text-[10px] text-rose-300"><Trash2 className="inline h-3 w-3" /></button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input value={chatgptAdd} onChange={event => setChatgptAdd(event.target.value)} placeholder="Dán thêm ChatGPT URL" className="min-w-0 flex-1 rounded-xl border border-emerald-400/15 bg-slate-950/80 px-3 py-2 text-[11px] text-white outline-none" />
                <button onClick={() => addMany('chatgpt')} disabled={!chatgptAdd.trim() || busy === 'chatgpt'} className="rounded-xl bg-emerald-500 px-3 text-slate-950 disabled:opacity-40"><Plus className="h-4 w-4" /></button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-400/20 bg-amber-950/15 p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-black text-amber-100"><Send className="h-4 w-4 text-amber-300" /> GỬI TASK VÀO ĐÚNG APP / CHAT</div>
            {allTargets.length ? (
              <div className="flex flex-col gap-2 lg:flex-row">
                <select value={taskTarget} onChange={event => setTaskTarget(event.target.value)} className="rounded-xl border border-amber-400/15 bg-slate-950 px-3 py-2.5 text-xs text-white lg:max-w-[320px]">
                  {allTargets.map(target => <option key={target.target_id} value={target.target_id}>{target.provider === 'chatgpt' ? '🟢 ChatGPT' : '🔵 Studio'} · {target.label} · {shortId(target.resource_id)}</option>)}
                </select>
                <input value={taskText} onChange={event => setTaskText(event.target.value)} placeholder="Việc cần làm..." className="min-w-0 flex-1 rounded-xl border border-amber-400/15 bg-slate-950/80 px-3 py-2.5 text-xs text-white outline-none focus:border-amber-400/50" />
                <button onClick={createBoundTask} disabled={!taskText.trim() || busy === 'task'} className="rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-black text-slate-950 disabled:opacity-40"><Send className="mr-1 inline h-4 w-4" />{busy === 'task' ? 'Đang gửi...' : 'Tạo task'}</button>
              </div>
            ) : <div className="text-xs text-amber-100/60">Thêm ít nhất một Studio/ChatGPT URL trước.</div>}
          </div>
        </div>
      )}

      {feedback && (
        <div className={`mt-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${feedback.startsWith('Lỗi:') ? 'border-rose-400/20 bg-rose-500/10 text-rose-200' : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'}`}>
          {feedback.startsWith('Lỗi:') ? <Link2 className="h-4 w-4" /> : <Check className="h-4 w-4" />}{feedback}
        </div>
      )}
    </section>
  );
};
