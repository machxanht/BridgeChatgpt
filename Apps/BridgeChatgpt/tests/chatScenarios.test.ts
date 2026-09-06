import assert from 'node:assert';
import { looksLikeQuestion, shouldAutoDebate } from '../src/chatRouting.js';

assert.strictEqual(looksLikeQuestion('Theo tụi mày Astra mạnh nhất hay ko'), true);
assert.strictEqual(looksLikeQuestion('Tool này làm được 3D không?'), true);
assert.strictEqual(looksLikeQuestion('Tạo folder project mới tên Khla Si Ko'), false);
assert.strictEqual(looksLikeQuestion('Sửa auth rồi chạy test'), false);

assert.strictEqual(shouldAutoDebate('Theo tụi mày cái nào tốt hơn?', ['idle'], ['registered']), true);
assert.strictEqual(shouldAutoDebate('Theo tụi mày cái nào tốt hơn?', ['offline'], ['registered']), false);
assert.strictEqual(shouldAutoDebate('Theo tụi mày cái nào tốt hơn?', ['idle'], ['offline']), false);
assert.strictEqual(shouldAutoDebate('Tạo folder mới', ['idle'], ['registered']), false);

console.log('chatScenarios.test.ts: all assertions passed');
