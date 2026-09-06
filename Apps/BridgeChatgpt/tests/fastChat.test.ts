import assert from 'node:assert/strict';
import { createTask, deleteTask, getMessages, getTask, updateTask, getProject, updateProject } from '../server/db.js';
import { executeTool } from '../server/mcp.js';
import { checkAndTriggerAutoReview } from '../server/autoReview.js';
import { CHAT_MARKER, DEBATE_MARKER, userFacingResult, originalChatText } from '../src/chatMode.js';

const ids: string[] = [];
const answer = 'Astra là tên bạn đang hỏi.\n\nBạn muốn tìm hiểu cách dùng trong Bridge?';
try {
  for (const decision of ['approve', 'request_changes']) {
    const task = await createTask({ title: 'Fast chat', description: `Chatgpt mày biết Astra không?\n\n${CHAT_MARKER}`, assignee: 'chatgpt', created_by: 'human' });
    ids.push(task.id);
    await executeTool('task_update', { id: task.id, status: 'review', result: answer }, 'chatgpt');
    assert.equal((await getTask(task.id))?.status, 'completed');
    await executeTool('task_review', { id: task.id, decision, summary: 'Do not append this', tests_verified: true }, 'chatgpt');
    assert.equal((await getTask(task.id))?.result, answer);
    const messages = (await getMessages({ task_id: task.id })).filter(m => m.type === 'result');
    assert.equal(messages.length, 1);
    assert.equal(messages[0].content, answer);
    assert.equal(messages[0].to, 'human');
  }
  const debate = await createTask({ title: 'Debate', description: `Theo tụi mày?\n\n${DEBATE_MARKER}`, assignee: 'gemini', created_by: 'human' });
  ids.push(debate.id);
  await updateTask(debate.id, { status: 'review', result: 'Studio opinion' }, 'gemini');
  const project = await getProject();
  await updateProject({ auto_review: true });
  try {
    const cycle = await checkAndTriggerAutoReview();
    assert.equal(cycle.step, 'idle');
    assert.equal((await getTask(debate.id))?.result, 'Studio opinion');
  } finally { await updateProject({ auto_review: project.auto_review }); }
  await executeTool('task_review', { id: debate.id, decision: 'approve', summary: answer }, 'chatgpt');
  assert.equal((await getTask(debate.id))?.result, answer);
  const coding = await createTask({ title: 'Sửa bug X rồi chạy test', description: 'Sửa bug X rồi chạy test', assignee: 'gemini', created_by: 'human' });
  ids.push(coding.id);
  await updateTask(coding.id, { status: 'review', result: 'Implemented' });
  assert.equal((await getTask(coding.id))?.status, 'review');
  assert.equal(userFacingResult(`Task TASK-11 "Old chat" marked as completed. Result: ${answer}\n\n[Review APPROVED by chatgpt at old]: notes`), answer);
  assert.equal(userFacingResult(answer), answer);
  assert.equal(originalChatText(`Full untruncated question\nwith line two\n\n${CHAT_MARKER}\ninternal`), 'Full untruncated question\nwith line two');
  console.log('fastChat.test.ts: direct MCP completion, review bypass, debate CI exclusion, coding workflow PASS');
} finally { for (const id of ids) await deleteTask(id); }
