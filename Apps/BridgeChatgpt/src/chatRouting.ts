export function looksLikeQuestion(value: string) {
  const text = value.trim().toLowerCase();
  if (text.includes('?')) return true;
  return /(^|\s)(theo|tại sao|tai sao|vì sao|vi sao|sao|có nên|co nen|là gì|la gi|ai|cái gì|cai gi)(\s|$)/.test(text)
    || /\b(hay|hoặc|or)\b.*\b(không|ko|khong)\b/.test(text);
}

export function targetUsable(status: string | undefined) {
  return status !== 'offline';
}

export function requiresAction(value: string) {
  const text = value.trim().toLowerCase();
  // Questions about performing an action remain chat; explicit imperatives use the workflow.
  if (/^(?:chatgpt[,:]?\s+)?(?:làm sao|cách nào|hướng dẫn|tại sao|vì sao|how|why|what)\s/u.test(text)) return false;
  return /(?:^|[\s,;])(?:sửa|fix|implement|deploy|push|merge|commit|audit|refactor|cài đặt|tạo (?:file|folder|project|app|repo)|chạy (?:test|build|lệnh)|run (?:tests?|build))(?=\s|$)/u.test(text);
}

export function wantsMultiAgentDebate(value: string) {
  const text = value.trim().toLowerCase();
  const explicitGroupIntent = /(?:^|\s)(tụi mày|tui may|tụi bay|tui bay|cả hai|ca hai|hai đứa|hai dua|tranh luận|tranh luan|debate|phản biện|phan bien|multi-agent|multi agent)(?=\s|[,.!?]|$)/u.test(text);
  const namesBothAgents = /\b(chatgpt|gpt)\b/.test(text) && /\b(ai studio|studio|gemini)\b/.test(text);
  return explicitGroupIntent || namesBothAgents;
}

export function shouldAutoDebate(text: string, studioStatuses: string[], chatgptStatuses: string[]) {
  return !requiresAction(text)
    && wantsMultiAgentDebate(text)
    && studioStatuses.some(targetUsable)
    && chatgptStatuses.some(targetUsable);
}

export type MultiRoleStep = {
  assignee: 'chatgpt' | 'gemini';
  label: 'ChatGPT' | 'AI Studio';
  instruction: string;
};

export function buildMultiRolePlan(value: string): MultiRoleStep[] {
  if (!requiresAction(value)) return [];
  const matches = [...value.matchAll(/\b(chatgpt|gpt|ai\s+studio|studio|gemini)\b/gi)];
  if (matches.length < 2) return [];
  const providers = new Set(matches.map(match => /studio|gemini/i.test(match[0]) ? 'gemini' : 'chatgpt'));
  if (providers.size < 2) return [];

  return matches.map((match, index) => {
    const start = (match.index || 0) + match[0].length;
    const end = index + 1 < matches.length ? (matches[index + 1].index || value.length) : value.length;
    const assignee = /studio|gemini/i.test(match[0]) ? 'gemini' as const : 'chatgpt' as const;
    const instruction = value.slice(start, end).replace(/^[\s:,.\-–—]+/, '').trim();
    return {
      assignee,
      label: assignee === 'gemini' ? 'AI Studio' : 'ChatGPT',
      instruction: instruction || 'Handle your assigned role in the user request and report a concrete result.',
    };
  });
}
