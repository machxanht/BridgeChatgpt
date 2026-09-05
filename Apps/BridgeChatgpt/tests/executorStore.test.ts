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
  root_label: 'BridgeChatgpt',
  platform: 'test/test',
  capabilities: ['fs.read', 'git.status'],
});
assert.equal(node.node_id, 'pc-test-001');

const job = await createExecutorJob({
  workspace_id: 'workspace-proj-default',
  project_id: 'proj-default',
  action: 'fs.read',
  payload: { path: 'README.md' },
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

fs.rmSync(dir, { recursive: true, force: true });
console.log('executorStore.test.ts passed');
