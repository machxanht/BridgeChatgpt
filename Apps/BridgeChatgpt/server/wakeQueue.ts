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

type BoundTask = {
  task: Task;
  agentInstanceId: string;
};

const TERMINAL_STATUSES = new Set(['completed', 'cancelled']);
const DEBATE_MARKER = '<!-- BRIDGE_DEBATE_V1 -->';
const ATTACHMENT_START = '<!-- BRIDGE_ATTACHMENTS_V1';
const ATTACHMENT_END = 'BRIDGE_ATTACHMENTS_V1 -->';

function isDebateTask(task: Task) {
  return String(task.description || '').includes(DEBATE_MARKER);
}

function attachmentPrompt(task: Task) {
  const source = String(task.description || '');
  const start = source.indexOf(ATTACHMENT_START);
  const end = source.indexOf(ATTACHMENT_END, start + ATTACHMENT_START.length);
  if (start < 0 || end < 0) return [];
  try {
    const items = JSON.parse(source.slice(start + ATTACHMENT_START.length, end).trim());
    if (!Array.isArray(items) || !items.length) return [];
    return [
      'Attachments:',
      ...items.slice(0, 5).map((item: any) => `- ${item.name} (${item.type}, ${item.size} bytes): ${item.url}`),
      'Inspect the relevant attachments before answering or acting.',
    ];
  } catch {
    return [];
  }
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
    if (isDebateTask(task)) {
      return [
        `Bridge Debate — Studio round for ${task.id}: ${task.title}`,
        `project=${projectName}`,
        `repo=${repositoryUrl}`,
        `studio_app_id=${target.resource_id}`,
        ...attachmentPrompt(task),
        `Claim exactly ${task.id} for this Studio target.`,
        'This is a question/debate task, not a coding task. Read the task question and give the strongest first position.',
        'State uncertainty and likely counterarguments. Do not edit files, run builds, or Publish.',
        'Submit the Studio relay result with your argument in summary, artifacts: [], files_changed: [].',
        'ChatGPT will receive your position automatically, critique it, and synthesize the final answer.',
      ].join('\n');
    }
    return [
      `Bridge Wake — ${task.id}: ${task.title}`,
      `project=${projectName}`,
      `repo=${repositoryUrl}`,
      `studio_app_id=${target.resource_id}`,
      ...attachmentPrompt(task),
      `Claim exactly ${task.id} for this Studio target. When using the Studio relay, pass task_id=${task.id}; never use an unscoped claim-next to skip an earlier non-terminal task.`,
      `Process only ${task.id} completely, run the required build/tests, and submit its result back to Bridge.`,
      'Do not start another Bridge task until this task reaches completed or cancelled.',
      'Do not Publish unless the user explicitly asks.',
    ].join('\n');
  }

  return [
    `Bridge Wake — ${task.id}: ${task.title}`,
    `project=${projectName}`,
    `repo=${repositoryUrl}`,
    `chatgpt_conversation_id=${target.resource_id}`,
    ...attachmentPrompt(task),
    'Check Bridge and the project repo now. Continue the ChatGPT work assigned to this conversation and write back the resulting task/handoff state when done.',
    'Do not start another Bridge task until this task reaches completed or cancelled.',
    'Use normal ChatGPT tools for this workflow; do not invoke Codex unless the user explicitly requests it.',
  ].join('\n');
}

function reviewPrompt(target: ResourceTargetView, task: Task, projectName: string, repositoryUrl: string, blocked: boolean) {
  if (!blocked && isDebateTask(task)) {
    return [
      `Bridge Debate — ChatGPT final round for ${task.id}: ${task.title}`,
      `project=${projectName}`,
      `repo=${repositoryUrl}`,
      `chatgpt_conversation_id=${target.resource_id}`,
      'Read the latest AI Studio position for this question in Bridge.',
      'Challenge weak assumptions, add your independent reasoning, and resolve disagreements explicitly.',
      'Then mark the task completed with one user-facing final answer. Do not edit repo/files unless the original question explicitly asks for work.',
      'Use normal ChatGPT tools; do not invoke Codex unless the user explicitly requests it.',
    ].join('\n');
  }
  return [
    `Bridge Wake — ${blocked ? 'Studio blocker' : 'Studio result ready'} for ${task.id}: ${task.title}`,
    `project=${projectName}`,
    `repo=${repositoryUrl}`,
    `chatgpt_conversation_id=${target.resource_id}`,
    blocked
      ? 'Check the latest Bridge blocker/handoff from AI Studio. Diagnose it, update the task/plan, and send the next actionable instruction.'
      : 'Check the latest Studio result and conflict-safe artifacts in Bridge. Review them, apply/approve or request changes, and update Bridge/GitHub accordingly.',
    'Finish this review/blocker cycle before accepting the next Bridge wake for this conversation.',
    'Use normal ChatGPT tools for this workflow; do not invoke Codex unless the user explicitly requests it.',
  ].join('\n');
}

function taskOrder(a: Task, b: Task) {
  const created = String(a.created_at || '').localeCompare(String(b.created_at || ''));
  if (created !== 0) return created;
  const updated = String(a.updated_at || '').localeCompare(String(b.updated_at || ''));
  if (updated !== 0) return updated;
  return a.id.localeCompare(b.id);
}

function expectedProvider(task: Task): ResourceTargetView['provider'] | null {
  if (task.assignee === 'gemini') return 'google-ai-studio';
  if (task.assignee === 'chatgpt') return 'chatgpt';
  return null;
}

function isNonTerminal(task: Task) {
  return !TERMINAL_STATUSES.has(task.status);
}

export function buildWakeQueueFromData(snapshot: ResourceRegistrySnapshot, tasks: Task[]): WakeInstruction[] {
  const output: WakeInstruction[] = [];

  for (const workspace of snapshot.workspaces) {
    const allTargets = [...workspace.chatgpt_targets, ...workspace.studio_targets];
    const primaryChatgpt = [...workspace.chatgpt_targets]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;

    const boundTasks: BoundTask[] = [];
    for (const task of tasks) {
      const binding = extractTaskBinding(String(task.description || '')).binding;
      if (!binding) continue;
      if (binding.workspace_id !== workspace.workspace_id || binding.project_id !== workspace.project_id) continue;
      if (!binding.agent_instance_id) continue;
      boundTasks.push({ task, agentInstanceId: binding.agent_instance_id });
    }

    // Single-flight per exact resource target. A target may have many queued tasks in Bridge,
    // but Wake exposes only the oldest non-terminal one. If that task is already working,
    // blocked or waiting for review, no later task is emitted until it becomes terminal.
    for (const target of allTargets) {
      const firstOpen = boundTasks
        .filter(item => item.agentInstanceId === target.agent_instance_id)
        .filter(item => expectedProvider(item.task) === target.provider)
        .map(item => item.task)
        .filter(isNonTerminal)
        .sort(taskOrder)[0];

      if (!firstOpen) continue;
      if (!['pending', 'assigned'].includes(firstOpen.status)) continue;

      const reason: WakeReason = 'assigned-task';
      output.push({
        event_id: eventId(reason, target.target_id, firstOpen),
        reason,
        provider: target.provider,
        target_id: target.target_id,
        resource_id: target.resource_id,
        resource_url: target.resource_url,
        workspace_id: workspace.workspace_id,
        project_id: workspace.project_id,
        project_name: workspace.project_name,
        repository_url: workspace.repository_url,
        task_id: firstOpen.id,
        task_title: firstOpen.title,
        task_status: firstOpen.status,
        task_updated_at: firstOpen.updated_at,
        prompt: directPrompt(target, firstOpen, workspace.project_name, workspace.repository_url),
      });
    }

    if (primaryChatgpt) {
      // Do not interrupt the primary ChatGPT conversation with a Studio review while it
      // already owns another non-terminal direct task. This mirrors the same single-flight
      // rule used for Studio and prevents cross-task prompt interleaving.
      const chatgptBusy = boundTasks
        .filter(item => item.agentInstanceId === primaryChatgpt.agent_instance_id)
        .map(item => item.task)
        .some(task => expectedProvider(task) === 'chatgpt' && isNonTerminal(task));

      if (!chatgptBusy) {
        const reviewTask = boundTasks
          .map(item => item.task)
          .filter(task => task.assignee === 'gemini' && (task.status === 'review' || task.status === 'blocked'))
          .sort(taskOrder)[0];

        if (reviewTask) {
          const blocked = reviewTask.status === 'blocked';
          const reason: WakeReason = blocked ? 'studio-blocked' : 'review-ready';
          output.push({
            event_id: eventId(reason, primaryChatgpt.target_id, reviewTask),
            reason,
            provider: 'chatgpt',
            target_id: primaryChatgpt.target_id,
            resource_id: primaryChatgpt.resource_id,
            resource_url: primaryChatgpt.resource_url,
            workspace_id: workspace.workspace_id,
            project_id: workspace.project_id,
            project_name: workspace.project_name,
            repository_url: workspace.repository_url,
            task_id: reviewTask.id,
            task_title: reviewTask.title,
            task_status: reviewTask.status,
            task_updated_at: reviewTask.updated_at,
            prompt: reviewPrompt(primaryChatgpt, reviewTask, workspace.project_name, workspace.repository_url, blocked),
          });
        }
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
