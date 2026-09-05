import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  bindAgentInstance,
  getWorkspaceRegistry,
  registerAgentInstance,
  upsertWorkspace,
} from '../server/workspaceRegistry.js';
import { resolveStudioSessionSelection } from '../server/studioSessionPairingGuard.js';
import { attachTaskBinding, extractTaskBinding } from '../server/taskBinding.js';
import type { ProjectConfig } from '../src/types.js';

const tempFile = path.join(os.tmpdir(), `bridge-workspace-registry-${process.pid}-${Date.now()}.json`);
process.env.BRIDGE_WORKSPACE_REGISTRY_PATH = tempFile;

const project: ProjectConfig = {
  id: 'proj-default',
  project_name: 'BridgeChatgpt',
  project_root: '.',
  repository_url: 'https://github.com/machxanht/BridgeChatgpt',
  default_branch: 'main',
  current_goal: 'test',
  test_command: 'npm run lint',
  auto_review: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

try {
  const initial = await getWorkspaceRegistry(project);
  assert.strictEqual(initial.workspaces.length, 1);
  assert.strictEqual(initial.workspaces[0].project_id, 'proj-default');
  assert.strictEqual(initial.workspaces[0].execution_target, 'studio');
  assert.strictEqual(initial.workspaces[0].local_path, 'Apps/BridgeChatgpt');

  const legacySelection = resolveStudioSessionSelection(initial, {});
  assert.strictEqual(legacySelection.mode, 'legacy');

  const second = await upsertWorkspace(project, {
    workspace_id: 'workspace-khmer',
    project_id: 'project-khmer',
    project_name: 'Khmer Learning App',
    repository_url: 'https://github.com/example/khmer-app',
    branch: 'main',
    execution_target: 'pc',
  });
  assert.strictEqual(second.workspace_id, 'workspace-khmer');
  assert.strictEqual(second.execution_target, 'pc');
  assert.strictEqual(second.local_path, 'Apps/Khmer Learning App');

  const chatgpt = await registerAgentInstance(project, {
    agent_instance_id: 'chatgpt-a-01',
    provider: 'chatgpt',
    workspace_id: 'workspace-khmer',
    project_id: 'project-khmer',
    account_label: 'account-a@example.com',
    session_label: 'C-01',
    status: 'idle',
  });
  assert.strictEqual(chatgpt.project_id, 'project-khmer');

  const studio = await registerAgentInstance(project, {
    agent_instance_id: 'studio-b-03',
    provider: 'google-ai-studio',
    workspace_id: initial.workspaces[0].workspace_id,
    account_label: 'account-b@example.com',
    session_label: 'G-03',
    status: 'active',
  });
  assert.strictEqual(studio.project_id, 'proj-default');

  const singleSnapshot = await getWorkspaceRegistry(project);
  const singleSelection = resolveStudioSessionSelection(singleSnapshot, {});
  assert.strictEqual(singleSelection.mode, 'resolved');
  assert.strictEqual(singleSelection.instance?.agent_instance_id, 'studio-b-03');

  const rebound = await bindAgentInstance(project, {
    agent_instance_id: 'studio-b-03',
    workspace_id: 'workspace-khmer',
  });
  assert.strictEqual(rebound.project_id, 'project-khmer');

  let snapshot = await getWorkspaceRegistry(project);
  const khmer = snapshot.workspaces.find(item => item.workspace_id === 'workspace-khmer');
  assert.ok(khmer);
  assert.strictEqual(khmer!.chatgpt_instances.length, 1);
  assert.strictEqual(khmer!.studio_instances.length, 1);

  const khmerSingle = resolveStudioSessionSelection(snapshot, { workspace_id: 'workspace-khmer' });
  assert.strictEqual(khmerSingle.mode, 'resolved');
  assert.strictEqual(khmerSingle.instance?.agent_instance_id, 'studio-b-03');

  await registerAgentInstance(project, {
    agent_instance_id: 'studio-b-04',
    provider: 'google-ai-studio',
    workspace_id: 'workspace-khmer',
    project_id: 'project-khmer',
    account_label: 'account-b@example.com',
    session_label: 'G-04',
    status: 'idle',
  });

  snapshot = await getWorkspaceRegistry(project);
  const ambiguous = resolveStudioSessionSelection(snapshot, { workspace_id: 'workspace-khmer' });
  assert.strictEqual(ambiguous.mode, 'ambiguous');
  assert.strictEqual(ambiguous.candidates.length, 2);

  const explicit = resolveStudioSessionSelection(snapshot, {
    workspace_id: 'workspace-khmer',
    agent_instance_id: 'studio-b-04',
  });
  assert.strictEqual(explicit.mode, 'resolved');
  assert.strictEqual(explicit.instance?.session_label, 'G-04');

  assert.throws(
    () => resolveStudioSessionSelection(snapshot, {
      workspace_id: initial.workspaces[0].workspace_id,
      agent_instance_id: 'studio-b-04',
    }),
    /belongs to workspace-khmer/,
  );

  const encoded = attachTaskBinding('Do the work.', {
    version: 1,
    workspace_id: 'workspace-khmer',
    project_id: 'project-khmer',
    agent_instance_id: 'studio-b-03',
  });
  const decoded = extractTaskBinding(encoded.description);
  assert.strictEqual(decoded.description, 'Do the work.');
  assert.strictEqual(decoded.binding?.agent_instance_id, 'studio-b-03');

  console.log('workspaceRegistry.test.ts: all assertions passed');
} finally {
  try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
}
