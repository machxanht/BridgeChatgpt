import assert from 'node:assert';
import { validateBatchTaskGraph } from '../server/batchOrchestrator.js';

const valid = validateBatchTaskGraph([
  {
    key: 'PLAN',
    title: 'Plan architecture',
    description: 'Define the implementation plan.',
    assignee: 'chatgpt',
  },
  {
    key: 'IMPLEMENT',
    title: 'Implement workspace changes',
    description: 'Apply the approved implementation in Studio.',
    assignee: 'gemini',
    depends_on: ['PLAN'],
  },
  {
    key: 'VERIFY',
    title: 'Verify result',
    description: 'Review build and test evidence.',
    assignee: 'chatgpt',
    depends_on: ['IMPLEMENT'],
  },
]);

assert.strictEqual(valid.length, 3);
assert.deepStrictEqual(valid[1].depends_on, ['PLAN']);
assert.strictEqual(valid[0].priority, 'medium');

assert.throws(() => validateBatchTaskGraph([
  { key: 'A', title: 'A', description: 'A', assignee: 'chatgpt', depends_on: ['B'] },
  { key: 'B', title: 'B', description: 'B', assignee: 'gemini', depends_on: ['A'] },
]), /cycle/i);

assert.throws(() => validateBatchTaskGraph([
  { key: 'A', title: 'A', description: 'A', assignee: 'chatgpt', depends_on: ['MISSING'] },
]), /missing task/i);

assert.throws(() => validateBatchTaskGraph([
  { key: 'A', title: 'A', description: 'A', assignee: 'chatgpt' },
  { key: 'A', title: 'Duplicate', description: 'Duplicate', assignee: 'gemini' },
]), /duplicate/i);

assert.throws(() => validateBatchTaskGraph([], 10), /at least one task/i);

console.log('batchOrchestrator.test.ts: all assertions passed');
