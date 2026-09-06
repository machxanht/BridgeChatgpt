import type { Task } from './types.js';

export const CHAT_MARKER = '<!-- BRIDGE_CHAT_V1 -->';
export const DEBATE_MARKER = '<!-- BRIDGE_DEBATE_V1 -->';
export function isFastChatTask(task: Pick<Task, 'description'>) {
  return task.description.includes(CHAT_MARKER);
}
export function isDiscussionTask(task: Pick<Task, 'description'>) {
  return isFastChatTask(task) || task.description.includes(DEBATE_MARKER);
}

// Compatibility for stored results emitted before direct chat completions.
// Only unwrap known Bridge envelopes; ordinary answer text is preserved verbatim.
export function userFacingResult(value: string): string {
  let answer = value.replace(/^Task TASK-\d+ "[^\n]*" marked as (?:completed|review)\. Result: /, '');
  // Legacy reviews sometimes held only the summary, with no original result.
  answer = answer.replace(/^\s*\[Review APPROVED by [^\]]+\]: ([\s\S]*?) \(Automated tests verified: (?:Yes|No)\)\s*$/, '$1');
  answer = answer.split(/\n\n\[(?:Review (?:APPROVED|CHANGES REQUESTED) by |Automated CI Check at )/)[0];
  try {
    const envelope = JSON.parse(answer);
    if (envelope.executor === 'google-ai-studio' && typeof envelope.summary === 'string') return envelope.summary;
  } catch { /* Plain text answer. */ }
  return answer;
}

export function originalChatText(description: string): string {
  return description.split(/\n\n<!-- BRIDGE_(?:CHAT_V1|DEBATE_V1|ATTACHMENTS_V1|TASK_BINDING_V1)/)[0];
}
