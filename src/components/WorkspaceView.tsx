import React from 'react';
import { ChevronUp, Settings2 } from 'lucide-react';
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
