import assert from 'node:assert';
import {
  attachExecutionPayload,
  extractExecutionPayload,
  normalizeExecutionPayload,
  validateExecutionPayload,
} from '../server/executionPayload.js';

const fortySha = '0123456789abcdef0123456789abcdef01234567';

const payload = normalizeExecutionPayload({
  mode: 'chatgpt_primary',
  instructions: 'Apply the supplied file exactly, then run the requested checks.',
  artifacts: [
    {
      path: 'src/example.ts',
      operation: 'update',
      content: 'export const value = 2;\n',
      base_sha: fortySha,
    },
    {
      path: 'src/new-file.ts',
      operation: 'create',
      content: 'export const created = true;\n',
      base_sha: null,
    },
  ],
  requested_checks: ['npm run lint'],
});

assert.strictEqual(validateExecutionPayload(payload), null);

const encoded = attachExecutionPayload('Implement the change requested by ChatGPT.', payload);
const decoded = extractExecutionPayload(encoded.description);
assert.strictEqual(decoded.description, 'Implement the change requested by ChatGPT.');
assert.deepStrictEqual(decoded.payload, payload);

const unsafe = normalizeExecutionPayload({
  mode: 'chatgpt_primary',
  artifacts: [{ path: '.env', operation: 'create', content: 'SECRET=1', base_sha: null }],
});
assert.ok(validateExecutionPayload(unsafe)?.includes('not allowed'));

const missingSha = normalizeExecutionPayload({
  mode: 'chatgpt_primary',
  artifacts: [{ path: 'src/example.ts', operation: 'update', content: 'changed' }],
});
assert.ok(validateExecutionPayload(missingSha)?.includes('40-character Git blob SHA'));

const empty = normalizeExecutionPayload({ mode: 'shared' });
assert.ok(validateExecutionPayload(empty)?.includes('must contain'));

console.log('executionPayload.test.ts: all assertions passed');
