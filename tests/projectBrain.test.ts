import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listProjectMemory, rememberProjectMemory } from '../server/projectBrain.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-project-brain-'));
process.env.BRIDGE_PROJECT_BRAIN_PATH = path.join(tempDir, 'runtime.json');
process.env.BRIDGE_PROJECT_BRAIN_SNAPSHOT_PATH = path.join(tempDir, 'snapshot.json');

try {
  const first = await rememberProjectMemory({
    id: 'decision-db',
    workspace_id: 'workspace-alpha',
    project_id: 'project-alpha',
    scope: 'decision',
    content: 'Use PostgreSQL for durable Bridge state.',
    source_agent: 'chatgpt',
    source_session: 'chat-a',
    source_task_id: 'TASK-1',
  });
  assert.strictEqual(first.scope, 'decision');

  await rememberProjectMemory({
    id: 'architecture-router',
    workspace_id: 'workspace-alpha',
    project_id: 'project-alpha',
    scope: 'architecture',
    content: 'Route tasks by project first, then by provider pool, then lease to an instance.',
    source_agent: 'chatgpt',
    source_session: 'chat-b',
  });

  await rememberProjectMemory({
    id: 'other-project',
    workspace_id: 'workspace-beta',
    project_id: 'project-beta',
    scope: 'fact',
    content: 'This must not leak into project alpha.',
    source_agent: 'studio',
  });

  const alpha = await listProjectMemory('workspace-alpha', 'project-alpha');
  assert.strictEqual(alpha.length, 2);
  assert.ok(alpha.some(item => item.id === 'decision-db'));
  assert.ok(alpha.every(item => item.project_id === 'project-alpha'));

  await rememberProjectMemory({
    id: 'decision-db',
    workspace_id: 'workspace-alpha',
    project_id: 'project-alpha',
    scope: 'decision',
    content: 'Use a durable external store; PostgreSQL is the preferred production backend.',
    source_agent: 'chatgpt',
    source_session: 'chat-c',
  });

  const updated = await listProjectMemory('workspace-alpha', 'project-alpha');
  assert.strictEqual(updated.length, 2);
  assert.ok(updated.find(item => item.id === 'decision-db')?.content.includes('durable external store'));

  console.log('projectBrain.test.ts: all assertions passed');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
