import fs from 'fs';
import path from 'path';
import type { ProjectConfig } from '../src/types.js';

export type WorkspaceProvider = 'chatgpt' | 'google-ai-studio';
export type WorkspaceInstanceStatus = 'active' | 'idle' | 'offline';
export type WorkspaceExecutionTarget = 'pc' | 'studio';

export interface WorkspaceRecord {
  workspace_id: string;
  project_id: string;
  project_name: string;
  repository_url: string;
  branch: string;
  local_path: string;
  execution_target: WorkspaceExecutionTarget;
  setup_required: boolean;
  created_at: string;
  updated_at: string;
  archived?: boolean;
  deleted_at?: string | null;
}

export interface AgentInstanceRecord {
  agent_instance_id: string;
  provider: WorkspaceProvider;
  workspace_id: string;
  project_id: string;
  account_label: string;
  session_label: string;
  status: WorkspaceInstanceStatus;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

interface WorkspaceRegistryStore {
  version: 1;
  workspaces: WorkspaceRecord[];
  instances: AgentInstanceRecord[];
}

export interface WorkspaceRegistrySnapshot {
  workspaces: Array<WorkspaceRecord & {
    chatgpt_instances: AgentInstanceRecord[];
    studio_instances: AgentInstanceRecord[];
  }>;
  unbound_instances: AgentInstanceRecord[];
  server_time: string;
}

const MAX_LABEL = 160;
const SAFE_ID = /^[a-zA-Z0-9._-]{1,120}$/;
let writeTail: Promise<void> = Promise.resolve();

function registryPath() {
  return path.resolve(process.cwd(), process.env.BRIDGE_WORKSPACE_REGISTRY_PATH || 'data/workspace-registry.json');
}

function emptyStore(): WorkspaceRegistryStore {
  return { version: 1, workspaces: [], instances: [] };
}

function readStore(): WorkspaceRegistryStore {
  const file = registryPath();
  if (!fs.existsSync(file)) return emptyStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as WorkspaceRegistryStore;
    if (parsed?.version !== 1 || !Array.isArray(parsed.workspaces) || !Array.isArray(parsed.instances)) return emptyStore();
    return parsed;
  } catch {
    return emptyStore();
  }
}

function writeStore(store: WorkspaceRegistryStore) {
  const file = registryPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

async function withRegistryLock<T>(fn: () => Promise<T> | T): Promise<T> {
  let release!: () => void;
  const previous = writeTail;
  writeTail = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

function cleanLabel(value: unknown, fallback = '') {
  return String(value || fallback).trim().slice(0, MAX_LABEL);
}

function requireId(name: string, value: unknown) {
  const id = String(value || '').trim();
  if (!SAFE_ID.test(id)) throw new Error(`${name} must match ${SAFE_ID}`);
  return id;
}

function normalizeExecutionTarget(value: unknown, fallback: WorkspaceExecutionTarget = 'studio'): WorkspaceExecutionTarget {
  if (value === 'pc' || value === 'studio') return value;
  return fallback;
}

export function projectLocalPath(projectName: unknown, fallback = 'Project') {
  const clean = String(projectName || fallback)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .slice(0, 100)
    .trim();
  return `Apps/${clean || fallback}`;
}

function defaultWorkspace(project: ProjectConfig): WorkspaceRecord {
  const now = new Date().toISOString();
  const projectName = project.project_name || 'BridgeChatgpt';
  return {
    workspace_id: `workspace-${project.id || 'default'}`,
    project_id: project.id || 'proj-default',
    project_name: projectName,
    repository_url: project.repository_url || '',
    branch: project.default_branch || 'main',
    local_path: projectLocalPath(projectName, 'BridgeChatgpt'),
    execution_target: 'studio',
    setup_required: false,
    created_at: now,
    updated_at: now,
    archived: false,
    deleted_at: null,
  };
}

function ensureDefault(store: WorkspaceRegistryStore, project: ProjectConfig) {
  if (store.workspaces.length > 0) return;
  store.workspaces.push(defaultWorkspace(project));
}

export async function getWorkspaceRegistry(project: ProjectConfig): Promise<WorkspaceRegistrySnapshot> {
  return withRegistryLock(async () => {
    const store = readStore();
    const before = store.workspaces.length;
    ensureDefault(store, project);
    if (before !== store.workspaces.length) writeStore(store);

    const workspaces = store.workspaces.map(workspace => ({
      ...workspace,
      local_path: workspace.local_path || projectLocalPath(workspace.project_name, workspace.project_id),
      execution_target: normalizeExecutionTarget(workspace.execution_target),
      setup_required: Boolean(workspace.setup_required),
      archived: Boolean(workspace.archived),
      deleted_at: workspace.deleted_at || null,
      chatgpt_instances: store.instances.filter(instance => instance.workspace_id === workspace.workspace_id && instance.provider === 'chatgpt'),
      studio_instances: store.instances.filter(instance => instance.workspace_id === workspace.workspace_id && instance.provider === 'google-ai-studio'),
    }));
    const workspaceIds = new Set(store.workspaces.map(item => item.workspace_id));
    return {
      workspaces,
      unbound_instances: store.instances.filter(instance => !workspaceIds.has(instance.workspace_id)),
      server_time: new Date().toISOString(),
    };
  });
}

export async function upsertWorkspace(project: ProjectConfig, input: Partial<WorkspaceRecord>): Promise<WorkspaceRecord> {
  return withRegistryLock(async () => {
    const store = readStore();
    ensureDefault(store, project);
    const workspaceId = input.workspace_id ? requireId('workspace_id', input.workspace_id) : `workspace-${Date.now().toString(36)}`;
    const projectId = input.project_id ? requireId('project_id', input.project_id) : workspaceId.replace(/^workspace-/, 'project-');
    const now = new Date().toISOString();
    const existing = store.workspaces.find(item => item.workspace_id === workspaceId);
    const projectName = cleanLabel(input.project_name, existing?.project_name || project.project_name || projectId);
    const next: WorkspaceRecord = {
      workspace_id: workspaceId,
      project_id: projectId,
      project_name: projectName,
      repository_url: input.repository_url == null ? (existing?.repository_url || project.repository_url) : String(input.repository_url).trim().slice(0,1024),
      branch: cleanLabel(input.branch, existing?.branch || project.default_branch || 'main'),
      local_path: cleanLabel(input.local_path, existing?.local_path || projectLocalPath(projectName, projectId)),
      execution_target: normalizeExecutionTarget(input.execution_target, normalizeExecutionTarget(existing?.execution_target)),
      setup_required: input.setup_required == null ? Boolean(existing?.setup_required) : Boolean(input.setup_required),
      created_at: existing?.created_at || now,
      updated_at: now,
      archived: input.archived == null ? Boolean(existing?.archived) : Boolean(input.archived),
      deleted_at: input.deleted_at === undefined ? (existing?.deleted_at || null) : (input.deleted_at || null),
    };
    if (!next.local_path.startsWith('Apps/')) throw new Error('local_path must stay under Apps/');
    if(store.workspaces.some(w=>w.workspace_id!==workspaceId&&w.local_path.toLowerCase()===next.local_path.toLowerCase()))throw new Error('This project folder is already registered');
    if(existing&&(existing.project_id!==next.project_id||existing.local_path!==next.local_path))throw new Error('An existing project cannot be redirected to another folder or identity');
    if (existing) Object.assign(existing, next);
    else store.workspaces.push(next);
    writeStore(store);
    return next;
  });
}

export async function updateWorkspace(project: ProjectConfig, workspaceId: string, input: { project_name?: string; branch?: string; repository_url?: string }): Promise<WorkspaceRecord> {
  return withRegistryLock(async () => {
    const store = readStore(); ensureDefault(store, project);
    const workspace = store.workspaces.find(item => item.workspace_id === requireId('workspace_id', workspaceId));
    if (!workspace || workspace.deleted_at) throw Object.assign(new Error('Project not found'), { statusCode: 404 });
    if (input.project_name !== undefined) workspace.project_name = cleanLabel(input.project_name, workspace.project_name);
    if (input.branch !== undefined) workspace.branch = cleanLabel(input.branch, workspace.branch);
    if (input.repository_url !== undefined) workspace.repository_url = String(input.repository_url).trim().slice(0, 1024);
    workspace.updated_at = new Date().toISOString(); writeStore(store); return { ...workspace };
  });
}

export async function setWorkspaceLifecycle(project: ProjectConfig, workspaceId: string, action: 'archive' | 'restore' | 'delete'): Promise<WorkspaceRecord> {
  return withRegistryLock(async () => {
    const store = readStore(); ensureDefault(store, project);
    const workspace = store.workspaces.find(item => item.workspace_id === requireId('workspace_id', workspaceId));
    if (!workspace || (workspace.deleted_at && action !== 'restore')) throw Object.assign(new Error('Project not found'), { statusCode: 404 });
    const now = new Date().toISOString();
    if (action === 'archive') workspace.archived = true;
    else if (action === 'restore') { workspace.archived = false; workspace.deleted_at = null; }
    else { workspace.deleted_at = now; workspace.archived = true; }
    workspace.updated_at = now; writeStore(store); return { ...workspace };
  });
}

export async function registerAgentInstance(project: ProjectConfig, input: {
  agent_instance_id: string;
  provider: WorkspaceProvider;
  workspace_id?: string;
  project_id?: string;
  account_label?: string;
  session_label?: string;
  status?: WorkspaceInstanceStatus;
}): Promise<AgentInstanceRecord> {
  return withRegistryLock(async () => {
    const store = readStore();
    ensureDefault(store, project);
    const instanceId = requireId('agent_instance_id', input.agent_instance_id);
    if (!['chatgpt', 'google-ai-studio'].includes(input.provider)) throw new Error('provider must be chatgpt or google-ai-studio');
    const fallbackWorkspace = store.workspaces[0];
    const workspaceId = requireId('workspace_id', input.workspace_id || fallbackWorkspace.workspace_id);
    const workspace = store.workspaces.find(item => item.workspace_id === workspaceId);
    if (!workspace) throw new Error(`workspace ${workspaceId} not found`);
    const projectId = requireId('project_id', input.project_id || workspace.project_id);
    if (projectId !== workspace.project_id) throw new Error(`project_id ${projectId} does not match workspace ${workspaceId}`);
    const now = new Date().toISOString();
    const existing = store.instances.find(item => item.agent_instance_id === instanceId);
    const next: AgentInstanceRecord = {
      agent_instance_id: instanceId,
      provider: input.provider,
      workspace_id: workspaceId,
      project_id: projectId,
      account_label: cleanLabel(input.account_label, existing?.account_label || ''),
      session_label: cleanLabel(input.session_label, existing?.session_label || instanceId),
      status: input.status || existing?.status || 'active',
      last_seen_at: now,
      created_at: existing?.created_at || now,
      updated_at: now,
    };
    if (existing) Object.assign(existing, next);
    else store.instances.push(next);
    writeStore(store);
    return next;
  });
}

export async function touchAgentInstance(project: ProjectConfig, input: {
  agent_instance_id: string;
  provider: WorkspaceProvider;
  workspace_id?: string;
  account_label?: string;
  session_label?: string;
  status?: WorkspaceInstanceStatus;
}): Promise<AgentInstanceRecord> {
  return registerAgentInstance(project, input);
}

export async function bindAgentInstance(project: ProjectConfig, input: {
  agent_instance_id: string;
  workspace_id: string;
}): Promise<AgentInstanceRecord> {
  return withRegistryLock(async () => {
    const store = readStore();
    ensureDefault(store, project);
    const instanceId = requireId('agent_instance_id', input.agent_instance_id);
    const workspaceId = requireId('workspace_id', input.workspace_id);
    const instance = store.instances.find(item => item.agent_instance_id === instanceId);
    if (!instance) throw new Error(`agent instance ${instanceId} not found`);
    const workspace = store.workspaces.find(item => item.workspace_id === workspaceId);
    if (!workspace) throw new Error(`workspace ${workspaceId} not found`);
    const now = new Date().toISOString();
    instance.workspace_id = workspace.workspace_id;
    instance.project_id = workspace.project_id;
    instance.updated_at = now;
    instance.last_seen_at = now;
    writeStore(store);
    return { ...instance };
  });
}

export async function getAgentInstance(project: ProjectConfig, instanceId: string): Promise<AgentInstanceRecord | null> {
  const snapshot = await getWorkspaceRegistry(project);
  for (const workspace of snapshot.workspaces) {
    const found = [...workspace.chatgpt_instances, ...workspace.studio_instances].find(item => item.agent_instance_id === instanceId);
    if (found) return found;
  }
  return snapshot.unbound_instances.find(item => item.agent_instance_id === instanceId) || null;
}
