import assert from 'node:assert';
import { buildWakeQueueFromData } from '../server/wakeQueue.js';
import { buildWakeQueue } from '../server/wakeQueue.js';
import type { ProjectConfig } from '../src/types.js';

assert.deepEqual(buildWakeQueueFromData(), [], 'Legacy Bridge Wake queue must stay disabled');

const project = {
  id: 'project-demo',
  name: 'Demo',
  repository_url: 'https://github.com/example/demo',
} as ProjectConfig;

assert.deepEqual(await buildWakeQueue(project), [], 'Legacy Bridge Wake must never emit browser/studio events');

console.log('wakeQueue.test.ts: legacy wake disabled');
