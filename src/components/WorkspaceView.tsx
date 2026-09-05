import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Boxes, ChevronUp, Folder, Github, Settings2 } from 'lucide-react';
import type {
  AgentOperationalStatus,
  Finding,
  TargetAgentType,
  Task,
  WorkspaceState,
} from '../types.js';
import { MissionControlView } from './MissionControlView.js';
import { ProjectRouterV2 } from './ProjectRouterV2.js';
import { BridgeChatPanel } from './BridgeChatPanel.js';
import { BridgeMiniStatus } from './BridgeMiniStatus.js';
import { LocalExecutorPanel } from './LocalExecutorPanel.js';

interface WorkspaceViewProps {
  state: WorkspaceState;
  onUpdateGoal: (newGoal: string) => Promise<void>;
  onSetAgentStatus: (agent: 'chatgpt' | 'gemini' | 'human', status: AgentOperationalStatus) => void;
  onOpenTaskModal: (task?: Task) => void;
  onOpenFindingModal: (finding?: Finding) => void;
  onSelectTask: (task: Task) => void;
  onSelectFinding: (finding: Finding) => void;
  onSendCommand: (command: string, targetAgent: TargetAgentType) => Promise<void>;
  onTriggerAutoReviewCycle: () => Promise<void>;
  isAutoReviewing: boolean;
  onSeedSampleScenario: () => Promise<void>;
  onPauseAll: () => Promise<void>;
  onResumeAll: () => Promise<void>;
  onStopAgent: (agent: string) => Promise<void>;
  onCancelTask: (taskId?: string) => Promise<void>;
  onOpenAdvancedTab: (tab: string) => void;
}

interface OverviewTarget {
  resource_url?: string;
  connection_status?: string;
}

interface OverviewWorkspace {
  workspace_id: string;
  project_name: string;
  repository_url: string;
  branch: string;
  chatgpt_targets?: OverviewTarget[];
  studio_targets?: OverviewTarget[];
}

function shortRepo(url: string) {
  try {
    return new URL(url).pathname.replace(/^\//, '').replace(/\.git$/i, '') || url;
  } catch {
    return url;
  }
}

function OverviewCard({
  icon,
  label,
  title,
  subtitle,
  tone,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  subtitle: string;
  tone: 'project' | 'repo' | 'gpt' | 'studio';
  badge?: number;
}) {
  const toneClass = tone === 'project'
    ? 'border-violet-500/35 bg-violet-500/8'
    : tone === 'gpt'
      ? 'border-gpt/30 bg-gpt/8'
      : tone === 'studio'
        ? 'border-studio/30 bg-studio/8'
        : 'border-border bg-surface/70';
  const iconClass = tone === 'project' ? 'text-violet-400' : tone === 'gpt' ? 'text-gpt' : tone === 'studio' ? 'text-studio' : 'text-muted-foreground';

  return (
    <div className={`min-w-0 rounded-2xl border px-4 py-3 shadow-panel ${toneClass}`}>
      <div className={`flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] ${iconClass}`}>
        {icon}
        <span>{label}</span>
        {typeof badge === 'number' && (
          <span className="ml-auto rounded-full bg-background/45 px-2 py-0.5 text-[9px]">{badge}</span>
        )}
      </div>
      <div className="mt-2 truncate text-[13px] font-semibold text-foreground">{title}</div>
      <div className="mt-1 truncate text-[10.5px] text-muted-foreground">{subtitle}</div>
    </div>
  );
}

function BridgeOverviewBar() {
  const [workspaces, setWorkspaces] = useState<OverviewWorkspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState(() => {
    try { return window.localStorage.getItem('bridge.resource.activeWorkspace') || ''; } catch { return ''; }
  });

  useEffect(() => {
    const syncActive = () => {
      try { setActiveWorkspace(window.localStorage.getItem('bridge.resource.activeWorkspace') || ''); } catch { /* local preference only */ }
    };
    window.addEventListener('bridge:active-project-changed', syncActive);
    return () => window.removeEventListener('bridge:active-project-changed', syncActive);
  }, []);

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const response = await fetch('/api/resource-registry', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (!stopped) setWorkspaces(data.workspaces || []);
      } catch {
        // Keep the last snapshot while polling retries.
      }
    };
    load();
    const timer = window.setInterval(load, 10_000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, []);

  const current = useMemo(() => workspaces.find(item => item.workspace_id === activeWorkspace) || workspaces[0] || null, [workspaces, activeWorkspace]);
  const gptCount = current?.chatgpt_targets?.length || 0;
  const studioCount = current?.studio_targets?.length || 0;

  return (
    <div className="shrink-0 border-b border-border bg-[#080b1a] px-4 py-3 sm:px-6 lg:px-[18%]">
      <div className="grid gap-2 md:grid-cols-4">
        <OverviewCard
          icon={<Folder className="size-3.5" />}
          label="Project"
          title={current?.project_name || 'BridgeChatgpt'}
          subtitle={`${workspaces.length || 1} project trong Bridge`}
          tone="project"
        />
        <OverviewCard
          icon={<Github className="size-3.5" />}
          label="Repository"
          title={current ? shortRepo(current.repository_url) : 'machxanht/BridgeChatgpt'}
          subtitle={`branch ${current?.branch || 'main'}`}
          tone="repo"
        />
        <OverviewCard
          icon={<Bot className="size-3.5" />}
          label="ChatGPT"
          title={gptCount ? 'Đã liên kết phiên' : 'Chưa có phiên'}
          subtitle="Sẽ chuyển sang URL-based"
          tone="gpt"
          badge={gptCount}
        />
        <OverviewCard
          icon={<Boxes className="size-3.5" />}
          label="AI Studio"
          title={studioCount ? 'Đã liên kết app' : 'Chưa có app'}
          subtitle="Sẽ chuyển sang URL-based"
          tone="studio"
          badge={studioCount}
        />
      </div>
    </div>
  );
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  state,
  onSendCommand,
  onTriggerAutoReviewCycle,
  isAutoReviewing,
  onPauseAll,
  onResumeAll,
  onStopAgent,
  onCancelTask,
  onOpenAdvancedTab,
}) => {
  if (state.mission_control) {
    return (
      <div className="flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-background">
        <BridgeOverviewBar />
        <ProjectRouterV2 />
        <BridgeMiniStatus state={state} />
        <BridgeChatPanel />

        <details className="group shrink-0 border-t border-border bg-surface/50">
          <summary className="flex h-10 cursor-pointer list-none items-center gap-2 px-3 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground sm:px-4">
            <Settings2 className="size-4" />
            System Details
            <span className="ml-1 hidden text-[10px] text-muted-foreground/70 sm:inline">executor · tasks · agents · logs · diagnostics</span>
            <ChevronUp className="ml-auto size-4 transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="thin-scrollbar max-h-[58vh] overflow-y-auto border-t border-border p-3 sm:p-4">
            <LocalExecutorPanel />
            <MissionControlView
              state={state}
              missionControl={state.mission_control}
              onSendCommand={onSendCommand}
              onPauseAll={onPauseAll}
              onResumeAll={onResumeAll}
              onStopAgent={onStopAgent}
              onCancelTask={onCancelTask}
              onTriggerAutoReviewCycle={onTriggerAutoReviewCycle}
              isAutoReviewing={isAutoReviewing}
              onOpenAdvancedTab={onOpenAdvancedTab}
            />
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col items-center justify-center gap-3 bg-background p-12 text-center text-sm text-muted-foreground">
      <div className="size-6 animate-spin rounded-full border-2 border-studio border-t-transparent" />
      <p>Loading Bridge workspace…</p>
    </div>
  );
};
