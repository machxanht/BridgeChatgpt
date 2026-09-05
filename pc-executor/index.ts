import crypto from 'crypto';
import fs from 'fs';
import http, { IncomingMessage, ServerResponse } from 'http';
import os from 'os';
import path from 'path';
import { executeExecutorAction, type ExecutorRuntimeConfig } from './core.js';
import { executorDashboardHtml } from './web.js';
import type { ExecutorAction, ExecutorJobRecord } from '../server/executorStore.js';

interface LocalConfig {
  bridgeUrl: string;
  token: string;
  workspaceId: string;
  projectId: string;
  projectRoot: string;
  name: string;
  allowWrites: boolean;
  allowCommands: boolean;
  pollIntervalMs: number;
}

interface LocalLog {
  time: string;
  type: string;
  action?: string;
  job_id?: string;
  ok?: boolean;
  summary?: string;
  stdout?: string;
  error?: string;
}

const HOME_DIR = path.join(os.homedir(), '.bridge-executor');
const CONFIG_PATH = process.env.BRIDGE_EXECUTOR_CONFIG || path.join(HOME_DIR, 'config.json');
const AUDIT_PATH = path.join(HOME_DIR, 'audit.jsonl');
const PORT = Number(process.env.BRIDGE_EXECUTOR_PORT || 4588);
const HOST = process.env.BRIDGE_EXECUTOR_HOST || '127.0.0.1';

function defaultConfig(): LocalConfig {
  return {
    bridgeUrl: String(process.env.BRIDGE_URL || 'https://bridge-ai-mission-control.ai.studio').replace(/\/+$/, ''),
    token: String(process.env.BRIDGE_EXECUTOR_TOKEN || process.env.BRIDGE_MCP_TOKEN || ''),
    workspaceId: String(process.env.BRIDGE_WORKSPACE_ID || ''),
    projectId: String(process.env.BRIDGE_PROJECT_ID || ''),
    projectRoot: path.resolve(process.env.BRIDGE_PROJECT_ROOT || process.cwd()),
    name: String(process.env.BRIDGE_EXECUTOR_NAME || os.hostname()),
    allowWrites: process.env.BRIDGE_EXECUTOR_ALLOW_WRITES === 'true',
    allowCommands: process.env.BRIDGE_EXECUTOR_ALLOW_COMMANDS === 'true',
    pollIntervalMs: Math.max(800, Number(process.env.BRIDGE_EXECUTOR_POLL_MS || 2200)),
  };
}

function loadConfig(): LocalConfig {
  const base = defaultConfig();
  try {
    if (!fs.existsSync(CONFIG_PATH)) return base;
    const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as Partial<LocalConfig>;
    return {
      ...base,
      ...saved,
      projectRoot: path.resolve(saved.projectRoot || base.projectRoot),
      bridgeUrl: String(saved.bridgeUrl || base.bridgeUrl).replace(/\/+$/, ''),
      token: String(saved.token || base.token),
      workspaceId: String(saved.workspaceId || base.workspaceId),
      projectId: String(saved.projectId || base.projectId),
      name: String(saved.name || base.name),
      allowWrites: saved.allowWrites === true,
      allowCommands: saved.allowCommands === true,
      pollIntervalMs: Math.max(800, Number(saved.pollIntervalMs || base.pollIntervalMs)),
    };
  } catch (error) {
    console.warn('[Executor] Could not read config:', error);
    return base;
  }
}

function saveConfig(next: LocalConfig) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  const tmp = `${CONFIG_PATH}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, CONFIG_PATH);
}

function makeNodeId(config: LocalConfig) {
  const seed = `${os.hostname()}\n${path.resolve(config.projectRoot)}`;
  const digest = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 12);
  const host = os.hostname().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 40) || 'pc';
  return `pc-${host}-${digest}`;
}

let config = loadConfig();
let nodeId = makeNodeId(config);
let connection: 'online' | 'offline' | 'setup_needed' = 'setup_needed';
let lastError = '';
let lastRegisterAt = 0;
let stopped = false;
const logs: LocalLog[] = [];

function appendAudit(entry: LocalLog) {
  logs.unshift(entry);
  if (logs.length > 120) logs.length = 120;
  try {
    fs.mkdirSync(HOME_DIR, { recursive: true });
    fs.appendFileSync(AUDIT_PATH, JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    // Audit UI still keeps the in-memory copy when the home directory is read-only.
  }
}

function setupComplete() {
  return Boolean(config.bridgeUrl && config.token && config.workspaceId && config.projectId && config.projectRoot);
}

function runtimeConfig(): ExecutorRuntimeConfig {
  return {
    projectRoot: config.projectRoot,
    allowWrites: config.allowWrites,
    allowCommands: config.allowCommands,
  };
}

function capabilities(): ExecutorAction[] {
  const result: ExecutorAction[] = ['fs.list', 'fs.read', 'git.status', 'git.diff'];
  if (config.allowWrites) result.push('fs.write');
  if (config.allowCommands) result.push('command.run', 'npm.test', 'npm.build');
  return result;
}

async function bridgeFetch(endpoint: string, init: RequestInit = {}) {
  const response = await fetch(`${config.bridgeUrl}${endpoint}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-bridge-executor-token': config.token,
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Bridge HTTP ${response.status}`);
  return data;
}

async function registerNode(force = false) {
  if (!setupComplete()) {
    connection = 'setup_needed';
    return;
  }
  if (!force && Date.now() - lastRegisterAt < 12_000) return;
  const body = {
    node_id: nodeId,
    name: config.name,
    workspace_id: config.workspaceId,
    project_id: config.projectId,
    root_label: path.basename(config.projectRoot) || config.projectRoot,
    platform: `${process.platform}/${process.arch}`,
    capabilities: capabilities(),
  };
  await bridgeFetch('/api/executors/nodes/register', { method: 'POST', body: JSON.stringify(body) });
  lastRegisterAt = Date.now();
  connection = 'online';
  lastError = '';
}

async function submitResult(job: ExecutorJobRecord, ok: boolean, result?: unknown, error?: unknown) {
  await bridgeFetch(`/api/executors/jobs/${encodeURIComponent(job.job_id)}/result`, {
    method: 'POST',
    body: JSON.stringify({ node_id: nodeId, ok, result, error: error ? String(error) : undefined }),
  });
}

async function executeRemoteJob(job: ExecutorJobRecord) {
  const logBase = { time: new Date().toISOString(), type: 'remote-job', action: job.action, job_id: job.job_id };
  try {
    const result = await executeExecutorAction(job.action, job.payload || {}, runtimeConfig());
    const exitOk = result.exit_code == null || result.exit_code === 0;
    if (!exitOk) throw Object.assign(new Error(`Command exited with code ${result.exit_code}`), { executorResult: result });
    await submitResult(job, true, result);
    appendAudit({ ...logBase, ok: true, summary: `${job.action} completed`, stdout: result.stdout });
  } catch (error: any) {
    const result = error?.executorResult;
    try {
      await submitResult(job, false, result || {}, error?.message || error);
    } catch (reportError: any) {
      lastError = `Job failed and result report also failed: ${reportError?.message || reportError}`;
    }
    appendAudit({ ...logBase, ok: false, error: error?.message || String(error), stdout: result?.stdout });
  }
}

async function workerTick() {
  if (!setupComplete()) {
    connection = 'setup_needed';
    return;
  }
  try {
    await registerNode();
    const data = await bridgeFetch('/api/executors/jobs/claim', {
      method: 'POST',
      body: JSON.stringify({ node_id: nodeId, workspace_id: config.workspaceId, project_id: config.projectId }),
    });
    connection = 'online';
    lastError = '';
    if (data.job) await executeRemoteJob(data.job as ExecutorJobRecord);
  } catch (error: any) {
    connection = 'offline';
    lastError = error?.message || String(error);
  }
}

async function workerLoop() {
  while (!stopped) {
    await workerTick();
    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  }
}

function json(res: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > 2 * 1024 * 1024) throw new Error('Request body too large');
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function publicConfig() {
  return {
    bridgeUrl: config.bridgeUrl,
    workspaceId: config.workspaceId,
    projectId: config.projectId,
    projectRoot: config.projectRoot,
    name: config.name,
    allowWrites: config.allowWrites,
    allowCommands: config.allowCommands,
    pollIntervalMs: config.pollIntervalMs,
    tokenConfigured: Boolean(config.token),
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);
    if (req.method === 'GET' && url.pathname === '/') {
      const html = executorDashboardHtml();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      json(res, 200, { ok: true, nodeId, connection, lastError, config: publicConfig(), logs });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/config') {
      const body = await readJson(req) as Record<string, unknown>;
      const next: LocalConfig = {
        ...config,
        bridgeUrl: String(body.bridgeUrl || config.bridgeUrl).trim().replace(/\/+$/, ''),
        token: String(body.token || config.token).trim(),
        workspaceId: String(body.workspaceId || '').trim(),
        projectId: String(body.projectId || '').trim(),
        projectRoot: path.resolve(String(body.projectRoot || config.projectRoot).trim()),
        name: String(body.name || config.name || os.hostname()).trim(),
        allowWrites: body.allowWrites === true,
        allowCommands: body.allowCommands === true,
        pollIntervalMs: Math.max(800, Number(body.pollIntervalMs || config.pollIntervalMs)),
      };
      if (!next.bridgeUrl.startsWith('http://') && !next.bridgeUrl.startsWith('https://')) throw new Error('Bridge URL must use http or https');
      if (!fs.existsSync(next.projectRoot) || !fs.statSync(next.projectRoot).isDirectory()) throw new Error('Project root does not exist or is not a directory');
      config = next;
      nodeId = makeNodeId(config);
      lastRegisterAt = 0;
      saveConfig(config);
      await registerNode(true).catch((error: any) => {
        connection = 'offline';
        lastError = error?.message || String(error);
      });
      json(res, 200, { ok: true, nodeId, connection, config: publicConfig(), error: lastError || undefined });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/local-job') {
      const body = await readJson(req) as { action?: ExecutorAction; payload?: Record<string, unknown> };
      if (!body.action) throw new Error('action is required');
      const time = new Date().toISOString();
      try {
        const result = await executeExecutorAction(body.action, body.payload || {}, runtimeConfig());
        const exitOk = result.exit_code == null || result.exit_code === 0;
        if (!exitOk) throw Object.assign(new Error(`Command exited with code ${result.exit_code}`), { executorResult: result });
        appendAudit({ time, type: 'local-job', action: body.action, ok: true, summary: `${body.action} completed`, stdout: result.stdout });
        json(res, 200, { ok: true, result });
      } catch (error: any) {
        const result = error?.executorResult;
        appendAudit({ time, type: 'local-job', action: body.action, ok: false, error: error?.message || String(error), stdout: result?.stdout });
        json(res, 400, { ok: false, error: error?.message || String(error), result });
      }
      return;
    }
    json(res, 404, { ok: false, error: 'Not found' });
  } catch (error: any) {
    json(res, 400, { ok: false, error: error?.message || String(error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[Bridge Local Executor] Web app: http://${HOST}:${PORT}`);
  console.log(`[Bridge Local Executor] Project root: ${config.projectRoot}`);
  console.log('[Bridge Local Executor] Waiting for Bridge jobs...');
});

process.on('SIGINT', () => { stopped = true; server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { stopped = true; server.close(() => process.exit(0)); });
void workerLoop();
