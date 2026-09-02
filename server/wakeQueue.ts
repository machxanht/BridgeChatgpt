import crypto from 'crypto';
import type { ProjectConfig, Task } from '../src/types.js';
import { getTasks } from './db.js';
import { extractTaskBinding } from './taskBinding.js';
import {
  getResourceRegistry,
  type ResourceRegistrySnapshot,
  type ResourceTargetView,
} from './resourceRegistry.js';

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

function eventId(reason: WakeReason, targetId: string, task: Task) {
  return crypto
    .createHash('sha256')
    .update(`${reason}:${targetId}:${task.id}:${task.status}:${task.updated_at}`)
    .digest('hex')
    .slice(0, 24);
}

function directPrompt(target: ResourceTargetView, task: Task, projectName: string, repositoryUrl: string) {
  if (target.provider === 'google-ai-studio') {
    return [
      `Bridge Wake — ${task.id}: ${task.title}`,
      `project=${projectName}`,
      `repo=${repositoryUrl}`,
      `studio_app_id=${target.resource_id}`,
      'Check Bridge now. Claim only pending work mapped to this Studio app, process it completely, run the required build/tests, and submit the result back to Bridge.',
      'Do not Publish unless the user explicitly asks.',
    ].join('\n');
  }

  return [
    `Bridge Wake — ${task.id}: ${task.title}`,
    `project=${projectName}`,
    `repo=${repositoryUrl}`,
    `chatgpt_conversation_id=${target.resource_id}`,
    'Check Bridge and the project repo now. Continue the ChatGPT work assigned to this conversation and write back the resulting task/handoff state when done.',
    'Use normal ChatGPT tools for this workflow; do not invoke Codex unless the user explicitly requests it.',
  ].join('\n');
}

function reviewPrompt(target: ResourceTargetView, task: Task, projectName: string, repositoryUrl: string, blocked: boolean) {
  return [
    `Bridge Wake — ${blocked ? 'Studio blocker' : 'Studio result ready'} for ${task.id}: ${task.title}`,
    `project=${projectName}`,
    `repo=${repositoryUrl}`,
    `chatgpt_conversation_id=${target.resource_id}`,
    blocked
      ? 'Check the latest Bridge blocker/handoff from AI Studio. Diagnose it, update the task/plan, and send the next actionable instruction.'
      : 'Check the latest Studio result and conflict-safe artifacts in Bridge. Review them, apply/approve or request changes, and update Bridge/GitHub accordingly.',
    'Use normal ChatGPT tools for this workflow; do not invoke Codex unless the user explicitly requests it.',
  ].join('\n');
}

export function buildWakeQueueFromData(snapshot: ResourceRegistrySnapshot, tasks: Task[]): WakeInstruction[] {
  const output: WakeInstruction[] = [];

  for (const workspace of snapshot.workspaces) {
    const allTargets = [...workspace.chatgpt_targets, ...workspace.studio_targets];
    // The user commonly replaces a long/laggy ChatGPT thread with a newer thread in the
    // same project. Handoffs from Studio should therefore wake the newest saved ChatGPT
    // conversation, while direct ChatGPT tasks remain pinned to their exact URL target.
    const primaryChatgpt = [...workspace.chatgpt_targets]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;

    for (const task of tasks) {
      const binding = extractTaskBinding(String(task.description || '')).binding;
      if (!binding) continue;
      if (binding.workspace_id !== workspace.workspace_id || binding.project_id !== workspace.project_id) continue;

      if (['pending', 'assigned'].includes(task.status) && binding.agent_instance_id) {
        const target = allTargets.find(item => item.agent_instance_id === binding.agent_instance_id);
        if (!target) continue;
        const expectedProvider = task.assignee === 'gemini' ? 'google-ai-studio' : task.assignee === 'chatgpt' ? 'chatgpt' : null;
        if (!expectedProvider || target.provider !== expectedProvider) continue;
        const reason: WakeReason = 'assigned-task';
        output.push({
          event_id: eventId(reason, target.target_id, task),
          reason,
          provider: target.provider,
          target_id: target.target_id,
          resource_id: target.resource_id,
          resource_url: target.resource_url,
          workspace_id: workspace.workspace_id,
          project_id: workspace.project_id,
          project_name: workspace.project_name,
          repository_url: workspace.repository_url,
          task_id: task.id,
          task_title: task.title,
          task_status: task.status,
          task_updated_at: task.updated_at,
          prompt: directPrompt(target, task, workspace.project_name, workspace.repository_url),
        });
        continue;
      }

      if (task.assignee === 'gemini' && primaryChatgpt && (task.status === 'review' || task.status === 'blocked')) {
        const blocked = task.status === 'blocked';
        const reason: WakeReason = blocked ? 'studio-blocked' : 'review-ready';
        output.push({
          event_id: eventId(reason, primaryChatgpt.target_id, task),
          reason,
          provider: 'chatgpt',
          target_id: primaryChatgpt.target_id,
          resource_id: primaryChatgpt.resource_id,
          resource_url: primaryChatgpt.resource_url,
          workspace_id: workspace.workspace_id,
          project_id: workspace.project_id,
          project_name: workspace.project_name,
          repository_url: workspace.repository_url,
          task_id: task.id,
          task_title: task.title,
          task_status: task.status,
          task_updated_at: task.updated_at,
          prompt: reviewPrompt(primaryChatgpt, task, workspace.project_name, workspace.repository_url, blocked),
        });
      }
    }
  }

  return output.sort((a, b) => a.task_updated_at.localeCompare(b.task_updated_at));
}

export async function buildWakeQueue(project: ProjectConfig): Promise<WakeInstruction[]> {
  const [snapshot, tasks] = await Promise.all([
    getResourceRegistry(project),
    getTasks({ limit: 500 }),
  ]);
  return buildWakeQueueFromData(snapshot, tasks);
}
