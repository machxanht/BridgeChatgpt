import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ProjectConfig } from '../src/types.js';
import { upsertWorkspace } from '../server/workspaceRegistry.js';
import {
  getResourceRegistry,
  parseResourceUrl,
  removeResourceTarget,
  upsertResourceTarget,
} from '../server/resourceRegistry.js';

const workspaceFile = path.join(os.tmpdir(), `bridge-resource-workspaces-${process.pid}-${Date.now()}.json`);
const resourceFile = path.join(os.tmpdir(), `bridge-resource-targets-${process.pid}-${Date.now()}.json`);
process.env.BRIDGE_WORKSPACE_REGISTRY_PATH = workspaceFile;
process.env.BRIDGE_RESOURCE_REGISTRY_PATH = resourceFile;

const now = new Date().toISOString();
const project: ProjectConfig = {
  id: 'proj-default',
  project_name: 'BridgeChatgpt',
  project_root: '.',
  repository_url: 'https://github.com/machxanht/BridgeChatgpt',
  default_branch: 'main',
  current_goal: 'test',
  test_command: 'npm run lint',
  auto_review: true,
  created_at: now,
  updated_at: now,
};

try {
  const studio = parseResourceUrl('https://aistudio.google.com/u/3/apps/15c1d80d-6265-47e1-bdf2-e30fb7bf430c?showPreview=true&showAssistant=true');
  assert.strictEqual(studio.provider, 'google-ai-studio');
  assert.strictEqual(studio.resource_id, '15c1d80d-6265-47e1-bdf2-e30fb7bf430c');

  const chat = parseResourceUrl('https://chatgpt.com/c/12345678-abcd-4def-9123-123456789abc');
  assert.strictEqual(chat.provider, 'chatgpt');
  assert.strictEqual(chat.resource_id, '12345678-abcd-4def-9123-123456789abc');

  const nestedChat = parseResourceUrl('https://chatgpt.com/g/g-p-example/c/abcdef12-3456-7890-abcd-ef1234567890');
  assert.strictEqual(nestedChat.resource_id, 'abcdef12-3456-7890-abcd-ef1234567890');

  assert.throws(() => parseResourceUrl('https://chatgpt.com/share/12345678-abcd-4def-9123-123456789abc'), /original ChatGPT conversation URL/);
  assert.throws(() => parseResourceUrl('https://example.com/c/12345678'), /Only AI Studio and ChatGPT/);

  const workspace = await upsertWorkspace(project, {
    workspace_id: 'workspace-ouk',
    project_id: 'project-ouk',
    project_name: 'Ouk Chatrang Khmer',
    repository_url: 'https://github.com/machxanht/Ouk-Khmer-Online',
    branch: 'main',
  });

  const studioTarget = await upsertResourceTarget(project, {
    workspace_id: workspace.workspace_id,
    resource_url: 'https://aistudio.google.com/u/3/apps/15c1d80d-6265-47e1-bdf2-e30fb7bf430c?showPreview=true',
  });
  assert.strictEqual(studioTarget.agent_instance_id, 'studio-15c1d80d-6265-47e1-bdf2-e30fb7bf430c');
  assert.strictEqual(studioTarget.project_id, 'project-ouk');

  const chatTarget = await upsertResourceTarget(project, {
    workspace_id: workspace.workspace_id,
    resource_url: 'https://chatgpt.com/c/12345678-abcd-4def-9123-123456789abc',
  });
  assert.strictEqual(chatTarget.agent_instance_id, 'chatgpt-12345678-abcd-4def-9123-123456789abc');

  const snapshot = await getResourceRegistry(project);
  const ouk = snapshot.workspaces.find(item => item.workspace_id === 'workspace-ouk');
  assert.ok(ouk);
  assert.strictEqual(ouk!.studio_targets.length, 1);
  assert.strictEqual(ouk!.chatgpt_targets.length, 1);
  assert.strictEqual(ouk!.studio_targets[0].connection_status, 'registered');

  const moved = await upsertResourceTarget(project, {
    workspace_id: 'workspace-proj-default',
    resource_url: 'https://chatgpt.com/c/12345678-abcd-4def-9123-123456789abc',
    label: 'Bridge Chat',
  });
  assert.strictEqual(moved.workspace_id, 'workspace-proj-default');
  assert.strictEqual(moved.label, 'Bridge Chat');

  const afterMove = await getResourceRegistry(project);
  const oukAfterMove = afterMove.workspaces.find(item => item.workspace_id === 'workspace-ouk');
  const bridge = afterMove.workspaces.find(item => item.workspace_id === 'workspace-proj-default');
  assert.strictEqual(oukAfterMove!.chatgpt_targets.length, 0);
  assert.strictEqual(bridge!.chatgpt_targets.length, 1);

  assert.strictEqual(await removeResourceTarget(studioTarget.target_id), true);
  assert.strictEqual(await removeResourceTarget(studioTarget.target_id), false);

  console.log('resourceRegistry.test.ts: all assertions passed');
} finally {
  for (const file of [workspaceFile, resourceFile]) {
    try { fs.unlinkSync(file); } catch { /* ignore */ }
  }
}
