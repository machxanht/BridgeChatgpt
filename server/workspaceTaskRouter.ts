import {
  createMessage,
  createTask,
  getTask,
  getTasks,
  logActivity,
  setAgentStatus,
  updateTask,
} from './db.js';
import { attachTaskBinding, extractTaskBinding, type TaskBinding } from './taskBinding.js';
import type { AgentType, Task, TaskPriority } from '../src/types.js';

const PRIORITY_WEIGHTS: Record<TaskPriority, number> = { urgent: 1, high: 2, medium: 3, low: 4 };
let claimTail: Promise<void> = Promise.resolve();

async function withClaimLock<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const previous = claimTail;
  claimTail = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

export async function createBoundTask(input: {
  title: string;
  description: string;
  priority?: TaskPriority;
  assignee: 'chatgpt' | 'gemini';
  created_by?: AgentType;
  related_files?: string[];
  binding: TaskBinding;
}): Promise<Task> {
  const prepared = attachTaskBinding(input.description, input.binding);
  const task = await createTask({
    title: input.title,
    description: prepared.description,
    priority: input.priority || 'medium',
    assignee: input.assignee,
    created_by: input.created_by || 'human',
    related_files: input.related_files || [],
  });
  return { ...task, description: input.description };
}

export async function claimNextBoundTask(input: {
  agent: 'gemini';
  workspace_id: string;
  project_id: string;
  agent_instance_id: string;
  allow_legacy?: boolean;
}): Promise<{ claimed: boolean; message?: string; task: Task | null; binding: TaskBinding | null }> {
  return withClaimLock(async () => {
    const tasks = await getTasks({ assignee: input.agent, limit: 200 });
    const eligible = tasks.filter(task => {
      if (!['assigned', 'pending'].includes(task.status)) return false;
      const binding = extractTaskBinding(task.description).binding;
      if (!binding) return Boolean(input.allow_legacy);
      if (binding.workspace_id !== input.workspace_id || binding.project_id !== input.project_id) return false;
      if (binding.agent_instance_id && binding.agent_instance_id !== input.agent_instance_id) return false;
      return true;
    });

    eligible.sort((a, b) => {
      const priority = (PRIORITY_WEIGHTS[a.priority] || 3) - (PRIORITY_WEIGHTS[b.priority] || 3);
      return priority || a.created_at.localeCompare(b.created_at);
    });

    const selected = eligible[0];
    if (!selected) {
      return {
        claimed: false,
        message: `No task available for ${input.agent_instance_id} in ${input.workspace_id}.`,
        task: null,
        binding: null,
      };
    }

    const latest = await getTask(selected.id);
    if (!latest || !['assigned', 'pending'].includes(latest.status)) {
      return { claimed: false, message: `${selected.id} changed before claim.`, task: null, binding: null };
    }

    await updateTask(selected.id, { status: 'working' }, input.agent);
    const refreshed = await getTask(selected.id);
    if (!refreshed || refreshed.status !== 'working') {
      return { claimed: false, message: `${selected.id} claim verification failed.`, task: null, binding: null };
    }

    const parsed = extractTaskBinding(refreshed.description);
    await setAgentStatus({
      agent: 'gemini',
      status: 'working',
      current_task_id: refreshed.id,
      message: `${input.agent_instance_id} executing ${refreshed.id} in ${input.workspace_id}`,
    });
    await logActivity({
      agent: 'gemini',
      action: `Workspace instance ${input.agent_instance_id} claimed ${refreshed.id}`,
      entity_type: 'task',
      entity_id: refreshed.id,
      details: `${input.workspace_id} / ${input.project_id}`,
    });
    await createMessage({
      from: 'gemini',
      to: 'chatgpt',
      type: 'task_claimed',
      content: `${input.agent_instance_id} claimed ${refreshed.id} for workspace ${input.workspace_id}.`,
      task_id: refreshed.id,
      finding_id: refreshed.related_finding,
    });

    return {
      claimed: true,
      message: `Successfully claimed ${refreshed.id} for ${input.agent_instance_id}`,
      task: { ...refreshed, description: parsed.description },
      binding: parsed.binding,
    };
  });
}
