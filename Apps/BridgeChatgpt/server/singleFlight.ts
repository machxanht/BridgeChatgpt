import type { Task } from '../src/types.js';
import { extractTaskBinding } from './taskBinding.js';

export const TERMINAL_TASK_STATUSES = new Set(['completed', 'cancelled']);
const CLAIMABLE_TASK_STATUSES = new Set(['pending', 'assigned']);

export function isNonTerminalTask(task: Task): boolean {
  return !TERMINAL_TASK_STATUSES.has(task.status);
}

export function taskCreatedOrder(a: Task, b: Task): number {
  const created = String(a.created_at || '').localeCompare(String(b.created_at || ''));
  if (created !== 0) return created;
  return a.id.localeCompare(b.id);
}

export function exactTaskLaneKey(task: Task): string | null {
  const binding = extractTaskBinding(String(task.description || '')).binding;
  if (!binding?.agent_instance_id) return null;
  return [task.assignee, binding.workspace_id, binding.project_id, binding.agent_instance_id].join(':');
}

export function exactLaneBlocker(task: Task, tasks: Task[]): Task | null {
  const lane = exactTaskLaneKey(task);
  if (!lane) return null;
  const head = tasks
    .filter(candidate => isNonTerminalTask(candidate) && exactTaskLaneKey(candidate) === lane)
    .sort(taskCreatedOrder)[0] || null;
  if (!head || head.id === task.id) return null;
  return head;
}

export function filterClaimableSingleFlight(tasks: Task[], assignee?: string): Task[] {
  return tasks.filter(task => {
    if (assignee && task.assignee !== assignee) return false;
    if (!CLAIMABLE_TASK_STATUSES.has(task.status)) return false;
    return exactLaneBlocker(task, tasks) === null;
  });
}
