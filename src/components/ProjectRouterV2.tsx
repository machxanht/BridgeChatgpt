import React, { useEffect, useMemo, useState } from 'react';
import {
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
  ExternalLink,
  FolderGit2,
  GitBranch,
  Layers3,
  Pencil,
  Plus,
  Rocket,
  Save,
  Trash2,
  X,
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
  session_label?: string | null;
  account_label?: string | null;
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

interface DraftTarget {
  target_id?: string;
  provider: 'chatgpt' | 'google-ai-studio';
  label: string;
  resource_url: string;
}

const ACTIVE_WORKSPACE_KEY = 'bridge.resource.activeWorkspace';

function readActiveWorkspace() {
  try { return window.localStorage.getItem(ACTIVE_WORKSPACE_KEY) || ''; } catch { return ''; }
}

function writeActiveWorkspace(value: string) {
  try { window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, value); } catch { /* optional local preference */ }
}

function repoName(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/^\//, '').replace(/\.git$/i, '') || url;
  } catch {
    return url;
  }
}

function targetName(target: ResourceTarget) {
  return target.session_label?.trim() || target.label?.trim() || `${target.provider === 'chatgpt' ? 'ChatGPT' : 'AI Studio'} ${target.resource_id.slice(0, 8)}`;
}

function statusText(target: ResourceTarget) {
  if (target.provider === 'chatgpt') return target.connection_status === 'active' ? 'ACTIVE' : 'SAVED';
  if (target.connection_status === 'active') return 'ACTIVE';
  if (target.connection_status === 'idle') return 'IDLE';
  if (target.connection_status === 'offline') return 'OFFLINE';
  return 'SAVED';
}

function splitUrls(value: string) {
  return value.split(/[\n,]+/).map(item => item.trim()).filter(Boolean);
}

export const ProjectRouterV2: React.FC = () => {
  const [snapshot, setSnapshot] = useState<ResourceSnapshot | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(readActiveWorkspace);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState('');

  const [newRepo, setNewRepo] = useState('');
  const [newName, setNewName] = useState('');
  const [newStudio, setNewStudio] = useState('');
  const [newChatgpt, setNewChatgpt] = useState('');

  const [draftName, setDraftName] = useState('');
  const [draftRepo, setDraftRepo] = useState('');
  const [draftBranch, setDraftBranch] = useState('main');
  const [draftTargets, setDraftTargets] = useState<DraftTarget[]>([]);

  const load = async () => {
    try {
      const response = await fetch('/api/resource-registry', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      const next: ResourceSnapshot = { workspaces: data.workspaces || [], server_time: data.server_time || new Date().toISOString() };
      setSnapshot(next);
      const stored = readActiveWorkspace();
      const valid = next.workspaces.some(item => item.workspace_id === (stored || activeWorkspaceId));
      if (!valid && next.workspaces[0]) selectWorkspace(next.workspaces[0].workspace_id, next.workspaces[0].project_id, false);
    } catch {
      // Mission Control stays usable while registry retries.
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const current = useMemo(() => {
    const list = snapshot?.workspaces || [];
    return list.find(item => item.workspace_id === activeWorkspaceId) || list[0] || null;
  }, [snapshot, activeWorkspaceId]);

  const selectWorkspace = (workspaceId: string, projectId?: string, announce = true) => {
    setActiveWorkspaceId(workspaceId);
    writeActiveWorkspace(workspaceId);
    setEditing(false);
    setFeedback('');
    if (announce) {
      window.dispatchEvent(new CustomEvent('bridge:active-project-changed', { detail: { workspace_id: workspaceId, project_id: projectId || '' } }));
    }
  };

  useEffect(() => {
    if (!current) return;
    setDraftName(current.project_name);
    setDraftRepo(current.repository_url);
    setDraftBranch(current.branch || 'main');
    setDraftTargets([
      ...current.studio_targets.map(target => ({ target_id: target.target_id, provider: target.provider, label: targetName(target), resource_url: target.resource_url })),
      ...current.chatgpt_targets.map(target => ({ target_id: target.target_id, provider: target.provider, label: targetName(target), resource_url: target.resource_url })),
    ]);
  }, [current?.workspace_id, current?.repository_url, current?.studio_targets.length, current?.chatgpt_targets.length]);

  const upsertTarget = async (workspaceId: string, resourceUrl: string, label?: string) => {
    const response = await fetch('/api/resource-registry/targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: workspaceId, resource_url: resourceUrl, label }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Không lưu được session URL');
    return data.target as ResourceTarget;
  };

  const removeTarget = async (targetId: string) => {
    const response = await fetch(`/api/resource-registry/targets/${encodeURIComponent(targetId)}`, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Không xóa được session cũ');
    }
  };

  const createProject = async () => {
    if (!newRepo.trim()) return;
    setBusy('create');
    setFeedback('');
    try {
      const response = await fetch('/api/resource-registry/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repository_url: newRepo.trim(), project_name: newName.trim() || undefined }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Không tạo được project');
      const workspace = data.workspace as ResourceWorkspace;
      const studioUrls = splitUrls(newStudio);
      const chatUrls = splitUrls(newChatgpt);
      for (const url of studioUrls) await upsertTarget(workspace.workspace_id, url);
      for (const url of chatUrls) await upsertTarget(workspace.workspace_id, url);
      setNewRepo(''); setNewName(''); setNewStudio(''); setNewChatgpt('');
      setShowCreate(false);
      selectWorkspace(workspace.workspace_id, workspace.project_id);
      await load();
      setFeedback(`✓ Đã tạo ${workspace.project_name}`);
    } catch (error: any) {
      setFeedback(`Lỗi: ${error?.message || 'không tạo được project'}`);
    } finally {
      setBusy('');
    }
  };

  const saveProject = async () => {
    if (!current || !draftRepo.trim() || !draftName.trim()) return;
    setBusy('save');
    setFeedback('');
    try {
      const projectResponse = await fetch('/api/resource-registry/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: current.workspace_id,
          project_id: current.project_id,
          project_name: draftName.trim(),
          repository_url: draftRepo.trim(),
          branch: draftBranch.trim() || 'main',
        }),
      });
      const projectData = await projectResponse.json().catch(() => ({}));
      if (!projectResponse.ok) throw new Error(projectData.error || 'Không lưu được project');

      const oldTargets = [...current.studio_targets, ...current.chatgpt_targets];
      const keptOldIds = new Set<string>();
      for (const draft of draftTargets.filter(item => item.resource_url.trim())) {
        const old = draft.target_id ? oldTargets.find(item => item.target_id === draft.target_id) : undefined;
        const created = await upsertTarget(current.workspace_id, draft.resource_url.trim(), draft.label.trim() || undefined);
        if (old && old.resource_url === created.resource_url) keptOldIds.add(old.target_id);
        if (old && old.target_id !== created.target_id) await removeTarget(old.target_id);
      }
      for (const old of oldTargets) {
        const stillPresent = draftTargets.some(draft => draft.target_id === old.target_id && draft.resource_url.trim());
        if (!stillPresent && !keptOldIds.has(old.target_id)) await removeTarget(old.target_id);
      }

      await load();
      setEditing(false);
      setFeedback('✓ Đã lưu thông tin project + session');
    } catch (error: any) {
      setFeedback(`Lỗi: ${error?.message || 'không lưu được thay đổi'}`);
    } finally {
      setBusy('');
    }
  };

  const openStack = () => {
    if (!current) return;
    const urls = [current.chatgpt_targets[0]?.resource_url, current.studio_targets[0]?.resource_url].filter(Boolean) as string[];
    urls.forEach((url, index) => window.setTimeout(() => window.open(url, '_blank', 'noopener,noreferrer'), index * 250));
  };

  const addDraftTarget = (provider: DraftTarget['provider']) => {
    setDraftTargets(items => [...items, { provider, label: provider === 'chatgpt' ? 'ChatGPT Main' : 'AI Studio Main', resource_url: '' }]);
  };

  const updateDraftTarget = (index: number, patch: Partial<DraftTarget>) => {
    setDraftTargets(items => items.map((item, i) => i === index ? { ...item, ...patch } : item));
  };

  const projectComplete = (workspace: ResourceWorkspace) => Boolean(workspace.repository_url && (workspace.studio_targets.length || workspace.chatgpt_targets.length));

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/75 shadow-2xl shadow-black/20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-violet-400/25 bg-violet-500/15">
            <Layers3 className="h-5 w-5 text-violet-200" />
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50" />
          </div>
          <div>
            <div className="text-sm font-black tracking-wide text-white">PROJECT ROUTER</div>
            <div className="text-[11px] text-slate-500">Chuyển project nhanh · giữ đúng repo + Studio + ChatGPT session</div>
          </div>
        </div>
        <button onClick={() => setShowCreate(value => !value)} className="inline-flex items-center gap-1.5 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-[11px] font-bold text-violet-100 hover:bg-violet-500/20">
          <Plus className="h-3.5 w-3.5" /> Thêm project {showCreate ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 py-3 sm:px-5">
        {(snapshot?.workspaces || []).map(workspace => {
          const selected = workspace.workspace_id === current?.workspace_id;
          const ready = projectComplete(workspace);
          return (
            <button key={workspace.workspace_id} onClick={() => selectWorkspace(workspace.workspace_id, workspace.project_id)} className={`min-w-[190px] rounded-2xl border px-3 py-2.5 text-left transition-all ${selected ? 'border-emerald-400/45 bg-emerald-500/12 shadow-lg shadow-emerald-950/25' : 'border-white/8 bg-black/20 hover:border-white/20 hover:bg-white/5'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-bold text-white">{workspace.project_name}</span>
                {selected ? <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[9px] font-black text-emerald-300">● ACTIVE</span> : ready ? <span className="h-2 w-2 rounded-full bg-emerald-500/70" /> : <span className="h-2 w-2 rounded-full bg-amber-500/70" />}
              </div>
              <div className="mt-1 truncate text-[10px] text-slate-500">{repoName(workspace.repository_url)}</div>
              <div className="mt-1.5 flex gap-1.5 text-[9px] text-slate-400"><span>◈ {workspace.studio_targets.length} Studio</span><span>● {workspace.chatgpt_targets.length} GPT</span></div>
            </button>
          );
        })}
      </div>

      {showCreate && (
        <div className="mx-4 mb-3 rounded-2xl border border-violet-400/20 bg-violet-950/15 p-3 sm:mx-5">
          <div className="grid gap-2 lg:grid-cols-3">
            <div className="space-y-2"><input value={newRepo} onChange={e => setNewRepo(e.target.value)} placeholder="1. Repo URL" className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-xs text-white outline-none focus:border-violet-400/40" /><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Tên project (tự lấy từ repo nếu trống)" className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-white outline-none" /></div>
            <textarea value={newStudio} onChange={e => setNewStudio(e.target.value)} rows={3} placeholder={'2. AI Studio URL\nMỗi URL một dòng'} className="resize-none rounded-xl border border-cyan-400/15 bg-cyan-950/10 px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-400/40" />
            <textarea value={newChatgpt} onChange={e => setNewChatgpt(e.target.value)} rows={3} placeholder={'3. ChatGPT URL\nMỗi URL một dòng'} className="resize-none rounded-xl border border-emerald-400/15 bg-emerald-950/10 px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-400/40" />
          </div>
          <div className="mt-2 flex justify-end"><button onClick={createProject} disabled={!newRepo.trim() || busy === 'create'} className="rounded-xl bg-violet-500 px-4 py-2 text-xs font-black text-white disabled:opacity-40">{busy === 'create' ? 'Đang lưu…' : 'Lưu project'}</button></div>
        </div>
      )}

      {current && (
        <div className="border-t border-white/8 bg-black/10 px-4 py-4 sm:px-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div><div className="flex items-center gap-2 text-base font-black text-white"><FolderGit2 className="h-4 w-4 text-emerald-300" /> {current.project_name}<span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[9px] text-emerald-300">ACTIVE</span></div><div className="mt-0.5 text-[10px] text-slate-500">{current.project_id}</div></div>
            <div className="flex gap-2"><button onClick={openStack} className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/20 px-2.5 py-1.5 text-[10px] font-bold text-cyan-200"><Rocket className="h-3 w-3" /> Mở stack</button><button onClick={() => setEditing(value => !value)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-bold text-slate-200"><Pencil className="h-3 w-3" /> {editing ? 'Đóng sửa' : 'Edit'}</button></div>
          </div>

          {!editing ? (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/55">
              <div className="grid grid-cols-[28px_72px_1fr_auto] items-center gap-2 border-b border-white/8 px-3 py-2.5"><FolderGit2 className="h-4 w-4 text-violet-300" /><span className="text-[10px] font-black text-slate-400">REPO</span><div className="min-w-0"><div className="truncate text-xs font-bold text-white">{repoName(current.repository_url)}</div><div className="flex items-center gap-1 text-[9px] text-slate-500"><GitBranch className="h-3 w-3" />{current.branch}</div></div><a href={current.repository_url} target="_blank" rel="noreferrer" className="rounded-lg border border-white/10 p-1.5 text-slate-300"><ExternalLink className="h-3.5 w-3.5" /></a></div>
              <div className="grid grid-cols-[28px_72px_1fr] items-start gap-2 border-b border-white/8 px-3 py-2.5"><Cpu className="mt-1 h-4 w-4 text-cyan-300" /><span className="mt-1 text-[10px] font-black text-cyan-200">STUDIO</span><div className="flex min-w-0 flex-wrap gap-1.5">{current.studio_targets.length ? current.studio_targets.map(target => <a key={target.target_id} href={target.resource_url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 rounded-lg border border-cyan-400/15 bg-cyan-400/5 px-2 py-1 text-[10px] text-cyan-100"><span className={`h-1.5 w-1.5 rounded-full ${target.connection_status === 'active' ? 'animate-pulse bg-emerald-400' : 'bg-slate-500'}`} /><span className="max-w-[180px] truncate">{targetName(target)}</span><span className="text-[8px] text-cyan-400/60">{statusText(target)}</span></a>) : <span className="text-[10px] text-slate-600">Chưa gắn</span>}</div></div>
              <div className="grid grid-cols-[28px_72px_1fr] items-start gap-2 px-3 py-2.5"><Brain className="mt-1 h-4 w-4 text-emerald-300" /><span className="mt-1 text-[10px] font-black text-emerald-200">CHATGPT</span><div className="flex min-w-0 flex-wrap gap-1.5">{current.chatgpt_targets.length ? current.chatgpt_targets.map(target => <a key={target.target_id} href={target.resource_url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 rounded-lg border border-emerald-400/15 bg-emerald-400/5 px-2 py-1 text-[10px] text-emerald-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" /><span className="max-w-[180px] truncate">{targetName(target)}</span></a>) : <span className="text-[10px] text-slate-600">Chưa gắn</span>}</div></div>
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/55 p-3">
              <div className="grid gap-2 md:grid-cols-3"><input value={draftName} onChange={e => setDraftName(e.target.value)} placeholder="Tên project" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white" /><input value={draftRepo} onChange={e => setDraftRepo(e.target.value)} placeholder="Repo URL" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white" /><input value={draftBranch} onChange={e => setDraftBranch(e.target.value)} placeholder="Branch" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white" /></div>
              <div className="space-y-2">{draftTargets.map((target, index) => <div key={`${target.target_id || 'new'}-${index}`} className="grid gap-2 rounded-xl border border-white/8 bg-black/20 p-2 md:grid-cols-[100px_180px_1fr_34px]"><div className={`flex items-center gap-1 text-[10px] font-black ${target.provider === 'chatgpt' ? 'text-emerald-300' : 'text-cyan-300'}`}>{target.provider === 'chatgpt' ? <Brain className="h-3.5 w-3.5" /> : <Cpu className="h-3.5 w-3.5" />}{target.provider === 'chatgpt' ? 'CHATGPT' : 'STUDIO'}</div><input value={target.label} onChange={e => updateDraftTarget(index, { label: e.target.value })} placeholder="Tên session" className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[10px] text-white" /><input value={target.resource_url} onChange={e => updateDraftTarget(index, { resource_url: e.target.value })} placeholder="Session/App URL" className="min-w-0 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[10px] text-white" /><button onClick={() => setDraftTargets(items => items.filter((_, i) => i !== index))} className="flex items-center justify-center rounded-lg border border-rose-400/15 text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>
              <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex gap-2"><button onClick={() => addDraftTarget('google-ai-studio')} className="rounded-lg border border-cyan-400/20 px-2 py-1 text-[10px] text-cyan-200">+ Studio</button><button onClick={() => addDraftTarget('chatgpt')} className="rounded-lg border border-emerald-400/20 px-2 py-1 text-[10px] text-emerald-200">+ ChatGPT</button></div><div className="flex gap-2"><button onClick={() => setEditing(false)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-[10px] text-slate-300"><X className="h-3 w-3" /> Hủy</button><button onClick={saveProject} disabled={busy === 'save'} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-[10px] font-black text-slate-950 disabled:opacity-40"><Save className="h-3 w-3" /> {busy === 'save' ? 'Đang lưu…' : 'Save'}</button></div></div>
            </div>
          )}
        </div>
      )}

      {feedback && <div className={`mx-4 mb-3 flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[10px] sm:mx-5 ${feedback.startsWith('Lỗi:') ? 'border-rose-400/20 bg-rose-500/10 text-rose-200' : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'}`}>{feedback.startsWith('Lỗi:') ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />}{feedback}</div>}
    </section>
  );
};
