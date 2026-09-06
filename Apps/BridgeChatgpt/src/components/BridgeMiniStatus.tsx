import React, { useEffect, useState } from 'react';
import { Brain, Boxes } from 'lucide-react';
import type { WorkspaceState } from '../types.js';

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

const ACTIVE_WORKSPACE_KEY = 'bridge.resource.activeWorkspace';
function readActiveWorkspace() {
  try { return window.localStorage.getItem(ACTIVE_WORKSPACE_KEY) || ''; } catch { return ''; }
}

function targetStatus(target?: ResourceTarget) {
  if (!target) return 'unbound';
  if (target.connection_status === 'active') return 'active';
  if (target.connection_status === 'offline') return 'offline';
  if (target.connection_status === 'idle') return 'idle';
  return 'ready';
}

export const BridgeMiniStatus: React.FC<{ state: WorkspaceState }> = ({ state }) => {
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(readActiveWorkspace);
  const [workspace, setWorkspace] = useState<ResourceWorkspace | null>(null);

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

  const chatgpt = workspace?.chatgpt_targets[0];
  const studio = workspace?.studio_targets[0];

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
      {!workspace && (
        <span className="ml-auto text-[10px] text-muted-foreground/70">{state.project?.project_name || 'Bridge'}</span>
      )}
    </div>
  );
};
