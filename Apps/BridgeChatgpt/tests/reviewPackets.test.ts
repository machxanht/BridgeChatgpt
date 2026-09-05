import assert from 'node:assert';
import { parseReviewPacket } from '../server/reviewPackets.js';
import type { Task } from '../src/types.js';

const base: Task = {
  id: 'TASK-999',
  title: 'Review packet test',
  description: 'test',
  priority: 'medium',
  status: 'review',
  assignee: 'gemini',
  created_by: 'chatgpt',
  created_at: '2026-09-02T00:00:00.000Z',
  updated_at: '2026-09-02T00:01:00.000Z',
  related_files: [],
  related_finding: null,
  result: JSON.stringify({
    executor: 'google-ai-studio',
    summary: 'Done',
    tests: { lint: 'pass' },
    files_changed: ['src/example.ts'],
    artifacts: [{ path: 'src/example.ts', operation: 'create', content: 'ok\n', base_sha: null }],
    submitted_at: '2026-09-02T00:01:00.000Z',
  }),
};

const packet = parseReviewPacket(base);
assert.ok(packet);
assert.strictEqual(packet.task_id, 'TASK-999');
assert.strictEqual(packet.executor, 'google-ai-studio');
assert.deepStrictEqual(packet.files_changed, ['src/example.ts']);
assert.strictEqual(packet.artifacts.length, 1);

assert.strictEqual(parseReviewPacket({ ...base, status: 'working' }), null);
assert.strictEqual(parseReviewPacket({ ...base, id: '../unsafe' }), null);
assert.strictEqual(parseReviewPacket({ ...base, result: 'not-json' }), null);
assert.strictEqual(parseReviewPacket({ ...base, result: JSON.stringify({ executor: 'other', summary: 'x', files_changed: [], artifacts: [] }) }), null);

console.log('Review packet contract tests passed');
