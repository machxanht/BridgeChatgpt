import fs from 'fs';
import path from 'path';
import { createTask, getTask, reviewTask } from './db.js';

const BUS_DIR = path.resolve(process.cwd(), 'bridge-bus');
const INBOX_DIR = path.join(BUS_DIR, 'inbox');
const OUTBOX_DIR = path.join(BUS_DIR, 'outbox');
const POLL_MS = Math.max(3000, Number(process.env.GITHUB_COMMAND_BUS_POLL_MS || 5000));
const enabled = process.env.GITHUB_COMMAND_BUS_ENABLED !== 'false';
let timer: NodeJS.Timeout | null = null;
let running = false;

interface BusCommand {
  id: string;
  type: 'task_create' | 'task_review';
  created_by?: 'chatgpt' | 'human';
  title?: string;
  description?: string;
  priority?: 'urgent' | 'high' | 'medium' | 'low';
  assignee?: 'gemini' | 'chatgpt' | 'human';
  related_files?: string[];
  task_id?: string;
  decision?: 'approve' | 'request_changes';
  summary?: string;
  tests_verified?: boolean;
}

function ensureDirs() {
  fs.mkdirSync(INBOX_DIR, { recursive: true });
  fs.mkdirSync(OUTBOX_DIR, { recursive: true });
}

function safeId(id: string) {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function resultPath(id: string) {
  return path.join(OUTBOX_DIR, `${safeId(id)}.result.json`);
}

function writeResult(id: string, payload: unknown) {
  fs.writeFileSync(resultPath(id), JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

async function execute(command: BusCommand) {
  if (!command.id || !command.type) throw new Error('Command requires id and type.');
  if (command.type === 'task_create') {
    if (!command.title || !command.description) throw new Error('task_create requires title and description.');
    const task = await createTask({
      title: command.title,
      description: command.description,
      priority: command.priority || 'medium',
      assignee: command.assignee || 'gemini',
      related_files: command.related_files || [],
      created_by: command.created_by || 'chatgpt',
    });
    return { ok: true, command_id: command.id, type: command.type, task };
  }
  if (command.type === 'task_review') {
    if (!command.task_id || !command.decision || !command.summary) throw new Error('task_review requires task_id, decision, and summary.');
    const existing = await getTask(command.task_id);
    if (!existing) throw new Error(`Task ${command.task_id} not found.`);
    const task = await reviewTask({
      id: command.task_id,
      decision: command.decision,
      summary: command.summary,
      tests_verified: command.tests_verified ?? true,
      reviewer: 'chatgpt',
    });
    return { ok: true, command_id: command.id, type: command.type, task };
  }
  throw new Error(`Unsupported command type: ${(command as any).type}`);
}

export async function processGitHubCommandBusOnce() {
  if (!enabled || running) return;
  running = true;
  try {
    ensureDirs();
    const files = fs.readdirSync(INBOX_DIR).filter(f => f.endsWith('.json')).sort();
    for (const file of files) {
      const full = path.join(INBOX_DIR, file);
      try {
        const command = JSON.parse(fs.readFileSync(full, 'utf8')) as BusCommand;
        const out = resultPath(command.id || file);
        if (fs.existsSync(out)) continue; // idempotent across repeated Git syncs
        writeResult(command.id || file, await execute(command));
      } catch (err: any) {
        writeResult(file.replace(/\.json$/i, ''), { ok: false, command_file: file, error: err?.message || String(err) });
      }
    }
  } finally {
    running = false;
  }
}

export function startGitHubCommandBus() {
  if (!enabled || timer) return;
  ensureDirs();
  void processGitHubCommandBusOnce();
  timer = setInterval(() => void processGitHubCommandBusOnce(), POLL_MS);
  timer.unref?.();
  console.log(`[Bridge GitHub Bus] Watching bridge-bus/inbox every ${POLL_MS}ms`);
}
