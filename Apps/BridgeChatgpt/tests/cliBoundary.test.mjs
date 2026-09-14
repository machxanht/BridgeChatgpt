import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const worker = fileURLToPath(new URL('../scripts/cli-agent-worker.mjs', import.meta.url));
// Launch the actual entrypoint with no credentials. It must stop before Railway
// bootstrap, a task claim, or a provider process. An env flag cannot bypass it.
const result = spawnSync(process.execPath, [worker], {
  encoding: 'utf8', timeout: 5000,
  env: { BRIDGE_EXECUTION_BOUNDARY_VERIFIED: 'true', BRIDGE_MCP_TOKEN: 'secret-must-not-be-printed' },
});
assert.equal(result.error, undefined);
assert.equal(result.status, 78);
assert.match(result.stderr, /BRIDGE_EXECUTION_BOUNDARY_REQUIRED/);
assert.equal(result.stdout, '');
assert(!result.stderr.includes('secret-must-not-be-printed'));
console.log('Legacy CLI startup boundary test passed; restricted native execution remains blocked');
