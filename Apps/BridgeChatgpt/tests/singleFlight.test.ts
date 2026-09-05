import assert from 'node:assert';
import type { Task } from '../src/types.js';
import { attachTaskBinding } from '../server/taskBinding.js';
import { exactLaneBlocker, filterClaimableSingleFlight } from '../server/singleFlight.js';

function makeTask(id: string, status: Task['status'], created_at: string, instance: string | null): Task {
  const description = instance
    ? attachTaskBinding('single-flight test', {
        version: 1,
        workspace_id: 'workspace-proj-default',
        project_id: 'proj-default',
        agent_instance_id: instance,
      }).description
    : 'legacy unbound test';
  return {
    id,
    title: id,
    description,
    priority: 'high',
    status,
    assignee: 'gemini',
    created_by: 'chatgpt',
    created_at,
    updated_at: created_at,
    related_files: [],
    related_finding: null,
    result: null,
  };
}

const first = makeTask('TASK-1001', 'working', '2026-09-04T00:00:00.000Z', 'studio-a');
const second = makeTask('TASK-1002', 'assigned', '2026-09-04T00:01:00.000Z', 'studio-a');
const otherLane = makeTask('TASK-1003', 'assigned', '2026-09-04T00:02:00.000Z', 'studio-b');
const legacy = makeTask('TASK-1004', 'assigned', '2026-09-04T00:03:00.000Z', null);

const openTasks = [first, second, otherLane, legacy];
assert.strictEqual(exactLaneBlocker(second, openTasks)?.id, first.id, 'later task must see the active exact-target blocker');
assert.deepStrictEqual(
  filterClaimableSingleFlight(openTasks, 'gemini').map(task => task.id).sort(),
  [legacy.id, otherLane.id].sort(),
  'busy exact lane must withhold its later task while independent/legacy lanes remain claimable'
);

const completedFirst = { ...first, status: 'completed' as const };
const afterTerminal = [completedFirst, second, otherLane, legacy];
assert.strictEqual(exactLaneBlocker(second, afterTerminal), null, 'completed predecessor must release exact lane');
assert.ok(filterClaimableSingleFlight(afterTerminal, 'gemini').some(task => task.id === second.id), 'next task becomes claimable after terminal predecessor');

const blockedFirst = { ...first, status: 'blocked' as const };
assert.strictEqual(exactLaneBlocker(second, [blockedFirst, second])?.id, first.id, 'blocked is non-terminal and must keep lane busy');

console.log('✓ exact-target single-flight helper tests passed');
