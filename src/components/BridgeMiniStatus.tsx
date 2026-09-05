import React, { useEffect, useMemo, useState } from 'react';
import { Brain, Boxes, Terminal } from 'lucide-react';
import type { Task, WorkspaceState } from '../types.js';

interface ResourceTarget {
  target_id: string;
  provider: 'chatgpt' | 'google-ai-studio';
  workspace_id: string;
  project_id: string;
  connection_status: 'registered' | 'active' | 'idle' | 'offline';
}

interface ResourceWorkspace {
  workspace_id: string;
  project_id: string;
  studio_targets: ResourceTarget[];
  chatgpt_targets: ResourceTarget[];
}

interface ExecutorNode {
  node_id: string;
  workspace_id: string;
  project_id: string;
  connection_status: 'online' | 'offline';
}

const ACTIVE_WORKSPACE_KEY = 'bridge.resource.activeWorkspace';
const BINDING_START = '<!-- BRIDGE_TASK_BINDING_V1';
const BINDING_END = 'BRIDGE_TASK_BINDING_V1 -->';

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
    };
  } catch {
    return null;
  }
}

function targetStatus(target?: ResourceTarget) {
  if (!target) return 'unbound';
  if (target.connection_status === 'active') return 'active';
  if (target.connection_status === 'offline') return 'offline';
  if (target.connection_status === 'idle') return 'idle';
  return 'ready';
}

function taskProgress(task: Task | null) {
  if (!task) return 0;
  if (task.status === 'pending') return 8;
  if (task.status === 'assigned') return 18;
  if (task.status === 'working') return 58;
  if (task.status === 'blocked') return 60;
  if (task.status === 'review') return 86;
  return 100;
}

export const BridgeMiniStatus: React.FC<{ state: WorkspaceState }> = ({ state }) => {
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(readActiveWorkspace);
  const [workspace, setWorkspace] = useState<ResourceWorkspace | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [executorNodes, setExecutorNodes] = useState<ExecutorNode[]>([]);

  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      setActiveWorkspaceId(detail.workspace_id || readActiveWorkspace());
    };
    window.addEventListener('bridge:active-project-changed', handle as EventListener);
    return () => window.removeEventListener('bridge:active-project-changed', handle as EventListener);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const registryResponse = await fetch('/api/resource-registry', { cache: 'no-store' });
        if (cancelled || !registryResponse.ok) return;
        const registry = await registryResponse.json();
        const workspaces: ResourceWorkspace[] = registry.workspaces || [];
        const wanted = activeWorkspaceId || readActiveWorkspace();
        const current = workspaces.find(item => item.workspace_id === wanted) || workspaces[0] || null;
        setWorkspace(current);
        if (current && current.workspace_id !== activeWorkspaceId) setActiveWorkspaceId(current.workspace_id);

        const taskPromise = fetch('/api/tasks?limit=300', { cache: 'no-store' });
        const executorPromise = current
          ? fetch(`/api/executors/snapshot?workspace_id=${encodeURIComponent(current.workspace_id)}&project_id=${encodeURIComponent(current.project_id)}&limit=20`, { cache: 'no-store' })
          : Promise.resolve(null);
        const [taskResponse, executorResponse] = await Promise.all([taskPromise, executorPromise]);
        if (cancelled) return;
        if (taskResponse.ok) setTasks(await taskResponse.json());
        if (executorResponse?.ok) {
          const executorSnapshot = await executorResponse.json();
          setExecutorNodes(executorSnapshot.nodes || []);
        } else if (current) {
          setExecutorNodes([]);
        }
      } catch {
        // Keep the previous project status while polling retries.
      }
    };
    load();
    const timer = window.setInterval(load, 4500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeWorkspaceId]);

  const projectTasks = useMemo(() => {
    if (!workspace) return [];
    return tasks.filter(task => {
      const binding = parseBinding(task.description);
      return binding?.workspace_id === workspace.workspace_id && binding?.project_id === workspace.project_id;
    });
  }, [tasks, workspace]);

  const currentTask = useMemo(() => projectTasks
    .filter(task => !['completed', 'cancelled'].includes(task.status))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0] || null,
  [projectTasks]);

  const chatgpt = workspace?.chatgpt_targets[0];
  const studio = workspace?.studio_targets[0];
  const progress = taskProgress(currentTask);
  const executorState = executorNodes.some(node => node.connection_status === 'online')
    ? 'online'
    : executorNodes.length > 0 ? 'offline' : 'unbound';

  return (
    <div className="no-scrollbar flex shrink-0 items-center gap-3 overflow-x-auto border-y border-border bg-surface/40 px-3 py-1.5 text-[11.5px] sm:px-4">
      <span className="inline-flex shrink-0 items-center gap-1.5 text-muted-foreground">
        <Brain className="size-3.5 text-gpt" />
        <span className={`size-1.5 rounded-full ${chatgpt?.connection_status === 'active' ? 'animate-pulse-dot bg-gpt' : chatgpt?.connection_status === 'offline' || !chatgpt ? 'bg-muted-foreground' : 'bg-gpt/70'}`} />
        ChatGPT {targetStatus(chatgpt)}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-muted-foreground">
        <Boxes className="size-3.5 text-studio" />
        <span className={`size-1.5 rounded-full ${studio?.connection_status === 'active' ? 'animate-pulse-dot bg-studio' : studio?.connection_status === 'offline' || !studio ? 'bg-muted-foreground' : 'bg-studio/70'}`} />
        Studio {targetStatus(studio)}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-muted-foreground" title="Bridge Local Executor PC node">
        <Terminal className="size-3.5 text-human" />
        <span className={`size-1.5 rounded-full ${executorState === 'online' ? 'animate-pulse-dot bg-gpt' : 'bg-muted-foreground'}`} />
        PC {executorState}
      </span>

      {currentTask && (
        <span className="ml-auto inline-flex shrink-0 items-center gap-2 text-muted-foreground">
          <span className="font-medium text-foreground">{currentTask.id}</span>
          <span>· {currentTask.status}</span>
          <span className="relative h-1 w-20 overflow-hidden rounded-full bg-surface-2">
            <span className="absolute inset-y-0 left-0 rounded-full bg-studio transition-all duration-500" style={{ width: `${progress}%` }} />
          </span>
          <span className="tabular-nums">{progress}%</span>
        </span>
      )}

      {!workspace && (
        <span className="ml-auto text-[10px] text-muted-foreground/70">{state.project?.project_name || 'Bridge'}</span>
      )}
    </div>
  );
};
