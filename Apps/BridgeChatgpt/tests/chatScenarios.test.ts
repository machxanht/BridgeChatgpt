import assert from 'node:assert';
import { buildMultiRolePlan, looksLikeQuestion, shouldAutoDebate } from '../src/chatRouting.js';

assert.strictEqual(looksLikeQuestion('Theo tụi mày Astra mạnh nhất hay ko'), true);
assert.strictEqual(looksLikeQuestion('Tool này làm được 3D không?'), true);
assert.strictEqual(looksLikeQuestion('Tạo folder project mới tên Khla Si Ko'), false);
assert.strictEqual(looksLikeQuestion('Sửa auth rồi chạy test'), false);

assert.strictEqual(shouldAutoDebate('Theo tụi mày cái nào tốt hơn?', ['idle'], ['registered']), true);
assert.strictEqual(shouldAutoDebate('Tool này làm được 3D không?', ['idle'], ['registered']), false);
assert.strictEqual(shouldAutoDebate('Tại sao nó chậm vậy?', ['idle'], ['registered']), false);
assert.strictEqual(shouldAutoDebate('Theo tụi mày cái nào tốt hơn?', ['offline'], ['registered']), false);
assert.strictEqual(shouldAutoDebate('Theo tụi mày cái nào tốt hơn?', ['idle'], ['offline']), false);
assert.strictEqual(shouldAutoDebate('Tạo folder mới', ['idle'], ['registered']), false);

const rolePlan = buildMultiRolePlan('Hãy audit repo, ChatGPT ra plan và code, Studio làm UI');
assert.strictEqual(rolePlan.length, 2);
assert.strictEqual(rolePlan[0].assignee, 'chatgpt');
assert.match(rolePlan[0].instruction, /ra plan/i);
assert.strictEqual(rolePlan[1].assignee, 'gemini');
assert.match(rolePlan[1].instruction, /làm UI/i);
assert.deepStrictEqual(buildMultiRolePlan('ChatGPT sửa auth thôi'), []);
assert.deepStrictEqual(buildMultiRolePlan('Theo ChatGPT và Studio cái nào mạnh hơn?'), []);

console.log('chatScenarios.test.ts: all assertions passed');

const { requiresAction, wantsMultiAgentDebate } = await import('../src/chatRouting.js');
for (const text of ['Chatgpt mày biết Astra không?', 'Railway dùng để làm gì?', 'Xin chào', 'Chatgpt mày có biết về Astra ko, làm sao t dùng dc nó trong bridge này']) {
  assert.equal(requiresAction(text), false);
  assert.equal(shouldAutoDebate(text, ['idle'], ['registered']), false);
}
assert.equal(requiresAction('Sửa bug X rồi chạy test'), true);
assert.equal(requiresAction('Làm sao sửa bug này?'), false);
for (const text of ['cả hai cho ý kiến', 'tranh luận về chủ đề này', 'phản biện giúp tôi', 'Theo tụi mày ChatGPT và Studio thì cách nào tốt hơn?']) {
  assert.equal(wantsMultiAgentDebate(text), true);
  assert.equal(shouldAutoDebate(text, ['idle'], ['idle']), true);
}
