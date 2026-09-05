import React from 'react';
import { MonitorCog, X } from 'lucide-react';
import type {
  AgentOperationalStatus,
  Finding,
  TargetAgentType,
  Task,
  WorkspaceState,
} from '../types.js';
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

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({ state }) => {
  const [pcControlOpen, setPcControlOpen] = React.useState(false);

  if (state.mission_control) {
    return (
      <div className="flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-background">
        <ProjectRouterV2 />
        <BridgeMiniStatus state={state} />
        <BridgeChatPanel />

        <button
          type="button"
          onClick={() => setPcControlOpen(true)}
          className="flex h-12 shrink-0 items-center gap-2 border-t border-border bg-surface/60 px-4 text-[14px] font-semibold text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
        >
          <MonitorCog className="size-4.5" />
          <span>PC Control</span>
          <span className="ml-1 hidden text-[10px] font-normal text-muted-foreground/70 sm:inline">executor · git · test/build · job history</span>
          <span className="ml-auto rounded-full border border-border bg-background/60 px-2 py-1 text-[10px] font-medium text-muted-foreground">OPEN PC</span>
        </button>

        {pcControlOpen && (
          <div className="fixed inset-0 z-50 flex h-dvh w-screen flex-col bg-background">
            <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 shadow-panel sm:px-5">
              <span className="grid size-9 place-items-center rounded-lg bg-surface-2 text-human">
                <MonitorCog className="size-4.5" />
              </span>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold leading-tight text-foreground">PC Control</div>
                <div className="truncate text-[10.5px] text-muted-foreground">PC executor · Git · test/build · recent jobs</div>
              </div>
              <button
                type="button"
                onClick={() => setPcControlOpen(false)}
                className="ml-auto grid size-10 place-items-center rounded-xl border border-border bg-background/60 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                aria-label="Close PC Control"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-3 pb-8 sm:p-5 sm:pb-10">
              <div className="mx-auto w-full max-w-6xl">
                <LocalExecutorPanel />
              </div>
            </div>
          </div>
        )}
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
