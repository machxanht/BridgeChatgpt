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
import { ProjectRouterV2 } from './ProjectRouterV2.js';
import { BridgeChatPanel } from './BridgeChatPanel.js';

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
      <div className="space-y-4">
        <ProjectRouterV2 />
        <BridgeChatPanel />

        <details className="group overflow-hidden rounded-2xl border border-white/10 bg-slate-950/55">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-bold text-slate-300 hover:bg-white/5">
            <span>⚙ Chi tiết hệ thống · task · agent · log</span>
            <span className="text-[10px] text-slate-600 group-open:hidden">Mở khi cần</span>
            <span className="hidden text-[10px] text-slate-500 group-open:inline">Thu gọn</span>
          </summary>
          <div className="border-t border-white/10 p-3 sm:p-4">
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
    <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 font-mono text-sm space-y-3">
      <div className="h-6 w-6 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin"></div>
      <p>Đang tải Bridge workspace...</p>
    </div>
  );
};
