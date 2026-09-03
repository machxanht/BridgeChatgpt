import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ExternalLink,
  GitBranch,
  Github,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  TriangleAlert,
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
  try { window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, value); } catch { /* local preference only */ }
}

function shortRepo(url: string) {
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

function splitUrls(value: string) {
  return value.split(/[\n,]+/).map(item => item.trim()).filter(Boolean);
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-input bg-background px-3 text-[13px] text-foreground outline-none transition-shadow placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}

function SessionChip({ target, tone }: { target: ResourceTarget; tone: 'gpt' | 'studio' }) {
  const active = target.connection_status === 'active';
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface-2/50 px-2.5 py-1.5">
      <span className={`size-1.5 shrink-0 rounded-full ${active ? 'animate-pulse-dot' : ''} ${tone === 'gpt' ? 'bg-gpt' : 'bg-studio'}`} />
      <div className="min-w-0">
        <div className="truncate text-[12px] font-medium leading-tight">{targetName(target)}</div>
        <div className="truncate text-[10px] leading-tight text-muted-foreground" title={target.resource_id}>
          {tone === 'gpt' ? 'ChatGPT' : 'AI Studio'} · {active ? 'active' : target.connection_status}
        </div>
      </div>
      <a
        href={target.resource_url}
        target="_blank"
        rel="noreferrer"
        className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        aria-label={`Open ${tone === 'gpt' ? 'ChatGPT' : 'AI Studio'}`}
      >
        <ExternalLink className="size-3.5" />
      </a>
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-warn/25 bg-warn/8 px-2.5 py-1.5 text-[12px] font-medium text-warn">
      <TriangleAlert className="size-3.5 shrink-0" />
      <span className="truncate">{children}</span>
    </div>
  );
}

export const ProjectRouterV2: React.FC = () => {
  const [snapshot, setSnapshot] = useState<ResourceSnapshot | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(readActiveWorkspace);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState('');

  const [newName, setNewName] = useState('');
  const [newRepo, setNewRepo] = useState('');
  const [newStudio, setNewStudio] = useState('');
  const [newChatgpt, setNewChatgpt] = useState('');

  const [draftName, setDraftName] = useState('');
  const [draftRepo, setDraftRepo] = useState('');
  const [draftBranch, setDraftBranch] = useState('main');
  const [draftTargets, setDraftTargets] = useState<DraftTarget[]>([]);

  const selectWorkspace = (workspaceId: string, projectId?: string, announce = true) => {
    setActiveWorkspaceId(workspaceId);
    writeActiveWorkspace(workspaceId);
    setEditing(false);
    setFeedback('');
    if (announce) {
      window.dispatchEvent(new CustomEvent('bridge:active-project-changed', { detail: { workspace_id: workspaceId, project_id: projectId || '' } }));
    }
  };

  const load = async () => {
    try {
      const response = await fetch('/api/resource-registry', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      const next: ResourceSnapshot = {
        workspaces: data.workspaces || [],
        server_time: data.server_time || new Date().toISOString(),
      };
      setSnapshot(next);
      const stored = readActiveWorkspace();
      const wanted = stored || activeWorkspaceId;
      const valid = next.workspaces.some(item => item.workspace_id === wanted);
      if (!valid && next.workspaces[0]) selectWorkspace(next.workspaces[0].workspace_id, next.workspaces[0].project_id, false);
    } catch {
      // Keep previous registry snapshot while polling retries.
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
      for (const url of splitUrls(newStudio)) await upsertTarget(workspace.workspace_id, url, 'AI Studio Main');
      for (const url of splitUrls(newChatgpt)) await upsertTarget(workspace.workspace_id, url, 'ChatGPT Main');
      setNewName(''); setNewRepo(''); setNewStudio(''); setNewChatgpt('');
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
      const preserved = new Set<string>();
      for (const draft of draftTargets.filter(item => item.resource_url.trim())) {
        const old = draft.target_id ? oldTargets.find(item => item.target_id === draft.target_id) : undefined;
        const created = await upsertTarget(current.workspace_id, draft.resource_url.trim(), draft.label.trim() || undefined);
        if (old && old.resource_url === created.resource_url) preserved.add(old.target_id);
        if (old && old.target_id !== created.target_id) await removeTarget(old.target_id);
      }
      for (const old of oldTargets) {
        const stillPresent = draftTargets.some(draft => draft.target_id === old.target_id && draft.resource_url.trim());
        if (!stillPresent && !preserved.has(old.target_id)) await removeTarget(old.target_id);
      }

      await load();
      setEditing(false);
      setFeedback('✓ Đã lưu project + session');
    } catch (error: any) {
      setFeedback(`Lỗi: ${error?.message || 'không lưu được thay đổi'}`);
    } finally {
      setBusy('');
    }
  };

  const openStack = () => {
    if (!current) return;
    const urls = [current.chatgpt_targets[0]?.resource_url, current.studio_targets[0]?.resource_url].filter(Boolean) as string[];
    urls.forEach((url, index) => window.setTimeout(() => window.open(url, '_blank', 'noopener,noreferrer'), index * 220));
  };

  const addDraftTarget = (provider: DraftTarget['provider']) => {
    setDraftTargets(items => [...items, { provider, label: provider === 'chatgpt' ? 'ChatGPT Main' : 'AI Studio Main', resource_url: '' }]);
  };

  const updateDraftTarget = (index: number, patch: Partial<DraftTarget>) => {
    setDraftTargets(items => items.map((item, i) => i === index ? { ...item, ...patch } : item));
  };

  return (
    <section className="shrink-0 border-b border-border bg-background/60">
      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-3 py-2 sm:px-4">
        {(snapshot?.workspaces || []).map(workspace => {
          const active = workspace.workspace_id === current?.workspace_id;
          return (
            <button
              key={workspace.workspace_id}
              onClick={() => selectWorkspace(workspace.workspace_id, workspace.project_id)}
              className={`group inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition-all duration-200 ${active ? 'border-gpt/40 bg-gpt/10 text-gpt ring-2 ring-gpt/15' : 'border-border bg-surface text-muted-foreground hover:bg-surface-2 hover:text-foreground'}`}
            >
              <span className={`size-1.5 rounded-full ${active ? 'animate-pulse-dot bg-gpt' : 'bg-muted-foreground/50'}`} />
              <span className="max-w-40 truncate">{workspace.project_name}</span>
              {active && <span className="rounded-full bg-gpt/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.12em]">ACTIVE</span>}
            </button>
          );
        })}

        <button
          onClick={() => setShowCreate(value => !value)}
          className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-dashed px-3 text-[13px] transition-colors ${showCreate ? 'border-human/50 bg-human/10 text-human' : 'border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground'}`}
        >
          <Plus className={`size-4 transition-transform duration-200 ${showCreate ? 'rotate-45' : ''}`} />
          <span className="hidden sm:inline">Add Project</span>
        </button>
      </div>

      {showCreate && (
        <div className="mx-3 mb-2 animate-rise rounded-xl border border-border bg-surface p-3 shadow-panel sm:mx-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Project name" value={newName} onChange={setNewName} />
            <Field label="GitHub repo URL" value={newRepo} onChange={setNewRepo} />
            <Field label="AI Studio URL" value={newStudio} onChange={setNewStudio} />
            <Field label="ChatGPT conversation URL" value={newChatgpt} onChange={setNewChatgpt} />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] text-muted-foreground hover:bg-surface-2 hover:text-foreground">
              <X className="size-3.5" /> Cancel
            </button>
            <button disabled={!newRepo.trim() || busy === 'create'} onClick={createProject} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground disabled:opacity-40">
              <Check className="size-3.5" /> Save
            </button>
          </div>
        </div>
      )}

      {current && (
        <div className="px-3 pb-2 sm:px-4">
          <div className="rounded-xl border border-border bg-surface p-2.5 shadow-panel">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted-foreground"><Github className="size-4" /></span>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold leading-tight">{current.project_name}</div>
                  <div className="flex min-w-0 items-center gap-1 text-[11px] leading-tight text-muted-foreground">
                    <GitBranch className="size-3 shrink-0" />
                    <span className="shrink-0">{current.branch || 'main'}</span>
                    <span className="truncate">· {shortRepo(current.repository_url)}</span>
                  </div>
                </div>
              </div>

              <div className="col-span-2 grid gap-2 sm:grid-cols-2 lg:col-span-2 lg:contents">
                {current.studio_targets[0] ? <SessionChip target={current.studio_targets[0]} tone="studio" /> : <Warn>Bind AI Studio workspace</Warn>}
                {current.chatgpt_targets[0] ? <SessionChip target={current.chatgpt_targets[0]} tone="gpt" /> : <Warn>Bind ChatGPT conversation</Warn>}
              </div>

              <div className="flex items-center justify-end gap-1">
                <button onClick={() => setEditing(value => !value)} title="Edit" className={`grid size-9 place-items-center rounded-lg transition-colors ${editing ? 'bg-surface-2 text-foreground' : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'}`}><Pencil className="size-4" /></button>
                <button onClick={openStack} title="Open stack" className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"><Layers className="size-4" /></button>
                <button title="More" className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"><MoreHorizontal className="size-4" /></button>
              </div>
            </div>

            {editing && (
              <div className="mt-2.5 animate-rise border-t border-border pt-2.5">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Project name" value={draftName} onChange={setDraftName} />
                  <Field label="Repo URL" value={draftRepo} onChange={setDraftRepo} />
                  <Field label="Branch" value={draftBranch} onChange={setDraftBranch} />
                  {draftTargets.map((target, index) => (
                    <React.Fragment key={`${target.target_id || 'new'}-${index}`}>
                      <Field label={`${target.provider === 'chatgpt' ? 'ChatGPT' : 'Studio'} label`} value={target.label} onChange={value => updateDraftTarget(index, { label: value })} />
                      <Field label={`${target.provider === 'chatgpt' ? 'ChatGPT' : 'Studio'} URL`} value={target.resource_url} onChange={value => updateDraftTarget(index, { resource_url: value })} />
                    </React.Fragment>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={() => addDraftTarget('google-ai-studio')} className="rounded-lg border border-border bg-surface-2/50 px-2.5 py-1.5 text-[11px] text-studio">+ Studio session</button>
                  <button onClick={() => addDraftTarget('chatgpt')} className="rounded-lg border border-border bg-surface-2/50 px-2.5 py-1.5 text-[11px] text-gpt">+ ChatGPT session</button>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                  {feedback && <span className={`mr-auto text-[11px] ${feedback.startsWith('Lỗi:') ? 'text-destructive' : 'text-gpt'}`}>{feedback}</span>}
                  <button onClick={() => setEditing(false)} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] text-muted-foreground hover:bg-surface-2 hover:text-foreground"><X className="size-3.5" /> Cancel</button>
                  <button disabled={busy === 'save'} onClick={saveProject} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground disabled:opacity-40"><Check className="size-3.5" /> Save</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!editing && feedback && <div className={`px-4 pb-2 text-[11px] ${feedback.startsWith('Lỗi:') ? 'text-destructive' : 'text-gpt'}`}>{feedback}</div>}
    </section>
  );
};
