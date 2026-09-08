import assert from 'node:assert';
import { buildWakeQueueFromData, buildWakeQueue } from '../server/wakeQueue.js';
import type { ProjectConfig } from '../src/types.js';

assert.deepEqual(buildWakeQueueFromData(), [], 'Legacy Bridge Wake queue must stay disabled');

const now = new Date().toISOString();
const project: ProjectConfig = {
  id: 'project-demo',
  project_name: 'Demo',
  project_root: 'E:\\AI\\Bridge',
  repository_url: 'https://github.com/example/demo',
  default_branch: 'main',
  current_goal: 'test',
  test_command: 'npm test',
  auto_review: false,
  created_at: now,
  updated_at: now,
};

assert.deepEqual(await buildWakeQueue(project), [], 'Legacy Bridge Wake must never emit browser/studio events');
console.log('wakeQueue.test.ts: legacy wake disabled');
