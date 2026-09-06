import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  claimExecutorJob,
  completeExecutorJob,
  createExecutorJob,
  getExecutorSnapshot,
  registerExecutorNode,
  resetExecutorStoreForTests,
} from '../server/executorStore.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-executor-store-'));
process.env.BRIDGE_EXECUTOR_STORE_PATH = path.join(dir, 'executors.json');

await resetExecutorStoreForTests();

const node = await registerExecutorNode({
  node_id: 'pc-test-001',
  name: 'Test PC',
  workspace_id: 'workspace-proj-default',
  project_id: 'proj-default',
  root_label: 'Bridge',
  platform: 'test/test',
  capabilities: ['fs.read', 'git.status'],
});
assert.equal(node.node_id, 'pc-test-001');

const job = await createExecutorJob({
  workspace_id: 'workspace-proj-default',
  project_id: 'proj-default',
  action: 'fs.read',
  payload: { path: 'README.md', cwd: 'Apps/BridgeChatgpt' },
  created_by: 'chatgpt',
});
assert.equal(job.status, 'pending');

const claimed = await claimExecutorJob({
  node_id: node.node_id,
  workspace_id: node.workspace_id,
  project_id: node.project_id,
});
assert.equal(claimed?.job_id, job.job_id);
assert.equal(claimed?.status, 'running');

const completed = await completeExecutorJob({
  node_id: node.node_id,
  job_id: job.job_id,
  ok: true,
  result: { content: 'ok' },
});
assert.equal(completed.status, 'completed');

const snapshot = await getExecutorSnapshot({ workspace_id: node.workspace_id, project_id: node.project_id });
assert.equal(snapshot.nodes.length, 1);
assert.equal(snapshot.nodes[0].connection_status, 'online');
assert.equal(snapshot.jobs[0].job_id, job.job_id);
assert.equal(snapshot.jobs[0].result?.content, 'ok');

// Regression: one paired PC node must be reusable by another Apps project.
const projectBJob = await createExecutorJob({
  workspace_id: 'workspace-project-b',
  project_id: 'project-b',
  node_id: node.node_id,
  action: 'git.status',
  payload: { cwd: 'Apps/Project-B' },
  created_by: 'human',
});
assert.equal(projectBJob.workspace_id, 'workspace-project-b');
assert.equal(projectBJob.node_id, node.node_id);

const claimedProjectB = await claimExecutorJob({
  node_id: node.node_id,
  workspace_id: node.workspace_id,
  project_id: node.project_id,
});
assert.equal(claimedProjectB?.job_id, projectBJob.job_id);
assert.equal(claimedProjectB?.workspace_id, 'workspace-project-b');
assert.equal(claimedProjectB?.project_id, 'project-b');
assert.equal(claimedProjectB?.payload.cwd, 'Apps/Project-B');

const projectBSnapshot = await getExecutorSnapshot({ workspace_id: 'workspace-project-b', project_id: 'project-b' });
assert.equal(projectBSnapshot.nodes.length, 1, 'machine-scoped node should be visible in every project snapshot');
assert.equal(projectBSnapshot.nodes[0].node_id, node.node_id);
assert.equal(projectBSnapshot.jobs.length, 1);
assert.equal(projectBSnapshot.jobs[0].job_id, projectBJob.job_id);

fs.rmSync(dir, { recursive: true, force: true });
console.log('executorStore.test.ts passed');
