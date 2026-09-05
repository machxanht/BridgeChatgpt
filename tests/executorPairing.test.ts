import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  issueExecutorPairing,
  redeemExecutorPairing,
  resetExecutorPairingStoreForTests,
  verifyPairedExecutorToken,
} from '../server/executorPairing.js';

const tempFile = path.join(os.tmpdir(), `bridge-executor-auth-${process.pid}-${Date.now()}.json`);
process.env.BRIDGE_EXECUTOR_AUTH_STORE_PATH = tempFile;

try {
  await resetExecutorPairingStoreForTests();
  const issued = await issueExecutorPairing({ workspace_id: 'workspace-test', project_id: 'project-test' });
  assert.match(issued.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const redeemed = await redeemExecutorPairing({ code: issued.code.toLowerCase(), node_id: 'pc-test-node' });
  assert.strictEqual(redeemed.workspace_id, 'workspace-test');
  assert.strictEqual(redeemed.project_id, 'project-test');
  assert.ok(redeemed.token.startsWith('bex_'));
  assert.deepStrictEqual(verifyPairedExecutorToken(redeemed.token), {
    node_id: 'pc-test-node',
    workspace_id: 'workspace-test',
    project_id: 'project-test',
  });
  assert.strictEqual(verifyPairedExecutorToken('bex_wrong_token_value_123456789'), null);
  await assert.rejects(
    () => redeemExecutorPairing({ code: issued.code, node_id: 'pc-test-node-2' }),
    /invalid or already used/,
  );
  console.log('executorPairing.test.ts passed');
} finally {
  try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
}
