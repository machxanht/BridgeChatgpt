import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleOff, Clock3, MonitorCog, Play, RefreshCw, Terminal, XCircle } from 'lucide-react';

interface ExecutorNode {
  node_id: string;
  name: string;
  workspace_id: string;
  project_id: string;
  root_label: string;
  platform: string;
  capabilities: string[];
  connection_status: 'online' | 'offline';
  last_seen_at: string;
}

interface ExecutorJob {
  job_id: string;
  node_id: string | null;
  workspace_id: string;
  project_id: string;
  task_id: string | null;
  action: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  result: Record<string, any> | null;
  error: string | null;
}

interface ResourceWorkspace {
  workspace_id: string;
  project_id: string;
  project_name: string;
}

const ACTIVE_WORKSPACE_KEY = 'bridge.resource.activeWorkspace';

function readActiveWorkspace() {
  try { return window.localStorage.getItem(ACTIVE_WORKSPACE_KEY) || ''; } catch { return ''; }
}

function shortTime(value?: string | null) {
  if (!value) return '—';
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '—';
  return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function statusIcon(status: ExecutorJob['status']) {
  if (status === 'completed') return <CheckCircle2 className="size-3.5 text-gpt" />;
  if (status === 'failed') return <XCircle className="size-3.5 text-destructive" />;
  if (status === 'running') return <RefreshCw className="size-3.5 animate-spin text-studio" />;
  if (status === 'cancelled') return <CircleOff className="size-3.5 text-muted-foreground" />;
  return <Clock3 className="size-3.5 text-warn" />;
}

export const LocalExecutorPanel: React.FC = () => {
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(readActiveWorkspace);
  const [workspace, setWorkspace] = useState<ResourceWorkspace | null>(null);
  const [nodes, setNodes] = useState<ExecutorNode[]>([]);
  const [jobs, setJobs] = useState<ExecutorJob[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      setActiveWorkspaceId(detail.workspace_id || readActiveWorkspace());
    };
    window.addEventListener('bridge:active-project-changed', handle as EventListener);
    return () => window.removeEventListener('bridge:active-project-changed', handle as EventListener);
  }, []);

  const load = useCallback(async () => {
    try {
      const registryResponse = await fetch('/api/resource-registry', { cache: 'no-store' });
      if (!registryResponse.ok) throw new Error('Resource Registry unavailable');
      const registry = await registryResponse.json();
      const workspaces: ResourceWorkspace[] = registry.workspaces || [];
      const wanted = activeWorkspaceId || readActiveWorkspace();
      const current = workspaces.find(item => item.workspace_id === wanted) || workspaces[0] || null;
      setWorkspace(current);
      if (!current) {
        setNodes([]);
        setJobs([]);
        return;
      }
      if (current.workspace_id !== activeWorkspaceId) setActiveWorkspaceId(current.workspace_id);
      const executorResponse = await fetch(`/api/executors/snapshot?workspace_id=${encodeURIComponent(current.workspace_id)}&project_id=${encodeURIComponent(current.project_id)}&limit=30`, { cache: 'no-store' });
      if (!executorResponse.ok) throw new Error('Local Executor API unavailable');
      const snapshot = await executorResponse.json();
      setNodes(snapshot.nodes || []);
      setJobs(snapshot.jobs || []);
      setError('');
    } catch (err: any) {
      setError(err?.message || 'Could not load Local Executor state');
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 4000);
    return () => window.clearInterval(timer);
  }, [load]);

  const onlineNode = useMemo(() => nodes.find(node => node.connection_status === 'online') || null, [nodes]);

  const queue = async (action: 'git.status' | 'git.diff' | 'npm.test' | 'npm.build') => {
    if (!workspace) return;
    setBusy(action);
    setError('');
    try {
      const response = await fetch('/api/executors/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspace.workspace_id,
          project_id: workspace.project_id,
          node_id: onlineNode?.node_id || undefined,
          action,
          payload: {},
          created_by: 'human',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not queue executor job');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not queue executor job');
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="mb-3 rounded-xl border border-border bg-surface p-3 shadow-panel">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-surface-2 text-human"><MonitorCog className="size-4" /></span>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">Local Executor</div>
          <div className="text-[10.5px] text-muted-foreground">PC worker for {workspace?.project_name || 'active project'}</div>
        </div>
        <div className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-[10.5px] text-muted-foreground">
          <span className={`size-1.5 rounded-full ${onlineNode ? 'animate-pulse-dot bg-gpt' : 'bg-muted-foreground'}`} />
          {onlineNode ? `${onlineNode.name} online` : nodes.length ? 'PC offline' : 'PC unbound'}
        </div>
      </div>

      {onlineNode && (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-background/40 px-2.5 py-2 text-[11px]"><span className="text-muted-foreground">Node</span><div className="mt-0.5 truncate font-medium">{onlineNode.name}</div></div>
          <div className="rounded-lg border border-border bg-background/40 px-2.5 py-2 text-[11px]"><span className="text-muted-foreground">Root</span><div className="mt-0.5 truncate font-medium">{onlineNode.root_label}</div></div>
          <div className="rounded-lg border border-border bg-background/40 px-2.5 py-2 text-[11px]"><span className="text-muted-foreground">Last seen</span><div className="mt-0.5 font-medium">{shortTime(onlineNode.last_seen_at)}</div></div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        {([
          ['git.status', 'Git status'],
          ['git.diff', 'Git diff'],
          ['npm.test', 'npm test'],
          ['npm.build', 'npm build'],
        ] as const).map(([action, label]) => {
          const supported = onlineNode?.capabilities.includes(action) ?? false;
          return (
            <button
              key={action}
              disabled={!onlineNode || !supported || Boolean(busy)}
              onClick={() => queue(action)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface-2/50 px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
              title={!onlineNode ? 'Connect a PC worker first' : !supported ? 'Enable this capability on the PC web app' : `Queue ${label}`}
            >
              {busy === action ? <RefreshCw className="size-3 animate-spin" /> : <Play className="size-3" />}
              {label}
            </button>
          );
        })}
      </div>

      {error && <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">{error}</div>}

      <div className="mt-3 overflow-hidden rounded-lg border border-border">
        <div className="flex items-center gap-2 border-b border-border bg-background/40 px-2.5 py-2 text-[10.5px] font-medium text-muted-foreground">
          <Terminal className="size-3.5" /> Recent PC jobs
        </div>
        {jobs.length === 0 ? (
          <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">No Local Executor jobs yet.</div>
        ) : (
          <div className="thin-scrollbar max-h-56 overflow-y-auto">
            {jobs.slice(0, 12).map(job => {
              const output = String(job.result?.stdout || job.result?.stderr || job.error || '').trim();
              return (
                <div key={job.job_id} className="border-b border-border/70 px-2.5 py-2 last:border-0">
                  <div className="flex min-w-0 items-center gap-2 text-[11px]">
                    {statusIcon(job.status)}
                    <span className="font-medium text-foreground">{job.action}</span>
                    <span className="truncate text-muted-foreground">{job.job_id}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{shortTime(job.completed_at || job.started_at || job.created_at)}</span>
                  </div>
                  {output && <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap rounded-md bg-background/70 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">{output.slice(-5000)}</pre>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
