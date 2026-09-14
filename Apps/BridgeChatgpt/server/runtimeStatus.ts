import type { BridgeAgentId } from './agentRegistry.js';

type RuntimeHeartbeat = {
  transport: 'cli' | 'browser';
  subject: string;
  agents: BridgeAgentId[];
  /** Per-agent state from the local runner. A blocked agent is not claimable
   * even when it remains in the static qualification set. */
  agent_status?: Partial<Record<BridgeAgentId, { state: 'ready' | 'blocked'; reason?: string; updated_at: string }>>;
  version?: string;
  source_sha?: string;
  managed_projects?: boolean;
  last_seen_at: string;
  expires_at: number;
};

const heartbeats = new Map<string, RuntimeHeartbeat>();

export function recordRuntimeHeartbeat(input: Omit<RuntimeHeartbeat,'last_seen_at'|'expires_at'>, ttlMs = 45_000) {
  const key = `${input.transport}:${input.subject}`;
  const heartbeat: RuntimeHeartbeat = { ...input, last_seen_at:new Date().toISOString(), expires_at:Date.now()+ttlMs };
  heartbeats.set(key, heartbeat);
  return heartbeat;
}

export function runtimeAgentAvailable(agent: BridgeAgentId): boolean {
  const now=Date.now();
  return [...heartbeats.values()].some(item => item.expires_at>now && item.agents.includes(agent) && item.agent_status?.[agent]?.state !== 'blocked');
}

export function runtimeAgentStatus(agent: BridgeAgentId) {
  const now=Date.now();
  let blocked: { state:'blocked'; reason?:string; updated_at:string; online:true } | null = null;
  for (const item of heartbeats.values()) {
    if (item.expires_at<=now) continue;
    const state=item.agent_status?.[agent];
    if (state?.state==='blocked') { blocked={ state:'blocked', reason:state.reason, updated_at:state.updated_at, online:true }; continue; }
    if (!item.agents.includes(agent)) continue;
    return { state:'ready' as const, updated_at:state?.updated_at||item.last_seen_at, online:true };
  }
  if (blocked) return blocked;
  return { state:'offline' as const, online:false };
}

/** A validated active attempt proves liveness, but cannot add model capabilities. */
export function touchRuntimeHeartbeat(transport: string | undefined, subject: string) {
  const current = heartbeats.get(`${transport}:${subject}`);
  if (!current) return;
  current.last_seen_at = new Date().toISOString();
  current.expires_at = Date.now() + 45_000;
}

export function runtimeSnapshot() {
  const now=Date.now();
  for (const [key,item] of heartbeats) if(item.expires_at<=now) heartbeats.delete(key);
  return [...heartbeats.values()].map(({expires_at,...item})=>({ ...item, online:true }));
}
