import type { ClaimedTurn } from '../server/chatRuntime.js';
import type { BridgeAgentId } from '../server/agentRegistry.js';
import type { NativeFinal } from './nativeAdapters.js';
import { ResultOutbox } from './resultOutbox.js';

export interface NativeExecution {
  result: Promise<NativeFinal>;
  /** Resolves only after the OS confirms the entire owned process tree stopped. */
  stop(): Promise<boolean>;
}
export interface RunnerDependencies {
  request<T>(route: string, token: string, body: unknown): Promise<T>;
  launch(turn: ClaimedTurn): Promise<NativeExecution>;
  journal(turn: ClaimedTurn | null): Promise<void>;
  outbox: ResultOutbox;
}

/** Serial coordinator. No provider credentials or Bridge tokens enter launch specs. */
export class NativeRunner {
  private active = false;
  private fencedAttempt: string | null = null;
  constructor(private deps: RunnerDependencies, private runtimeToken: string) {}
  async claim(agentIds: BridgeAgentId[], requestId: string) {
    return this.deps.request<{turn: ClaimedTurn} | null>('/claim', this.runtimeToken,
      { agent_ids: agentIds, request_id: requestId, wait_ms: 20000 });
  }
  async deliver(turn: ClaimedTurn) {
    if (this.fencedAttempt && this.fencedAttempt !== turn.attempt_id) throw new Error('Another attempt owns this runner fence');
    const record = this.deps.outbox.read(turn.attempt_id);
    const response = await this.deps.request<{hash: string}>('/attempt/complete', turn.attempt_token,
      { answer: record.final.answer, native_session_id: record.final.sessionId, execution_complete: true });
    this.deps.outbox.acknowledge(turn.attempt_id, response.hash);
    await this.deps.journal(null);
    this.fencedAttempt = null;
  }
  async execute(turn: ClaimedTurn, signal?: AbortSignal) {
    if (this.active || this.fencedAttempt) throw new Error('A native execution already owns this runner');
    if (turn.transport !== 'cli') throw new Error('Browser claims cannot enter the native runner');
    this.active = true;
    this.fencedAttempt = turn.attempt_id;
    let execution: NativeExecution | undefined;
    let heartbeat: ReturnType<typeof setTimeout> | undefined;
    let stopped = false, finalStored = false, finished = false;
    let rejectLease!: (reason: Error) => void;
    const lostLease = new Promise<never>((_, reject) => { rejectLease = reject; });
    const abort = () => rejectLease(new Error('Runner interrupted'));
    const beat = async () => {
      try {
        if (Date.now() >= Date.parse(turn.deadline_at)) throw new Error('Native execution deadline reached');
        await this.deps.request('/attempt/heartbeat', turn.attempt_token, {});
        if (!finished) heartbeat = setTimeout(beat, 10000);
      } catch { rejectLease(new Error('Native execution lease lost')); }
    };
    try {
      await this.deps.journal(turn); // Durable before launching anything.
      if (signal?.aborted) throw new Error('Runner interrupted');
      await this.deps.request('/attempt/heartbeat', turn.attempt_token, {});
      execution = await this.deps.launch(turn);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      heartbeat = setTimeout(beat, 10000);
      const final = await Promise.race([execution.result, lostLease]);
      stopped = await execution.stop();
      if (!stopped) throw new Error('Native process tree cleanup was not confirmed');
      this.deps.outbox.store({attemptId: turn.attempt_id, turnId: turn.turn_id,
        conversationId: turn.conversation_id, final});
      finalStored = true;
      await this.deliver(turn);
    } catch (error) {
      // A lost completion response must replay the persisted final, never native input.
      if (finalStored) throw error;
      stopped = execution ? await execution.stop().catch(() => false) : true;
      await this.deps.request('/attempt/fail', turn.attempt_token,
        {code: 'native_execution_failed', message: error instanceof Error ? error.message : 'Native execution failed'});
      if (stopped) {
        await this.deps.request('/cleanup', this.runtimeToken,
          {attempt_id: turn.attempt_id, processes_stopped: true});
        await this.deps.journal(null);
        this.fencedAttempt = null;
      }
      throw error;
    } finally {
      finished = true;
      if (heartbeat) clearTimeout(heartbeat);
      signal?.removeEventListener('abort', abort);
      this.active = false;
    }
  }
}
