import type { ProjectConfig } from '../src/types.js';

export type WakeReason = 'assigned-task' | 'review-ready' | 'studio-blocked';

export interface WakeInstruction {
  event_id: string;
  reason: WakeReason;
  provider: 'chatgpt' | 'google-ai-studio';
  target_id: string;
  resource_id: string;
  resource_url: string;
  workspace_id: string;
  project_id: string;
  project_name: string;
  repository_url: string;
  task_id: string;
  task_title: string;
  task_status: string;
  task_updated_at: string;
  prompt: string;
}

// Legacy browser/studio wake delivery is disabled.
// Bridge Fast Chat and local CLI workers own agent dispatch now.
export function buildWakeQueueFromData(): WakeInstruction[] {
  return [];
}

export async function buildWakeQueue(_project: ProjectConfig): Promise<WakeInstruction[]> {
  return [];
}
