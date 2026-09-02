import React from 'react';
import {
  Activity,
  AgentOperationalStatus,
  Finding,
  ProjectConfig,
  TargetAgentType,
  Task,
  WorkspaceState,
} from '../types.js';
import { MissionControlView } from './MissionControlView.js';
import { ResourceRoutingPanel } from './ResourceRoutingPanel.js';

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
  // If backend mission_control data is available, render AI Mission Control.
  // URL-based project/session routing is mounted here so it is part of the real
  // main screen rather than an optional/legacy identity banner.
  if (state.mission_control) {
    return (
      <div className="space-y-4">
        <ResourceRoutingPanel />
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
    );
  }

  // Fallback if mission_control is loading
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 font-mono text-sm space-y-3">
      <div className="h-6 w-6 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin"></div>
      <p>Đang tải dữ liệu Trung Tâm Điều Khiển AI Mission Control...</p>
    </div>
  );
};
