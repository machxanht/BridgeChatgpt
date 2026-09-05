import fs from 'fs';
import path from 'path';
import { createTask, getTask, reviewTask, isCommandProcessed, recordCommandReceipt } from './db.js';
import { attachExecutionPayload } from './executionPayload.js';
import { createBatch, startBatch, type BatchLimits, type BatchTaskInput } from './batchOrchestrator.js';
import { attachTaskBinding } from './taskBinding.js';
import { createExecutorJob } from './executorStore.js';
import type { ExecutorAction } from './executorStore.js';

const BUS_DIR = path.resolve(process.cwd(), 'bridge-bus');
const INBOX_DIR = path.join(BUS_DIR, 'inbox');
const OUTBOX_DIR = path.join(BUS_DIR, 'outbox');
const POLL_MS = Math.max(3000, Number(process.env.GITHUB_COMMAND_BUS_POLL_MS || 5000));
const REMOTE_POLL_MS = Math.max(60000, Number(process.env.GITHUB_COMMAND_BUS_REMOTE_POLL_MS || 60000));
const enabled = process.env.GITHUB_COMMAND_BUS_ENABLED !== 'false';
const remoteEnabled = process.env.GITHUB_COMMAND_BUS_REMOTE_ENABLED !== 'false';
const repository = process.env.GITHUB_COMMAND_BUS_REPOSITORY || 'machxanht/BridgeChatgpt';
const branch = process.env.GITHUB_COMMAND_BUS_BRANCH || 'main';
let timer: NodeJS.Timeout | null = null;
let remoteTimer: NodeJS.Timeout | null = null;
let running = false;
let remoteRunning = false;

export interface BusCommand {
  id: string;
  type: 'task_create' | 'task_review' | 'batch_create' | 'executor_job_create';
  created_by?: 'chatgpt' | 'human';
  title?: string;
  description?: string;
  priority?: 'urgent' | 'high' | 'medium' | 'low';
  assignee?: 'gemini' | 'chatgpt' | 'human';
  related_files?: string[];
  execution_payload?: unknown;
  workspace_id?: string;
  project_id?: string;
  agent_instance_id?: string | null;
  task_id?: string;
  decision?: 'approve' | 'request_changes';
  summary?: string;
  tests_verified?: boolean;
  batch_title?: string;
  batch_goal?: string;
  batch_tasks?: BatchTaskInput[];
  batch_limits?: Partial<BatchLimits>;
  auto_start?: boolean;
  node_id?: string;
  executor_action?: ExecutorAction;
  executor_payload?: Record<string, unknown>;
}

interface GitHubContentItem { name: string; path: string; type: string; download_url?: string | null; }

function ensureDirs() {
  fs.mkdirSync(INBOX_DIR, { recursive: true });
  fs.mkdirSync(OUTBOX_DIR, { recursive: true });
}

function safeId(id: string) { return id.replace(/[^a-zA-Z0-9._-]/g, '_'); }
function resultPath(id: string) { return path.join(OUTBOX_DIR, `${safeId(id)}.result.json`); }
function writeResult(id: string, payload: unknown) { ensureDirs(); fs.writeFileSync(resultPath(id), JSON.stringify(payload, null, 2) + '\n', 'utf8'); }

export async function execute(command: BusCommand) {
  if (!command.id || !command.type) throw new Error('Command requires id and type.');
  if (command.type === 'task_create') {
    if (!command.title || !command.description) throw new Error('task_create requires title and description.');
    const payloadPrepared = command.execution_payload === undefined
      ? { description: command.description, payload: null }
      : attachExecutionPayload(command.description, command.execution_payload);
    const bindingPrepared = command.workspace_id || command.project_id || command.agent_instance_id
      ? attachTaskBinding(payloadPrepared.description, {
          workspace_id: command.workspace_id,
          project_id: command.project_id,
          agent_instance_id: command.agent_instance_id || null,
        })
      : { description: payloadPrepared.description, binding: null };
    const task = await createTask({
      title: command.title,
      description: bindingPrepared.description,
      priority: command.priority || 'medium',
      assignee: command.assignee || 'gemini',
      related_files: command.related_files || [],
      created_by: command.created_by || 'chatgpt',
    });
    const resultTask = payloadPrepared.payload || bindingPrepared.binding
      ? { ...task, description: command.description }
      : task;
    return {
      ok: true,
      command_id: command.id,
      type: command.type,
      task: resultTask,
      execution_payload_attached: Boolean(payloadPrepared.payload),
      task_binding_attached: Boolean(bindingPrepared.binding),
      task_binding: bindingPrepared.binding,
    };
  }
  if (command.type === 'task_review') {
    if (!command.task_id || !command.decision || !command.summary) throw new Error('task_review requires task_id, decision, and summary.');
    const existing = await getTask(command.task_id);
    if (!existing) throw new Error(`Task ${command.task_id} not found.`);
    const task = await reviewTask({ id: command.task_id, decision: command.decision, summary: command.summary, tests_verified: command.tests_verified ?? true, reviewer: 'chatgpt' });
    return { ok: true, command_id: command.id, type: command.type, task };
  }
  if (command.type === 'batch_create') {
    if (!command.batch_title || !command.batch_goal || !Array.isArray(command.batch_tasks) || command.batch_tasks.length === 0) {
      throw new Error('batch_create requires batch_title, batch_goal, and batch_tasks.');
    }
    const batch = await createBatch({
      title: command.batch_title,
      goal: command.batch_goal,
      tasks: command.batch_tasks,
      limits: command.batch_limits,
      created_by: command.created_by || 'chatgpt',
    });
    const resultBatch = command.auto_start === false ? batch : await startBatch(batch.id);
    return {
      ok: true,
      command_id: command.id,
      type: command.type,
      batch: resultBatch,
    };
  }
  if (command.type === 'executor_job_create') {
    if (!command.workspace_id || !command.project_id || !command.executor_action) {
      throw new Error('executor_job_create requires workspace_id, project_id, and executor_action.');
    }
    const job = await createExecutorJob({
      workspace_id: command.workspace_id,
      project_id: command.project_id,
      node_id: command.node_id,
      task_id: command.task_id,
      action: command.executor_action,
      payload: command.executor_payload || {},
      created_by: command.created_by || 'chatgpt',
    });
    return { ok: true, command_id: command.id, type: command.type, job };
  }
  throw new Error(`Unsupported command type: ${(command as any).type}`);
}

let commandProcessingTail: Promise<void> = Promise.resolve();

async function withCommandProcessingLock<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const previous = commandProcessingTail;
  commandProcessingTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

export async function processCommand(command: BusCommand, fallbackId: string): Promise<boolean> {
  return withCommandProcessingLock(async () => {
    const id = command.id || fallbackId;
    if (await isCommandProcessed(id)) return false;
    try {
      const result = await execute(command);
      await recordCommandReceipt({
        command_id: id,
        command_type: command.type,
        status: 'success',
        result: JSON.stringify(result),
      });
      writeResult(id, result);
      return true;
    } catch (err: any) {
      writeResult(id, { ok: false, command_id: id, error: err?.message || String(err) });
      return false;
    }
  });
}

export async function processGitHubCommandBusOnce() {
  if (!enabled || running) return;
  running = true;
  try {
    ensureDirs();
    const files = fs.readdirSync(INBOX_DIR).filter(f => f.endsWith('.json')).sort();
    for (const file of files) {
      try { await processCommand(JSON.parse(fs.readFileSync(path.join(INBOX_DIR, file), 'utf8')) as BusCommand, file.replace(/\.json$/i, '')); }
      catch (err: any) { writeResult(file.replace(/\.json$/i, ''), { ok: false, command_file: file, error: err?.message || String(err) }); }
    }
  } finally { running = false; }
}

/**
 * Poll the public GitHub inbox directly. This removes the requirement for AI Studio
 * to Pull before Bridge can see commands written by ChatGPT. Only remote files that
 * are not present in the checked-out inbox are fetched; checked-out commands continue
 * through the local path above. No GitHub credential is required for a public repo.
 */
export async function processGitHubRemoteCommandBusOnce() {
  if (!enabled || !remoteEnabled || remoteRunning) return;
  remoteRunning = true;
  try {
    ensureDirs();
    const api = `https://api.github.com/repos/${repository}/contents/bridge-bus/inbox?ref=${encodeURIComponent(branch)}`;
    const response = await fetch(api, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Bridge-GitHub-Command-Bus' } });
    if (!response.ok) throw new Error(`GitHub inbox HTTP ${response.status}: ${await response.text()}`);
    const items = await response.json() as GitHubContentItem[];
    for (const item of items.filter(i => i.type === 'file' && i.name.endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name))) {
      if (fs.existsSync(path.join(INBOX_DIR, item.name))) continue;
      if (!item.download_url) continue;
      const commandResponse = await fetch(item.download_url, { headers: { 'User-Agent': 'Bridge-GitHub-Command-Bus' } });
      if (!commandResponse.ok) throw new Error(`GitHub command ${item.name} HTTP ${commandResponse.status}`);
      const command = JSON.parse(await commandResponse.text()) as BusCommand;
      const processed = await processCommand(command, item.name.replace(/\.json$/i, ''));
      if (processed) console.log(`[Bridge GitHub Bus] Processed remote command ${item.name} without repository pull`);
    }
  } catch (err) {
    console.error('[Bridge GitHub Bus] Remote poll failed:', err);
  } finally { remoteRunning = false; }
}

export function startGitHubCommandBus() {
  if (!enabled || timer) return;
  ensureDirs();
  void processGitHubCommandBusOnce();
  timer = setInterval(() => void processGitHubCommandBusOnce(), POLL_MS);
  timer.unref?.();
  if (remoteEnabled) {
    void processGitHubRemoteCommandBusOnce();
    remoteTimer = setInterval(() => void processGitHubRemoteCommandBusOnce(), REMOTE_POLL_MS);
    remoteTimer.unref?.();
  }
  console.log(`[Bridge GitHub Bus] Local inbox every ${POLL_MS}ms; remote ${repository}@${branch} every ${REMOTE_POLL_MS}ms (${remoteEnabled ? 'enabled' : 'disabled'})`);
}
