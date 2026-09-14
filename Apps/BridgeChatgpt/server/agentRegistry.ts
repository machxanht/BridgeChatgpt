export type BridgeAgentId = 'chatgpt' | 'gemini' | 'sonnet' | 'opus' | 'codex' | 'astra';
export type BridgeTransport = 'browser' | 'cli';
export interface BridgeAgentRoute {
  id: BridgeAgentId;
  label: string;
  transport: BridgeTransport;
  runner: 'chatgpt-web' | 'agy' | 'codex';
  native_model: string;
  provider: 'openai' | 'google' | 'anthropic';
}

export const BRIDGE_AGENT_ROUTES: readonly BridgeAgentRoute[] = [
  { id:'chatgpt', label:'ChatGPT Standard', transport:'browser', runner:'chatgpt-web', native_model:'chatgpt-standard', provider:'openai' },
  { id:'gemini', label:'Gemini 3.8 Flash', transport:'cli', runner:'agy', native_model:'gemini-3.8-flash-high', provider:'google' },
  // Antigravity serves the Claude model slugs through the same Google account
  // and AGY profile as Gemini. There is no separate Claude web login in this
  // adapter; advertising Anthropic here made the account picker misleading.
  { id:'sonnet', label:'Claude Sonnet 4.6', transport:'cli', runner:'agy', native_model:'claude-sonnet-4-6', provider:'google' },
  { id:'opus', label:'Claude Opus 4.6', transport:'cli', runner:'agy', native_model:'claude-opus-4-6-thinking', provider:'google' },
  { id:'codex', label:'Codex Sol', transport:'cli', runner:'codex', native_model:'gpt-5.6-sol', provider:'openai' },
  { id:'astra', label:'Codex Astra', transport:'cli', runner:'codex', native_model:'gpt-6-astra', provider:'openai' },
] as const;

export function getAgentRoute(id: string): BridgeAgentRoute {
  const route = BRIDGE_AGENT_ROUTES.find(item => item.id === id);
  if (!route) throw new Error(`Unknown Bridge agent: ${id}`);
  return route;
}
