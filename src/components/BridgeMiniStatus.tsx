import React from 'react';
import { Brain, Boxes } from 'lucide-react';
import type { WorkspaceState } from '../types.js';

function statusLabel(value?: string) {
  if (!value) return 'unknown';
  if (value === 'working') return 'working';
  if (value === 'reviewing') return 'reviewing';
  if (value === 'blocked') return 'blocked';
  if (value === 'offline') return 'offline';
  return 'ready';
}

export const BridgeMiniStatus: React.FC<{ state: WorkspaceState }> = ({ state }) => {
  const job = state.mission_control?.current_job || null;
  const stages = job?.stages || [];
  const stageIndex = typeof job?.current_stage_index === 'number' ? job.current_stage_index : 0;
  const progress = stages.length > 0 ? Math.max(4, Math.min(100, Math.round(((stageIndex + 1) / stages.length) * 100))) : job ? 18 : 0;
  const stageLabel = stages[stageIndex]?.label || job?.status || '';

  return (
    <div className="no-scrollbar flex shrink-0 items-center gap-3 overflow-x-auto border-y border-border bg-surface/40 px-3 py-1.5 text-[11.5px] sm:px-4">
      <span className="inline-flex shrink-0 items-center gap-1.5 text-muted-foreground">
        <Brain className="size-3.5 text-gpt" />
        <span className={`size-1.5 rounded-full ${state.agents.chatgpt.status === 'offline' ? 'bg-muted-foreground' : 'animate-pulse-dot bg-gpt'}`} />
        ChatGPT {statusLabel(state.agents.chatgpt.status)}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-muted-foreground">
        <Boxes className="size-3.5 text-studio" />
        <span className={`size-1.5 rounded-full ${state.agents.gemini.status === 'offline' ? 'bg-muted-foreground' : 'animate-pulse-dot bg-studio'}`} />
        Studio {statusLabel(state.agents.gemini.status)}
      </span>

      {job && (
        <span className="ml-auto inline-flex shrink-0 items-center gap-2 text-muted-foreground">
          <span className="font-medium text-foreground">{job.id}</span>
          <span>· {stageLabel}</span>
          <span className="relative h-1 w-20 overflow-hidden rounded-full bg-surface-2">
            <span className="absolute inset-y-0 left-0 rounded-full bg-studio transition-all duration-500" style={{ width: `${progress}%` }} />
          </span>
          <span className="tabular-nums">{progress}%</span>
        </span>
      )}
    </div>
  );
};
