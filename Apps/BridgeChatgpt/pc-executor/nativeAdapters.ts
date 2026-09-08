import path from 'node:path';
import { getAgentRoute, type BridgeAgentId } from '../server/agentRegistry.js';

export interface NativeRequest {
  agentId: BridgeAgentId; cwd: string; content: string; sessionId?: string | null;
  outputFile: string; executable: string;
}
export interface LaunchSpec { executable: string; args: string[]; cwd: string; stdin: string; outputFile?: string }
export class NativeFailure extends Error {
  constructor(public code: string, message: string) { super(message); }
}
const fail = (code: string, message: string): never => { throw new NativeFailure(code, message); };
function session(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,160}$/.test(value)) return fail('invalid_session', 'Native session identity is missing or invalid');
  return value;
}
export function buildNativeLaunch(input: NativeRequest): LaunchSpec {
  const route = getAgentRoute(input.agentId);
  if (route.transport !== 'cli') return fail('wrong_transport', 'Sol 5.6 requires the browser transport');
  if (!path.isAbsolute(input.cwd) || !path.isAbsolute(input.executable) || !path.isAbsolute(input.outputFile)) return fail('invalid_path', 'Native launch paths must be absolute');
  if (!input.content.trim() || input.content.length > 100000) return fail('invalid_prompt', 'Prompt is empty or too long');
  const nativeSession = input.sessionId ? session(input.sessionId) : null;
  if (route.runner === 'agy') return {
    executable: input.executable, cwd: input.cwd,
    args: ['--sandbox', '--model', route.native_model, '--add-dir', input.cwd, '--input-format', 'stream-json', '--output-format', 'stream-json', ...(nativeSession ? ['--conversation', nativeSession] : [])],
    stdin: JSON.stringify({ event: 'user', message: { content: input.content } }) + '\n',
  };
  // Config overrides also reach `exec resume`; its parser does not accept
  // exec's sandbox/cwd flags. The nested Windows backend must be explicit:
  // the default can otherwise expose only a read-only tool environment.
  const windows = process.platform === 'win32' ? [
    '-c', 'windows.sandbox="unelevated"',
    '-c', 'windows.sandbox_private_desktop=false',
    '-c', `developer_instructions=${JSON.stringify('Use cmd.exe explicitly for shell commands and use cmd syntax. Use the native apply_patch tool for file edits. PowerShell cannot initialize inside this runner\'s nested Windows sandbox.')}`,
  ] : [];
  return {
    executable: input.executable, cwd: input.cwd, outputFile: input.outputFile,
    args: ['-c', 'sandbox_mode="workspace-write"', '-c', 'approval_policy="never"', ...windows, '-C', input.cwd, 'exec', ...(nativeSession ? ['resume', nativeSession] : []), '-m', route.native_model, '--json', '-o', input.outputFile, '-'],
    stdin: input.content + '\n',
  };
}

export interface NativeFinal { answer: string; sessionId: string; model: string; usage: unknown }
export class NativeTranscript {
  private buffer = '';
  private bytes = 0;
  private terminal: any = null;
  private init: any = null;
  private sessionId: string | null = null;
  private blocked = false;
  private completedTools = 0;
  private successfulTools = 0;
  constructor(private agentId: BridgeAgentId, private cwd: string, private expectedSession?: string | null) {}
  push(chunk: string) {
    this.bytes += Buffer.byteLength(chunk);
    if (this.bytes > 8 * 1024 * 1024) fail('output_limit', 'Native output exceeds the capture limit');
    this.buffer += chunk;
    while (this.buffer.includes('\n')) {
      const index = this.buffer.indexOf('\n'); const line = this.buffer.slice(0, index); this.buffer = this.buffer.slice(index + 1);
      if (line.trim()) this.event(line);
    }
  }
  private event(line: string) {
    let event: any;
    try { event = JSON.parse(line); } catch { return fail('malformed_output', 'Native stream is not valid NDJSON'); }
    const route = getAgentRoute(this.agentId);
    if (route.runner === 'agy') {
      if (event.event === 'init') {
        if (this.init) fail('duplicate_init', 'Native stream opened more than once');
        this.init = event.init; this.sessionId = session(event.conversation_id);
        if (event.init?.model !== route.native_model) fail('model_mismatch', 'Native runtime did not confirm the selected model');
        if (path.resolve(event.init?.cwd || '') !== path.resolve(this.cwd)) fail('cwd_mismatch', 'Native runtime opened a different workspace');
        if (event.init?.permission_mode === 'always-proceed') fail('permission_policy', 'Unrestricted permission mode is not allowed');
      }
      if (event.event === 'step_update' && /permission|denied|approval/i.test(String(event.step_update?.tool_info?.error?.type || ''))) this.blocked = true;
      if (event.event === 'result') {
        if (this.terminal) fail('duplicate_final', 'Native stream returned more than one result');
        this.terminal = event.result;
      }
    } else {
      if (event.type === 'thread.started') { if (this.sessionId) fail('duplicate_init', 'Native stream opened more than once'); this.sessionId = session(event.thread_id); }
      if (event.type === 'error' || event.type === 'turn.failed') this.blocked = true;
      if (event.type === 'item.completed' && ['file_change', 'command_execution'].includes(event.item?.type)) {
        this.completedTools++;
        if (event.item.status === 'completed' && (event.item.type !== 'command_execution' || event.item.exit_code === 0)) this.successfulTools++;
      }
      if (event.type === 'turn.completed') { if (this.terminal) fail('duplicate_final', 'Native stream returned more than one result'); this.terminal = event; }
    }
  }
  finish(exitCode: number | null, finalFile?: string): NativeFinal {
    if (this.buffer.trim()) { this.event(this.buffer); this.buffer = ''; }
    if (exitCode !== 0) return fail('process_exit', `Native process exited with ${exitCode ?? 'signal'}`);
    if (this.blocked) return fail('native_failure', 'Native execution reported an error or denied permission');
    if (this.completedTools > 0 && this.successfulTools === 0) return fail('native_tool_failure', 'Every native file/command tool failed; a final answer is not proof of task completion');
    if (!this.terminal || !this.sessionId) return fail('incomplete_output', 'Native execution has no terminal result/session receipt');
    if (this.expectedSession && this.sessionId !== this.expectedSession) return fail('session_mismatch', 'Native runtime resumed a different conversation');
    const route = getAgentRoute(this.agentId);
    if (route.runner === 'agy' && (!this.init || this.terminal.status !== 'SUCCESS' || this.terminal.conversation_id !== this.sessionId)) return fail('native_failure', 'Native result did not confirm successful completion');
    const answer = String(route.runner === 'agy' ? this.terminal.response || '' : finalFile || '').trim();
    if (!answer) return fail('empty_output', 'Native final answer is empty');
    if (Buffer.byteLength(answer) > 2 * 1024 * 1024) return fail('output_limit', 'Native final answer exceeds the limit');
    return { answer, sessionId: this.sessionId, model: route.native_model, usage: this.terminal.usage || null };
  }
}
