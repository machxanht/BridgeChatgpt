import fs from 'fs';
import path from 'path';
import {
  createTask,
  getAgentStatuses,
  getTasks,
  logActivity,
  setAgentStatus,
  updateTask,
} from './db.js';
import type { AgentType, Task, TaskPriority } from '../src/types.js';

export type BatchStatus = 'planned' | 'running' | 'paused' | 'blocked' | 'completed' | 'cancelled';
export type BatchTaskStatus = 'queued' | 'ready' | 'materialized' | 'working' | 'review' | 'completed' | 'blocked' | 'cancelled';

export interface BatchLimits {
  max_tasks: number;
  max_runtime_minutes: number;
  max_retries_per_task: number;
  max_review_cycles: number;
  lease_minutes: number;
  max_parallel_tasks: number;
  stop_on_blocker: boolean;
}

export interface BatchTaskInput {
  key?: string;
  title: string;
  description: string;
  assignee: 'chatgpt' | 'gemini';
  priority?: TaskPriority;
  depends_on?: string[];
  related_files?: string[];
}

export interface BatchTask extends Required<Omit<BatchTaskInput, 'key' | 'priority' | 'depends_on' | 'related_files'>> {
  key: string;
  priority: TaskPriority;
  depends_on: string[];
  related_files: string[];
  status: BatchTaskStatus;
  bridge_task_id: string | null;
  retry_count: number;
  review_cycles: number;
  lease_expires_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Batch {
  id: string;
  title: string;
  goal: string;
  status: BatchStatus;
  created_by: 'chatgpt' | 'human';
  created_at: string;
  started_at: string | null;
  updated_at: string;
  completed_at: string | null;
  pause_reason: string | null;
  limits: BatchLimits;
  tasks: BatchTask[];
}

interface BatchStore {
  version: 1;
  counter: number;
  batches: Batch[];
}

export interface BatchDashboard {
  active_batch: Batch | null;
  counts: {
    total: number;
    completed: number;
    working: number;
    waiting_chatgpt: number;
    waiting_studio: number;
    review: number;
    blocked: number;
    queued: number;
  };
  elapsed_ms: number;
  progress_percent: number;
  human_action_required: boolean;
  human_action_text: string;
  blockers: Array<{ key: string; title: string; reason: string | null }>;
  server_time: string;
}

const DEFAULT_LIMITS: BatchLimits = {
  max_tasks: 100,
  max_runtime_minutes: 360,
  max_retries_per_task: 2,
  max_review_cycles: 3,
  lease_minutes: 30,
  max_parallel_tasks: 2,
  stop_on_blocker: false,
};

let tickTimer: NodeJS.Timeout | null = null;
let stateTail: Promise<void> = Promise.resolve();

function batchStatePath() {
  return path.resolve(process.cwd(), process.env.BRIDGE_BATCH_STATE_PATH || 'data/batches.json');
}

function emptyStore(): BatchStore {
  return { version: 1, counter: 0, batches: [] };
}

function loadStore(): BatchStore {
  const file = batchStatePath();
  if (!fs.existsSync(file)) return emptyStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as BatchStore;
    if (parsed?.version !== 1 || !Array.isArray(parsed.batches)) return emptyStore();
    return parsed;
  } catch (error) {
    console.error('[Batch] Failed to read state, using empty state:', error);
    return emptyStore();
  }
}

function saveStore(store: BatchStore) {
  const file = batchStatePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2) + '\n', 'utf8');
  fs.renameSync(temp, file);
}

async function withStateLock<T>(fn: () => Promise<T> | T): Promise<T> {
  let release!: () => void;
  const previous = stateTail;
  stateTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function normalizeLimits(input?: Partial<BatchLimits>): BatchLimits {
  return {
    max_tasks: clampInt(input?.max_tasks, DEFAULT_LIMITS.max_tasks, 1, 500),
    max_runtime_minutes: clampInt(input?.max_runtime_minutes, DEFAULT_LIMITS.max_runtime_minutes, 5, 7 * 24 * 60),
    max_retries_per_task: clampInt(input?.max_retries_per_task, DEFAULT_LIMITS.max_retries_per_task, 0, 20),
    max_review_cycles: clampInt(input?.max_review_cycles, DEFAULT_LIMITS.max_review_cycles, 0, 20),
    lease_minutes: clampInt(input?.lease_minutes, DEFAULT_LIMITS.lease_minutes, 2, 24 * 60),
    max_parallel_tasks: clampInt(input?.max_parallel_tasks, DEFAULT_LIMITS.max_parallel_tasks, 1, 20),
    stop_on_blocker: input?.stop_on_blocker ?? DEFAULT_LIMITS.stop_on_blocker,
  };
}

function safeKey(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 64);
}

export function validateBatchTaskGraph(tasks: BatchTaskInput[], maxTasks = DEFAULT_LIMITS.max_tasks): BatchTaskInput[] {
  if (!Array.isArray(tasks) || tasks.length === 0) throw new Error('Batch requires at least one task.');
  if (tasks.length > maxTasks) throw new Error(`Batch has ${tasks.length} tasks; limit is ${maxTasks}.`);

  const normalized = tasks.map((task, index) => {
    if (!task?.title?.trim() || !task?.description?.trim()) throw new Error(`Batch task ${index + 1} requires title and description.`);
    if (task.assignee !== 'chatgpt' && task.assignee !== 'gemini') throw new Error(`Batch task ${index + 1} has unsupported assignee.`);
    const key = safeKey(task.key || `STEP-${index + 1}`);
    if (!key) throw new Error(`Batch task ${index + 1} has invalid key.`);
    return {
      ...task,
      key,
      priority: task.priority || 'medium',
      depends_on: [...new Set(task.depends_on || [])],
      related_files: [...new Set(task.related_files || [])],
    };
  });

  const keys = new Set<string>();
  for (const task of normalized) {
    if (keys.has(task.key!)) throw new Error(`Duplicate batch task key: ${task.key}`);
    keys.add(task.key!);
  }

  for (const task of normalized) {
    for (const dependency of task.depends_on || []) {
      if (!keys.has(dependency)) throw new Error(`Task ${task.key} depends on missing task ${dependency}.`);
      if (dependency === task.key) throw new Error(`Task ${task.key} cannot depend on itself.`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byKey = new Map(normalized.map(task => [task.key!, task]));
  const visit = (key: string) => {
    if (visiting.has(key)) throw new Error(`Dependency cycle detected at ${key}.`);
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dependency of byKey.get(key)?.depends_on || []) visit(dependency);
    visiting.delete(key);
    visited.add(key);
  };
  for (const key of keys) visit(key);

  return normalized;
}

function findReviewCycles(result?: string | null) {
  if (!result) return 0;
  return (result.match(/Review CHANGES REQUESTED/gi) || []).length;
}

function addMinutes(iso: string, minutes: number) {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

function materializedWaiting(task: BatchTask) {
  return task.status === 'materialized' || task.status === 'ready';
}

function batchElapsed(batch: Batch, now = Date.now()) {
  if (!batch.started_at) return 0;
  const end = batch.completed_at ? Date.parse(batch.completed_at) : now;
  return Math.max(0, end - Date.parse(batch.started_at));
}

function getBatchFromStore(store: BatchStore, id: string) {
  const batch = store.batches.find(item => item.id === id);
  if (!batch) throw new Error(`Batch ${id} not found.`);
  return batch;
}

export async function createBatch(input: {
  title: string;
  goal: string;
  tasks: BatchTaskInput[];
  limits?: Partial<BatchLimits>;
  created_by?: 'chatgpt' | 'human';
}): Promise<Batch> {
  if (!input.title?.trim() || !input.goal?.trim()) throw new Error('Batch requires title and goal.');
  const limits = normalizeLimits(input.limits);
  const normalizedTasks = validateBatchTaskGraph(input.tasks, limits.max_tasks);

  return withStateLock(async () => {
    const store = loadStore();
    store.counter += 1;
    const now = new Date().toISOString();
    const batch: Batch = {
      id: `BATCH-${store.counter}`,
      title: input.title.trim(),
      goal: input.goal.trim(),
      status: 'planned',
      created_by: input.created_by || 'chatgpt',
      created_at: now,
      started_at: null,
      updated_at: now,
      completed_at: null,
      pause_reason: null,
      limits,
      tasks: normalizedTasks.map((task) => ({
        key: task.key!,
        title: task.title.trim(),
        description: task.description.trim(),
        assignee: task.assignee,
        priority: task.priority || 'medium',
        depends_on: task.depends_on || [],
        related_files: task.related_files || [],
        status: 'queued',
        bridge_task_id: null,
        retry_count: 0,
        review_cycles: 0,
        lease_expires_at: null,
        last_error: null,
        created_at: now,
        updated_at: now,
      })),
    };
    store.batches.push(batch);
    saveStore(store);
    await logActivity({
      agent: batch.created_by,
      action: `Created batch ${batch.id}`,
      entity_type: 'project',
      entity_id: batch.id,
      details: `${batch.title} · ${batch.tasks.length} tasks`,
    });
    return batch;
  });
}

export async function listBatches(): Promise<Batch[]> {
  return loadStore().batches.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getBatch(id: string): Promise<Batch | null> {
  return loadStore().batches.find(item => item.id === id) || null;
}

export async function startBatch(id: string): Promise<Batch> {
  await withStateLock(async () => {
    const store = loadStore();
    const batch = getBatchFromStore(store, id);
    if (batch.status === 'completed' || batch.status === 'cancelled') throw new Error(`Cannot start ${batch.status} batch ${id}.`);
    const now = new Date().toISOString();
    batch.status = 'running';
    batch.started_at ||= now;
    batch.pause_reason = null;
    batch.updated_at = now;
    saveStore(store);
  });
  await tickBatch(id);
  return (await getBatch(id))!;
}

export async function pauseBatch(id: string, reason = 'Paused by operator.'): Promise<Batch> {
  return withStateLock(async () => {
    const store = loadStore();
    const batch = getBatchFromStore(store, id);
    if (batch.status === 'completed' || batch.status === 'cancelled') return batch;
    batch.status = 'paused';
    batch.pause_reason = reason;
    batch.updated_at = new Date().toISOString();
    saveStore(store);
    return batch;
  });
}

export async function resumeBatch(id: string): Promise<Batch> {
  return startBatch(id);
}

export async function cancelBatch(id: string): Promise<Batch> {
  return withStateLock(async () => {
    const store = loadStore();
    const batch = getBatchFromStore(store, id);
    const now = new Date().toISOString();
    batch.status = 'cancelled';
    batch.pause_reason = 'Cancelled by operator.';
    batch.completed_at = now;
    batch.updated_at = now;
    for (const task of batch.tasks) {
      if (task.status !== 'completed') {
        task.status = 'cancelled';
        task.updated_at = now;
      }
    }
    saveStore(store);
    return batch;
  });
}

async function syncBridgeTask(batch: Batch, item: BatchTask, bridge: Task | undefined, now: string, agents: Awaited<ReturnType<typeof getAgentStatuses>>) {
  if (!bridge) {
    item.status = 'blocked';
    item.last_error = `Bridge task ${item.bridge_task_id} no longer exists.`;
    item.updated_at = now;
    return;
  }

  item.review_cycles = Math.max(item.review_cycles, findReviewCycles(bridge.result));
  if (item.review_cycles > batch.limits.max_review_cycles && bridge.status !== 'completed') {
    item.status = 'blocked';
    item.last_error = `Review cycle limit exceeded (${item.review_cycles}/${batch.limits.max_review_cycles}).`;
    item.updated_at = now;
    if (bridge.status !== 'blocked') {
      await updateTask(bridge.id, { status: 'blocked', result: `${bridge.result || ''}\n\n[Batch] ${item.last_error}` }, 'system');
    }
    return;
  }

  if (bridge.status === 'completed') {
    item.status = 'completed';
    item.lease_expires_at = null;
    item.last_error = null;
    item.updated_at = now;
    return;
  }
  if (bridge.status === 'review') {
    item.status = 'review';
    item.lease_expires_at = null;
    item.updated_at = now;
    return;
  }
  if (bridge.status === 'blocked') {
    item.status = 'blocked';
    item.last_error = bridge.result || item.last_error || 'Bridge task is blocked.';
    item.lease_expires_at = null;
    item.updated_at = now;
    return;
  }
  if (bridge.status === 'cancelled') {
    item.status = 'cancelled';
    item.lease_expires_at = null;
    item.updated_at = now;
    return;
  }
  if (bridge.status === 'assigned' || bridge.status === 'pending') {
    item.status = 'materialized';
    item.lease_expires_at = null;
    item.updated_at = now;
    return;
  }

  if (bridge.status === 'working') {
    item.status = 'working';
    const agent = agents[item.assignee];
    const heartbeatBase = agent?.current_task_id === bridge.id && agent?.last_active_at
      ? agent.last_active_at
      : bridge.updated_at || now;
    const candidateLease = addMinutes(heartbeatBase, batch.limits.lease_minutes);
    if (!item.lease_expires_at || Date.parse(candidateLease) > Date.parse(item.lease_expires_at)) {
      item.lease_expires_at = candidateLease;
    }

    if (item.lease_expires_at && Date.parse(now) > Date.parse(item.lease_expires_at)) {
      if (item.retry_count < batch.limits.max_retries_per_task) {
        item.retry_count += 1;
        item.status = 'materialized';
        item.lease_expires_at = null;
        item.last_error = `Lease expired; returned to queue (retry ${item.retry_count}/${batch.limits.max_retries_per_task}).`;
        await updateTask(bridge.id, {
          status: 'assigned',
          result: `${bridge.result || ''}\n\n[Batch] ${item.last_error}`,
        }, 'system');
        if (agent?.current_task_id === bridge.id) {
          await setAgentStatus({
            agent: item.assignee,
            status: 'idle',
            current_task_id: null,
            message: `Lease expired for ${bridge.id}; task returned to queue.`,
          });
        }
      } else {
        item.status = 'blocked';
        item.lease_expires_at = null;
        item.last_error = `Lease expired and retry limit reached (${batch.limits.max_retries_per_task}).`;
        await updateTask(bridge.id, {
          status: 'blocked',
          result: `${bridge.result || ''}\n\n[Batch] ${item.last_error}`,
        }, 'system');
      }
    }
    item.updated_at = now;
  }
}

function dependenciesComplete(batch: Batch, item: BatchTask) {
  return item.depends_on.every(key => batch.tasks.find(task => task.key === key)?.status === 'completed');
}

function dependencyFailed(batch: Batch, item: BatchTask) {
  return item.depends_on.some(key => {
    const status = batch.tasks.find(task => task.key === key)?.status;
    return status === 'blocked' || status === 'cancelled';
  });
}

async function materializeTask(batch: Batch, item: BatchTask, now: string) {
  const dependencyText = item.depends_on.length ? item.depends_on.join(', ') : 'none';
  const description = [
    `[Bridge Batch ${batch.id}/${item.key}] ${batch.title}`,
    `Batch goal: ${batch.goal}`,
    `Dependencies: ${dependencyText}`,
    '',
    item.description,
    '',
    'When done, report result/review through the normal Bridge task flow. Do not work on unrelated tasks.',
  ].join('\n');

  const task = await createTask({
    title: `[${batch.id}/${item.key}] ${item.title}`,
    description,
    priority: item.priority,
    assignee: item.assignee as AgentType,
    related_files: item.related_files,
    created_by: batch.created_by,
  });
  item.bridge_task_id = task.id;
  item.status = 'materialized';
  item.updated_at = now;
}

export async function tickBatch(id: string): Promise<Batch> {
  return withStateLock(async () => {
    const store = loadStore();
    const batch = getBatchFromStore(store, id);
    if (batch.status !== 'running') return batch;

    const now = new Date().toISOString();
    if (batchElapsed(batch, Date.parse(now)) >= batch.limits.max_runtime_minutes * 60_000) {
      batch.status = 'paused';
      batch.pause_reason = `Runtime limit reached (${batch.limits.max_runtime_minutes} minutes).`;
      batch.updated_at = now;
      saveStore(store);
      return batch;
    }

    const bridgeTasks = await getTasks({ limit: 500 });
    const bridgeById = new Map(bridgeTasks.map(task => [task.id, task]));
    const agents = await getAgentStatuses();

    for (const item of batch.tasks) {
      if (item.bridge_task_id) await syncBridgeTask(batch, item, bridgeById.get(item.bridge_task_id), now, agents);
    }

    for (const item of batch.tasks) {
      if (item.status !== 'queued') continue;
      if (dependencyFailed(batch, item)) {
        item.status = 'blocked';
        item.last_error = 'A dependency is blocked or cancelled.';
        item.updated_at = now;
      } else if (dependenciesComplete(batch, item)) {
        item.status = 'ready';
        item.updated_at = now;
      }
    }

    if (batch.limits.stop_on_blocker && batch.tasks.some(task => task.status === 'blocked')) {
      batch.status = 'blocked';
      batch.pause_reason = 'Batch stopped because stop_on_blocker is enabled.';
      batch.updated_at = now;
      saveStore(store);
      return batch;
    }

    let activeSlots = batch.tasks.filter(task => task.status === 'materialized' || task.status === 'working').length;
    for (const item of batch.tasks.filter(task => task.status === 'ready')) {
      if (activeSlots >= batch.limits.max_parallel_tasks) break;
      await materializeTask(batch, item, now);
      activeSlots += 1;
    }

    const allDone = batch.tasks.every(task => task.status === 'completed');
    if (allDone) {
      batch.status = 'completed';
      batch.completed_at = now;
      batch.pause_reason = null;
      await logActivity({
        agent: 'system',
        action: `Completed batch ${batch.id}`,
        entity_type: 'project',
        entity_id: batch.id,
        details: `${batch.title} · ${batch.tasks.length}/${batch.tasks.length} tasks completed`,
      });
    } else {
      const terminalWithoutProgress = batch.tasks.every(task => ['completed', 'blocked', 'cancelled'].includes(task.status));
      if (terminalWithoutProgress && batch.tasks.some(task => task.status === 'blocked')) {
        batch.status = 'blocked';
        batch.pause_reason = 'No runnable tasks remain because one or more tasks are blocked.';
      }
    }

    batch.updated_at = now;
    saveStore(store);
    return batch;
  });
}

export async function tickAllBatches() {
  const batches = await listBatches();
  for (const batch of batches.filter(item => item.status === 'running')) {
    try {
      await tickBatch(batch.id);
    } catch (error) {
      console.error(`[Batch] Tick failed for ${batch.id}:`, error);
    }
  }
}

export function startBatchOrchestrator() {
  if (tickTimer) return;
  const interval = Math.max(5_000, Number(process.env.BRIDGE_BATCH_TICK_MS || 15_000));
  void tickAllBatches();
  tickTimer = setInterval(() => void tickAllBatches(), interval);
  tickTimer.unref?.();
  console.log(`[Bridge Batch] Orchestrator tick every ${interval}ms`);
}

export async function getBatchDashboard(): Promise<BatchDashboard> {
  await tickAllBatches();
  const batches = await listBatches();
  const active = batches.find(batch => batch.status === 'running')
    || batches.find(batch => batch.status === 'blocked')
    || batches.find(batch => batch.status === 'paused')
    || batches.find(batch => batch.status === 'planned')
    || null;

  if (!active) {
    return {
      active_batch: null,
      counts: { total: 0, completed: 0, working: 0, waiting_chatgpt: 0, waiting_studio: 0, review: 0, blocked: 0, queued: 0 },
      elapsed_ms: 0,
      progress_percent: 0,
      human_action_required: false,
      human_action_text: 'Không có batch đang chạy. Bridge đang chờ project lớn tiếp theo.',
      blockers: [],
      server_time: new Date().toISOString(),
    };
  }

  const counts = {
    total: active.tasks.length,
    completed: active.tasks.filter(task => task.status === 'completed').length,
    working: active.tasks.filter(task => task.status === 'working').length,
    waiting_chatgpt: active.tasks.filter(task => materializedWaiting(task) && task.assignee === 'chatgpt').length,
    waiting_studio: active.tasks.filter(task => materializedWaiting(task) && task.assignee === 'gemini').length,
    review: active.tasks.filter(task => task.status === 'review').length,
    blocked: active.tasks.filter(task => task.status === 'blocked').length,
    queued: active.tasks.filter(task => task.status === 'queued').length,
  };
  const blockers = active.tasks
    .filter(task => task.status === 'blocked')
    .map(task => ({ key: task.key, title: task.title, reason: task.last_error }));

  let humanActionRequired = false;
  let humanActionText = 'Không cần làm gì. Batch đang chạy.';
  if (active.status === 'paused') {
    humanActionRequired = true;
    humanActionText = `Batch đang tạm dừng: ${active.pause_reason || 'không rõ lý do'}. Bấm tiếp tục batch khi muốn chạy tiếp.`;
  } else if (active.status === 'blocked' || counts.blocked > 0) {
    humanActionRequired = true;
    humanActionText = `Có ${counts.blocked} task bị chặn. Mở blocker để xử lý trước khi tiếp tục.`;
  } else if (counts.review > 0) {
    humanActionRequired = true;
    humanActionText = `Có ${counts.review} task chờ ChatGPT review. Quay lại ChatGPT và nhắn “review batch mới nhất”.`;
  } else if (counts.waiting_chatgpt > 0) {
    humanActionRequired = true;
    humanActionText = `Có ${counts.waiting_chatgpt} task chờ ChatGPT. Quay lại ChatGPT và nhắn “làm batch Bridge mới nhất”.`;
  } else if (counts.waiting_studio > 0 && counts.working === 0) {
    humanActionRequired = true;
    humanActionText = `Có ${counts.waiting_studio} task chờ AI Studio. Kích Studio một lần để nó xử lý toàn bộ task đang chờ.`;
  } else if (active.status === 'planned') {
    humanActionRequired = true;
    humanActionText = 'Batch đã được lập kế hoạch nhưng chưa chạy. Bấm bắt đầu batch.';
  }

  return {
    active_batch: active,
    counts,
    elapsed_ms: batchElapsed(active),
    progress_percent: counts.total ? Math.round((counts.completed / counts.total) * 100) : 0,
    human_action_required: humanActionRequired,
    human_action_text: humanActionText,
    blockers,
    server_time: new Date().toISOString(),
  };
}
