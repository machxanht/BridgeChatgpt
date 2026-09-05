import assert from 'node:assert';
import { attachTaskBinding } from '../server/taskBinding.js';
import { buildWakeQueueFromData } from '../server/wakeQueue.js';
import type { ResourceRegistrySnapshot } from '../server/resourceRegistry.js';
import type { Task } from '../src/types.js';

const now = new Date().toISOString();

const snapshot: ResourceRegistrySnapshot = {
  instance_id: '11111111-1111-4111-8111-111111111111',
  server_time: now,
  workspaces: [{
    workspace_id: 'workspace-demo',
    project_id: 'project-demo',
    project_name: 'Demo',
    repository_url: 'https://github.com/example/demo',
    branch: 'main',
    studio_targets: [{
      target_id: 'studio-app-1234',
      provider: 'google-ai-studio',
      resource_id: 'app-1234',
      resource_url: 'https://aistudio.google.com/apps/app-1234',
      workspace_id: 'workspace-demo',
      project_id: 'project-demo',
      label: 'Studio',
      agent_instance_id: 'studio-app-1234',
      created_at: now,
      updated_at: now,
      connection_status: 'registered',
      last_seen_at: null,
    }],
    chatgpt_targets: [{
      target_id: 'chatgpt-chat-1111',
      provider: 'chatgpt',
      resource_id: 'chat-1111',
      resource_url: 'https://chatgpt.com/c/chat-1111',
      workspace_id: 'workspace-demo',
      project_id: 'project-demo',
      label: 'ChatGPT old',
      agent_instance_id: 'chatgpt-chat-1111',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: now,
      connection_status: 'registered',
      last_seen_at: null,
    }, {
      target_id: 'chatgpt-chat-2222',
      provider: 'chatgpt',
      resource_id: 'chat-2222',
      resource_url: 'https://chatgpt.com/c/chat-2222',
      workspace_id: 'workspace-demo',
      project_id: 'project-demo',
      label: 'ChatGPT newest',
      agent_instance_id: 'chatgpt-chat-2222',
      created_at: '2026-01-02T00:00:00.000Z',
      updated_at: now,
      connection_status: 'registered',
      last_seen_at: null,
    }],
  }],
};

function task(
  id: string,
  assignee: Task['assignee'],
  status: Task['status'],
  agentInstanceId: string,
  createdAt: string,
): Task {
  const prepared = attachTaskBinding(`${id} description`, {
    version: 1,
    workspace_id: 'workspace-demo',
    project_id: 'project-demo',
    agent_instance_id: agentInstanceId,
  });
  return {
    id,
    title: `${id} title`,
    description: prepared.description,
    priority: 'high',
    status,
    assignee,
    created_by: 'human',
    created_at: createdAt,
    updated_at: createdAt,
    related_files: [],
    related_finding: null,
    result: null,
  };
}

const assignedStudio = task('TASK-1', 'gemini', 'assigned', 'studio-app-1234', '2026-01-03T00:00:01.000Z');
const assignedChat = task('TASK-2', 'chatgpt', 'pending', 'chatgpt-chat-2222', '2026-01-03T00:00:02.000Z');
const reviewStudio = task('TASK-3', 'gemini', 'review', 'studio-app-1234', '2026-01-03T00:00:03.000Z');
const secondStudio = task('TASK-4', 'gemini', 'assigned', 'studio-app-1234', '2026-01-03T00:00:04.000Z');

// One direct wake per exact target. TASK-4 must not leak through while TASK-1 is active,
// and Studio review must not interrupt a ChatGPT conversation already holding TASK-2.
const queue = buildWakeQueueFromData(snapshot, [assignedStudio, assignedChat, reviewStudio, secondStudio]);
assert.strictEqual(queue.length, 2);

const studioWake = queue.find(item => item.task_id === 'TASK-1');
assert.ok(studioWake);
assert.strictEqual(studioWake!.provider, 'google-ai-studio');
assert.strictEqual(studioWake!.resource_id, 'app-1234');
assert.match(studioWake!.prompt, /studio_app_id=app-1234/);
assert.ok(!queue.some(item => item.task_id === 'TASK-4'));

const chatWake = queue.find(item => item.task_id === 'TASK-2');
assert.ok(chatWake);
assert.strictEqual(chatWake!.resource_id, 'chat-2222');
assert.match(chatWake!.prompt, /chatgpt_conversation_id=chat-2222/);
assert.ok(!queue.some(item => item.task_id === 'TASK-3' && item.reason === 'review-ready'));

// Completing the direct ChatGPT task allows the pending Studio review to wake ChatGPT,
// but TASK-4 remains blocked because TASK-3 itself is still non-terminal on Studio.
const queueAfterChatDone = buildWakeQueueFromData(snapshot, [
  assignedStudio,
  { ...assignedChat, status: 'completed' },
  reviewStudio,
  secondStudio,
]);
const reviewWake = queueAfterChatDone.find(item => item.task_id === 'TASK-3' && item.reason === 'review-ready');
assert.ok(reviewWake);
assert.strictEqual(reviewWake!.resource_id, 'chat-2222');
assert.ok(!queueAfterChatDone.some(item => item.task_id === 'TASK-4'));

// A later Studio task can wake only after every older task on that exact Studio target
// becomes terminal.
const queueAfterOlderStudioDone = buildWakeQueueFromData(snapshot, [
  { ...assignedStudio, status: 'completed' },
  { ...assignedChat, status: 'completed' },
  { ...reviewStudio, status: 'completed' },
  secondStudio,
]);
assert.strictEqual(queueAfterOlderStudioDone.length, 1);
assert.strictEqual(queueAfterOlderStudioDone[0].task_id, 'TASK-4');
assert.strictEqual(queueAfterOlderStudioDone[0].provider, 'google-ai-studio');

assert.strictEqual(new Set(queue.map(item => item.event_id)).size, queue.length);
console.log('wakeQueue.test.ts: all assertions passed');
