import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const EXECUTOR_ACTIONS = [
  'fs.list',
  'fs.read',
  'fs.write',
  'command.run',
  'git.status',
  'git.diff',
  'npm.test',
  'npm.build',
] as const;

export type ExecutorAction = (typeof EXECUTOR_ACTIONS)[number];
export type ExecutorJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ExecutorConnectionStatus = 'online' | 'offline';

/**
 * workspace_id/project_id on a node are the project that originally paired the PC.
 * They are retained for backward compatibility and audit only. A paired PC node is
 * machine-scoped and may execute jobs for any Bridge project whose cwd remains
 * inside that PC's approved projectRoot.
 */
export interface ExecutorNodeRecord {
  node_id: string;
  name: string;
  workspace_id: string;
  project_id: string;
  root_label: string;
  platform: string;
  capabilities: ExecutorAction[];
  created_at: string;
  updated_at: string;
  last_seen_at: string;
}

export interface ExecutorJobRecord {
  job_id: string;
  node_id: string | null;
  workspace_id: string;
  project_id: string;
  task_id: string | null;
  action: ExecutorAction;
  payload: Record<string, unknown>;
  status: ExecutorJobStatus;
  created_by: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
}

interface ExecutorStoreFile {
  version: 1;
  nodes: ExecutorNodeRecord[];
  jobs: ExecutorJobRecord[];
}

export interface ExecutorNodeView extends ExecutorNodeRecord {
  connection_status: ExecutorConnectionStatus;
}

export interface ExecutorSnapshot {
  nodes: ExecutorNodeView[];
  jobs: ExecutorJobRecord[];
  server_time: string;
}

const ID_RE = /^[a-zA-Z0-9._:-]{3,160}$/;
const ONLINE_WINDOW_MS = Number(process.env.BRIDGE_EXECUTOR_ONLINE_WINDOW_MS || 35_000);
const RUNNING_LEASE_MS = Number(process.env.BRIDGE_EXECUTOR_RUNNING_LEASE_MS || 30 * 60_000);
let writeTail: Promise<void> = Promise.resolve();

function storePath() {
  return path.resolve(process.cwd(), process.env.BRIDGE_EXECUTOR_STORE_PATH || 'data/executors.json');
}

function emptyStore(): ExecutorStoreFile {
  return { version: 1, nodes: [], jobs: [] };
}

function readStore(): ExecutorStoreFile {
  const file = storePath();
  if (!fs.existsSync(file)) return emptyStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as ExecutorStoreFile;
    if (parsed?.version !== 1 || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.jobs)) return emptyStore();
    return parsed;
  } catch {
    return emptyStore();
  }
}

function writeStore(store: ExecutorStoreFile) {
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

async function withWriteLock<T>(fn: () => Promise<T> | T): Promise<T> {
  let release!: () => void;
  const previous = writeTail;
  writeTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

function safeId(value: unknown, label: string) {
  const text = String(value || '').trim();
  if (!ID_RE.test(text)) throw new Error(`${label} is invalid`);
  return text;
}

function safeText(value: unknown, fallback: string, max = 180) {
  const text = String(value || fallback).trim().slice(0, max);
  return text || fallback;
}

function safeAction(value: unknown): ExecutorAction {
  const action = String(value || '').trim() as ExecutorAction;
  if (!EXECUTOR_ACTIONS.includes(action)) throw new Error(`Unsupported executor action: ${action || '(empty)'}`);
  return action;
}

function safePayload(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('payload must be a JSON object');
  const serialized = JSON.stringify(value);
  if (serialized.length > 1_500_000) throw new Error('payload is too large');
  return JSON.parse(serialized) as Record<string, unknown>;
}

function trimResult(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return { value: String(value).slice(0, 250_000) };
  const copy = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  for (const key of ['stdout', 'stderr', 'content']) {
    if (typeof copy[key] === 'string') copy[key] = (copy[key] as string).slice(-250_000);
  }
  return copy;
}

function normalizeCapabilities(value: unknown): ExecutorAction[] {
  if (!Array.isArray(value)) return [];
  const result: ExecutorAction[] = [];
  for (const item of value) {
    try {
      const action = safeAction(item);
      if (!result.includes(action)) result.push(action);
    } catch {
      // Ignore unknown capability values from older/newer clients.
    }
  }
  return result;
}

function isOnline(node: ExecutorNodeRecord, now = Date.now()) {
  const seen = Date.parse(node.last_seen_at);
  return Number.isFinite(seen) && now - seen <= ONLINE_WINDOW_MS;
}

function recoverStaleRunningJobs(store: ExecutorStoreFile, now = Date.now()) {
  let changed = false;
  for (const job of store.jobs) {
    if (job.status !== 'running' || !job.started_at) continue;
    const started = Date.parse(job.started_at);
    if (!Number.isFinite(started) || now - started < RUNNING_LEASE_MS) continue;
    const node = job.node_id ? store.nodes.find((candidate) => candidate.node_id === job.node_id) : undefined;
    if (node && isOnline(node, now)) continue;
    job.status = 'pending';
    job.node_id = null;
    job.started_at = null;
    job.error = 'Recovered after executor lease expired';
    changed = true;
  }
  return changed;
}

export async function registerExecutorNode(input: {
  node_id: string;
  name?: string;
  workspace_id: string;
  project_id: string;
  root_label?: string;
  platform?: string;
  capabilities?: unknown;
}): Promise<ExecutorNodeRecord> {
  return withWriteLock(async () => {
    const now = new Date().toISOString();
    const store = readStore();
    recoverStaleRunningJobs(store);
    const nodeId = safeId(input.node_id, 'node_id');
    const workspaceId = safeId(input.workspace_id, 'workspace_id');
    const projectId = safeId(input.project_id, 'project_id');
    const existing = store.nodes.find((node) => node.node_id === nodeId);
    const next: ExecutorNodeRecord = {
      node_id: nodeId,
      name: safeText(input.name, existing?.name || nodeId),
      workspace_id: workspaceId,
      project_id: projectId,
      root_label: safeText(input.root_label, existing?.root_label || 'project'),
      platform: safeText(input.platform, existing?.platform || 'unknown', 80),
      capabilities: normalizeCapabilities(input.capabilities),
      created_at: existing?.created_at || now,
      updated_at: now,
      last_seen_at: now,
    };
    if (existing) Object.assign(existing, next);
    else store.nodes.push(next);
    writeStore(store);
    return next;
  });
}

export async function heartbeatExecutorNode(nodeIdRaw: string): Promise<ExecutorNodeRecord> {
  return withWriteLock(async () => {
    const nodeId = safeId(nodeIdRaw, 'node_id');
    const store = readStore();
    const node = store.nodes.find((item) => item.node_id === nodeId);
    if (!node) throw new Error(`Executor node ${nodeId} not found`);
    const now = new Date().toISOString();
    node.last_seen_at = now;
    node.updated_at = now;
    if (recoverStaleRunningJobs(store)) node.updated_at = now;
    writeStore(store);
    return node;
  });
}

export async function createExecutorJob(input: {
  workspace_id: string;
  project_id: string;
  node_id?: string | null;
  task_id?: string | null;
  action: ExecutorAction | string;
  payload?: unknown;
  created_by?: string;
}): Promise<ExecutorJobRecord> {
  return withWriteLock(async () => {
    const store = readStore();
    recoverStaleRunningJobs(store);
    const workspaceId = safeId(input.workspace_id, 'workspace_id');
    const projectId = safeId(input.project_id, 'project_id');
    const nodeId = input.node_id ? safeId(input.node_id, 'node_id') : null;
    if (nodeId) {
      const node = store.nodes.find((item) => item.node_id === nodeId);
      if (!node) throw new Error(`Executor node ${nodeId} not found`);
      // A node is machine-scoped. Project isolation is enforced by the executor's
      // approved projectRoot + per-job cwd, not by pairing a new token per project.
    }
    const now = new Date().toISOString();
    const job: ExecutorJobRecord = {
      job_id: `EXEC-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`,
      node_id: nodeId,
      workspace_id: workspaceId,
      project_id: projectId,
      task_id: input.task_id ? safeId(input.task_id, 'task_id') : null,
      action: safeAction(input.action),
      payload: safePayload(input.payload),
      status: 'pending',
      created_by: safeText(input.created_by, 'chatgpt', 80),
      created_at: now,
      started_at: null,
      completed_at: null,
      result: null,
      error: null,
    };
    store.jobs.push(job);
    writeStore(store);
    return job;
  });
}

export async function claimExecutorJob(input: {
  node_id: string;
  workspace_id?: string;
  project_id?: string;
}): Promise<ExecutorJobRecord | null> {
  return withWriteLock(async () => {
    const store = readStore();
    recoverStaleRunningJobs(store);
    const nodeId = safeId(input.node_id, 'node_id');
    const node = store.nodes.find((item) => item.node_id === nodeId);
    if (!node) throw new Error(`Executor node ${nodeId} not found`);
    const now = new Date().toISOString();
    node.last_seen_at = now;
    node.updated_at = now;

    const job = store.jobs
      .filter((item) => item.status === 'pending')
      .filter((item) => {
        if (item.node_id) return item.node_id === nodeId;
        // Preserve legacy behavior for unassigned jobs: only the project's
        // originally paired node may claim them. Cross-project jobs should be
        // explicitly assigned to a machine by the Bridge controller.
        return item.workspace_id === node.workspace_id && item.project_id === node.project_id;
      })
      .filter((item) => node.capabilities.includes(item.action))
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0];
    if (!job) {
      writeStore(store);
      return null;
    }
    job.node_id = nodeId;
    job.status = 'running';
    job.started_at = now;
    job.completed_at = null;
    job.error = null;
    writeStore(store);
    return job;
  });
}

export async function completeExecutorJob(input: {
  node_id: string;
  job_id: string;
  ok: boolean;
  result?: unknown;
  error?: unknown;
}): Promise<ExecutorJobRecord> {
  return withWriteLock(async () => {
    const store = readStore();
    const nodeId = safeId(input.node_id, 'node_id');
    const jobId = safeId(input.job_id, 'job_id');
    const job = store.jobs.find((item) => item.job_id === jobId);
    if (!job) throw new Error(`Executor job ${jobId} not found`);
    if (job.node_id && job.node_id !== nodeId) throw new Error(`Executor job ${jobId} belongs to another node`);
    if (job.status === 'cancelled') return job;
    if (job.status !== 'running' && job.status !== 'pending') throw new Error(`Executor job ${jobId} is already ${job.status}`);
    job.node_id = nodeId;
    job.status = input.ok ? 'completed' : 'failed';
    job.completed_at = new Date().toISOString();
    job.result = trimResult(input.result);
    job.error = input.ok ? null : safeText(input.error, 'Executor job failed', 4000);
    const node = store.nodes.find((item) => item.node_id === nodeId);
    if (node) {
      node.last_seen_at = job.completed_at;
      node.updated_at = job.completed_at;
    }
    writeStore(store);
    return job;
  });
}

export async function cancelExecutorJob(jobIdRaw: string): Promise<ExecutorJobRecord> {
  return withWriteLock(async () => {
    const store = readStore();
    const jobId = safeId(jobIdRaw, 'job_id');
    const job = store.jobs.find((item) => item.job_id === jobId);
    if (!job) throw new Error(`Executor job ${jobId} not found`);
    if (job.status === 'completed' || job.status === 'failed') return job;
    job.status = 'cancelled';
    job.completed_at = new Date().toISOString();
    job.error = 'Cancelled by Bridge';
    writeStore(store);
    return job;
  });
}

export async function getExecutorJob(jobIdRaw: string): Promise<ExecutorJobRecord | null> {
  const jobId = safeId(jobIdRaw, 'job_id');
  const store = readStore();
  return store.jobs.find((item) => item.job_id === jobId) || null;
}

export async function getExecutorSnapshot(filters: {
  workspace_id?: string;
  project_id?: string;
  node_id?: string;
  limit?: number;
} = {}): Promise<ExecutorSnapshot> {
  const store = readStore();
  const now = Date.now();
  const workspaceId = filters.workspace_id ? safeId(filters.workspace_id, 'workspace_id') : null;
  const projectId = filters.project_id ? safeId(filters.project_id, 'project_id') : null;
  const nodeId = filters.node_id ? safeId(filters.node_id, 'node_id') : null;

  // PC nodes are machine-scoped and are intentionally visible in every project
  // snapshot. Jobs remain filtered by workspace/project so each project keeps a
  // clean job history.
  const nodes = store.nodes
    .filter((node) => !nodeId || node.node_id === nodeId)
    .map<ExecutorNodeView>((node) => ({
      ...node,
      connection_status: isOnline(node, now) ? 'online' : 'offline',
    }));
  const allowedNodeIds = new Set(nodes.map((node) => node.node_id));
  const limit = Math.max(1, Math.min(Number(filters.limit || 80), 300));
  const jobs = store.jobs
    .filter((job) => !workspaceId || job.workspace_id === workspaceId)
    .filter((job) => !projectId || job.project_id === projectId)
    .filter((job) => !nodeId || job.node_id === nodeId || (!job.node_id && allowedNodeIds.size > 0))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, limit);
  return {
    nodes,
    jobs,
    server_time: new Date(now).toISOString(),
  };
}

export async function resetExecutorStoreForTests() {
  await withWriteLock(async () => {
    const file = storePath();
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  });
}
