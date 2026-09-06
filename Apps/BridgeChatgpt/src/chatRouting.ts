export function looksLikeQuestion(value: string) {
  const text = value.trim().toLowerCase();
  if (text.includes('?')) return true;
  return /(^|\s)(theo|tại sao|tai sao|vì sao|vi sao|sao|có nên|co nen|là gì|la gi|ai|cái gì|cai gi)(\s|$)/.test(text)
    || /\b(hay|hoặc|or)\b.*\b(không|ko|khong)\b/.test(text);
}

export function targetUsable(status: string | undefined) {
  return status !== 'offline';
}

export function shouldAutoDebate(text: string, studioStatuses: string[], chatgptStatuses: string[]) {
  return looksLikeQuestion(text)
    && studioStatuses.some(targetUsable)
    && chatgptStatuses.some(targetUsable);
}
