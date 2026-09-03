import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { ProjectConfig } from '../src/types.js';
import { getWorkspaceRegistry } from './workspaceRegistry.js';

export type ResourceProvider = 'chatgpt' | 'google-ai-studio';
export type ResourceConnectionStatus = 'registered' | 'active' | 'idle' | 'offline';

export interface ResourceTargetRecord {
  target_id: string;
  provider: ResourceProvider;
  resource_id: string;
  resource_url: string;
  workspace_id: string;
  project_id: string;
  label: string;
  agent_instance_id: string;
  created_at: string;
  updated_at: string;
}

interface ResourceRegistryStore {
  version: 1;
  targets: ResourceTargetRecord[];
}

export interface ResourceTargetView extends ResourceTargetRecord {
  connection_status: ResourceConnectionStatus;
  last_seen_at: string | null;
}

export interface ResourceRegistrySnapshot {
  instance_id: string;
  workspaces: Array<{
    workspace_id: string;
    project_id: string;
    project_name: string;
    repository_url: string;
    branch: string;
    studio_targets: ResourceTargetView[];
    chatgpt_targets: ResourceTargetView[];
  }>;
  server_time: string;
}

const RESOURCE_ID = /^[a-zA-Z0-9._-]{4,100}$/;
const MAX_LABEL = 160;
const RESOURCE_REGISTRY_INSTANCE_ID = crypto.randomUUID();
let writeTail: Promise<void> = Promise.resolve();

function registryPath() {
  return path.resolve(process.cwd(), process.env.BRIDGE_RESOURCE_REGISTRY_PATH || 'data/resource-registry.json');
}

function emptyStore(): ResourceRegistryStore {
  return { version: 1, targets: [] };
}

function readStore(): ResourceRegistryStore {
  const file = registryPath();
  if (!fs.existsSync(file)) return emptyStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as ResourceRegistryStore;
    if (parsed?.version !== 1 || !Array.isArray(parsed.targets)) return emptyStore();
    return parsed;
  } catch {
    return emptyStore();
  }
}

function writeStore(store: ResourceRegistryStore) {
  const file = registryPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

async function withWriteLock<T>(fn: () => Promise<T> | T): Promise<T> {
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

function safeLabel(value: unknown, fallback: string) {
  const label = String(value || fallback).trim().slice(0, MAX_LABEL);
  return label || fallback;
}

function normalizeUrl(raw: unknown): URL {
  const value = String(raw || '').trim();
  if (!value) throw new Error('resource_url is required');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('resource_url must be a valid absolute URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('resource_url must use http or https');
  }
  return parsed;
}

function requireResourceId(id: string) {
  if (!RESOURCE_ID.test(id)) throw new Error(`resource id is not supported: ${id}`);
  return id;
}

function canonicalUrl(url: URL) {
  url.hash = '';
  return url.toString();
}

export function parseResourceUrl(raw: unknown): {
  provider: ResourceProvider;
  resource_id: string;
  resource_url: string;
} {
  const url = normalizeUrl(raw);
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean).map(segment => decodeURIComponent(segment));

  if (host === 'aistudio.google.com') {
    const appsIndex = segments.findIndex(segment => segment === 'apps');
    if (appsIndex < 0 || !segments[appsIndex + 1]) {
      throw new Error('AI Studio URL must contain /apps/<app-id>');
    }
    const resourceId = requireResourceId(segments[appsIndex + 1]);
    return {
      provider: 'google-ai-studio',
      resource_id: resourceId,
      resource_url: canonicalUrl(url),
    };
  }

  if (host === 'chatgpt.com' || host === 'chat.openai.com') {
    if (segments[0] === 'share') {
      throw new Error('Use the original ChatGPT conversation URL, not a shared link');
    }
    const conversationIndex = segments.findIndex(segment => segment === 'c');
    if (conversationIndex < 0 || !segments[conversationIndex + 1]) {
      throw new Error('ChatGPT URL must contain /c/<conversation-id>');
    }
    const resourceId = requireResourceId(segments[conversationIndex + 1]);
    return {
      provider: 'chatgpt',
      resource_id: resourceId,
      resource_url: canonicalUrl(url),
    };
  }

  throw new Error('Only AI Studio and ChatGPT conversation URLs are supported');
}

function makeInternalId(provider: ResourceProvider, resourceId: string) {
  const prefix = provider === 'google-ai-studio' ? 'studio' : 'chatgpt';
  const safe = resourceId.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 90);
  if (`${prefix}-${safe}`.length <= 120) return `${prefix}-${safe}`;
  const digest = crypto.createHash('sha256').update(resourceId).digest('hex').slice(0, 12);
  return `${prefix}-${safe.slice(0, 72)}-${digest}`;
}

export async function upsertResourceTarget(project: ProjectConfig, input: {
  workspace_id: string;
  resource_url: string;
  label?: string;
}): Promise<ResourceTargetRecord> {
  return withWriteLock(async () => {
    const registry = await getWorkspaceRegistry(project);
    const workspace = registry.workspaces.find(item => item.workspace_id === String(input.workspace_id || '').trim());
    if (!workspace) throw new Error(`workspace ${input.workspace_id} not found`);

    const parsed = parseResourceUrl(input.resource_url);
    const targetId = makeInternalId(parsed.provider, parsed.resource_id);
    const now = new Date().toISOString();
    const store = readStore();
    const existing = store.targets.find(item => item.target_id === targetId);
    const providerLabel = parsed.provider === 'google-ai-studio' ? 'AI Studio' : 'ChatGPT';
    const next: ResourceTargetRecord = {
      target_id: targetId,
      provider: parsed.provider,
      resource_id: parsed.resource_id,
      resource_url: parsed.resource_url,
      workspace_id: workspace.workspace_id,
      project_id: workspace.project_id,
      label: safeLabel(input.label, existing?.label || `${providerLabel} · ${parsed.resource_id.slice(0, 8)}…`),
      agent_instance_id: targetId,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    if (existing) Object.assign(existing, next);
    else store.targets.push(next);
    writeStore(store);
    return next;
  });
}

export async function removeResourceTarget(targetId: string): Promise<boolean> {
  return withWriteLock(async () => {
    const store = readStore();
    const before = store.targets.length;
    store.targets = store.targets.filter(item => item.target_id !== targetId);
    if (store.targets.length !== before) writeStore(store);
    return store.targets.length !== before;
  });
}

export async function getResourceRegistry(project: ProjectConfig): Promise<ResourceRegistrySnapshot> {
  const [workspaceRegistry, store] = await Promise.all([
    getWorkspaceRegistry(project),
    Promise.resolve(readStore()),
  ]);

  const workspaces = workspaceRegistry.workspaces.map(workspace => {
    const agents = [...workspace.chatgpt_instances, ...workspace.studio_instances];
    const targets = store.targets
      .filter(target => target.workspace_id === workspace.workspace_id && target.project_id === workspace.project_id)
      .map<ResourceTargetView>(target => {
        const agent = agents.find(item => item.agent_instance_id === target.agent_instance_id);
        return {
          ...target,
          connection_status: agent?.status || 'registered',
          last_seen_at: agent?.last_seen_at || null,
        };
      });
    return {
      workspace_id: workspace.workspace_id,
      project_id: workspace.project_id,
      project_name: workspace.project_name,
      repository_url: workspace.repository_url,
      branch: workspace.branch,
      studio_targets: targets.filter(target => target.provider === 'google-ai-studio'),
      chatgpt_targets: targets.filter(target => target.provider === 'chatgpt'),
    };
  });

  return {
    instance_id: RESOURCE_REGISTRY_INSTANCE_ID,
    workspaces,
    server_time: new Date().toISOString(),
  };
}
