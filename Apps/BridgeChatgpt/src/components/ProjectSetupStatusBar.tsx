import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FolderGit2, MonitorCog, RefreshCw, TriangleAlert } from 'lucide-react';

type SetupStatus = 'ready' | 'queued' | 'waiting_for_pc' | 'failed' | 'not_required';

interface WorkspaceSetupView {
  workspace_id: string;
  project_id: string;
  project_name: string;
  local_path: string;
  pc_setup_status: SetupStatus;
  pc_setup_job_id: string | null;
  pc_setup_error: string | null;
}

const ACTIVE_WORKSPACE_KEY = 'bridge.resource.activeWorkspace';

function activeWorkspaceId() {
  try { return window.localStorage.getItem(ACTIVE_WORKSPACE_KEY) || ''; } catch { return ''; }
}

function statusMeta(status: SetupStatus) {
  if (status === 'ready' || status === 'not_required') {
    return { label: 'Ready', icon: CheckCircle2, tone: 'text-gpt border-gpt/25 bg-gpt/8' };
  }
  if (status === 'queued') {
    return { label: 'Setting up', icon: RefreshCw, tone: 'text-studio border-studio/25 bg-studio/8' };
  }
  if (status === 'failed') {
    return { label: 'Setup failed', icon: TriangleAlert, tone: 'text-destructive border-destructive/25 bg-destructive/8' };
  }
  return { label: 'Waiting for PC', icon: MonitorCog, tone: 'text-warn border-warn/25 bg-warn/8' };
}

export const ProjectSetupStatusBar: React.FC = () => {
  const [workspaces, setWorkspaces] = useState<WorkspaceSetupView[]>([]);
  const [activeId, setActiveId] = useState(activeWorkspaceId);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/resource-registry', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      setWorkspaces(data.workspaces || []);
      setActiveId(activeWorkspaceId());
    } catch {
      // Keep the last known setup state while polling retries.
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 10_000);
    const onProjectChanged = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      setActiveId(detail.workspace_id || activeWorkspaceId());
      void load();
    };
    window.addEventListener('bridge:active-project-changed', onProjectChanged as EventListener);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('bridge:active-project-changed', onProjectChanged as EventListener);
    };
  }, [load]);

  const current = useMemo(() => {
    return workspaces.find(item => item.workspace_id === activeId) || workspaces[0] || null;
  }, [workspaces, activeId]);

  if (!current) return null;

  const meta = statusMeta(current.pc_setup_status);
  const Icon = meta.icon;
  const canRetry = current.pc_setup_status === 'waiting_for_pc' || current.pc_setup_status === 'failed';

  const retry = async () => {
    if (busy || !canRetry) return;
    setBusy(true);
    try {
      await fetch(`/api/resource-registry/projects/${encodeURIComponent(current.workspace_id)}/setup`, { method: 'POST' });
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed bottom-3 right-3 z-[70] max-w-[calc(100vw-1.5rem)] sm:bottom-4 sm:right-4">
      <div className="flex max-w-md items-center gap-2 rounded-xl border border-border bg-surface/95 px-3 py-2 shadow-panel backdrop-blur">
        <FolderGit2 className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <div className="truncate text-[11.5px] font-medium text-foreground">{current.local_path}</div>
          <div className="truncate text-[10px] text-muted-foreground">Local project · {current.project_name}</div>
        </div>
        <div className={`ml-1 inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium ${meta.tone}`} title={current.pc_setup_error || undefined}>
          <Icon className={`size-3 ${current.pc_setup_status === 'queued' ? 'animate-spin' : ''}`} />
          {meta.label}
        </div>
        {canRetry && (
          <button
            onClick={retry}
            disabled={busy}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-border bg-background/70 px-2 text-[10px] font-medium text-foreground disabled:opacity-40"
          >
            <RefreshCw className={`size-3 ${busy ? 'animate-spin' : ''}`} />
            {current.pc_setup_status === 'failed' ? 'Retry' : 'Setup on PC'}
          </button>
        )}
      </div>
    </div>
  );
};
