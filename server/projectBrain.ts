import fs from 'fs';
import path from 'path';
import { getProject, getTasks } from './db.js';
import { extractTaskBinding } from './taskBinding.js';
import { getWorkspaceRegistry } from './workspaceRegistry.js';

export type ProjectBrainScope = 'goal' | 'decision' | 'architecture' | 'blocker' | 'fact' | 'handoff';

export interface ProjectBrainEntry {
  id: string;
  workspace_id: string;
  project_id: string;
  scope: ProjectBrainScope;
  content: string;
  source_agent: string;
  source_session?: string | null;
  source_task_id?: string | null;
  created_at: string;
  updated_at: string;
}

interface ProjectBrainStore {
  version: 1;
  entries: ProjectBrainEntry[];
}

export interface ProjectBrainBootstrap {
  version: 1;
  workspace_id: string;
  project_id: string;
  project_name: string;
  repository_url: string;
  branch: string;
  current_goal: string;
  shared_memory: ProjectBrainEntry[];
  active_tasks: Array<{ id: string; title: string; status: string; assignee: string; updated_at: string }>;
  recent_completed: Array<{ id: string; title: string; status: string; assignee: string; updated_at: string; result: string | null }>;
  bootstrap_text: string;
  generated_at: string;
}

const VALID_SCOPES = new Set<ProjectBrainScope>(['goal', 'decision', 'architecture', 'blocker', 'fact', 'handoff']);
const MAX_CONTENT = 12_000;
let writeTail: Promise<void> = Promise.resolve();

function runtimePath() {
  return path.resolve(process.cwd(), process.env.BRIDGE_PROJECT_BRAIN_PATH || 'data/project-brain.json');
}

function repoSnapshotPath() {
  return path.resolve(process.cwd(), process.env.BRIDGE_PROJECT_BRAIN_SNAPSHOT_PATH || '.bridge/brain/PROJECT_STATE.json');
}

function emptyStore(): ProjectBrainStore {
  return { version: 1, entries: [] };
}

function readStoreFile(file: string): ProjectBrainStore {
  if (!fs.existsSync(file)) return emptyStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as ProjectBrainStore;
    if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) return emptyStore();
    return parsed;
  } catch {
    return emptyStore();
  }
}

function readMergedStore(): ProjectBrainStore {
  const base = readStoreFile(repoSnapshotPath());
  const runtime = readStoreFile(runtimePath());
  const merged = new Map<string, ProjectBrainEntry>();
  for (const item of [...base.entries, ...runtime.entries]) merged.set(item.id, item);
  return { version: 1, entries: [...merged.values()] };
}

function writeRuntimeStore(store: ProjectBrainStore) {
  const file = runtimePath();
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

function cleanId(value: unknown, fallback: string) {
  const result = String(value || fallback).trim().replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120);
  return result || fallback;
}

function cleanContent(value: unknown) {
  const result = String(value || '').trim().slice(0, MAX_CONTENT);
  if (!result) throw new Error('content is required');
  return result;
}

export async function rememberProjectMemory(input: {
  workspace_id: string;
  project_id: string;
  scope: ProjectBrainScope;
  content: string;
  source_agent: string;
  source_session?: string | null;
  source_task_id?: string | null;
  id?: string;
}): Promise<ProjectBrainEntry> {
  if (!VALID_SCOPES.has(input.scope)) throw new Error(`invalid project brain scope: ${input.scope}`);
  return withWriteLock(async () => {
    const merged = readMergedStore();
    const runtime = readStoreFile(runtimePath());
    const now = new Date().toISOString();
    const id = cleanId(input.id, `MEM-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`);
    const existing = merged.entries.find(item => item.id === id);
    const next: ProjectBrainEntry = {
      id,
      workspace_id: cleanId(input.workspace_id, 'workspace-default'),
      project_id: cleanId(input.project_id, 'project-default'),
      scope: input.scope,
      content: cleanContent(input.content),
      source_agent: cleanId(input.source_agent, 'unknown'),
      source_session: input.source_session ? cleanId(input.source_session, 'unknown') : null,
      source_task_id: input.source_task_id ? cleanId(input.source_task_id, 'unknown') : null,
      created_at: existing?.created_at || now,
      updated_at: now,
    };
    const runtimeIndex = runtime.entries.findIndex(item => item.id === id);
    if (runtimeIndex >= 0) runtime.entries[runtimeIndex] = next;
    else runtime.entries.push(next);
    writeRuntimeStore(runtime);
    return next;
  });
}

export async function listProjectMemory(workspaceId: string, projectId: string): Promise<ProjectBrainEntry[]> {
  return readMergedStore().entries
    .filter(item => item.workspace_id === workspaceId && item.project_id === projectId)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function buildProjectBootstrap(workspaceId: string, projectId: string): Promise<ProjectBrainBootstrap> {
  const project = await getProject();
  const registry = await getWorkspaceRegistry(project);
  const workspace = registry.workspaces.find(item => item.workspace_id === workspaceId && item.project_id === projectId);
  if (!workspace) throw new Error(`workspace/project not found: ${workspaceId}/${projectId}`);

  const memory = (await listProjectMemory(workspaceId, projectId)).slice(0, 80);
  const tasks = await getTasks({ limit: 300 });
  const projectTasks = tasks.filter(task => {
    const binding = extractTaskBinding(String(task.description || '')).binding;
    return binding?.workspace_id === workspaceId && binding?.project_id === projectId;
  });
  const activeTasks = projectTasks
    .filter(task => ['pending', 'assigned', 'working', 'review', 'blocked'].includes(task.status))
    .slice(0, 30)
    .map(task => ({ id: task.id, title: task.title, status: task.status, assignee: task.assignee, updated_at: task.updated_at }));
  const recentCompleted = projectTasks
    .filter(task => task.status === 'completed')
    .slice(0, 20)
    .map(task => ({ id: task.id, title: task.title, status: task.status, assignee: task.assignee, updated_at: task.updated_at, result: task.result || null }));

  const explicitGoal = memory.find(item => item.scope === 'goal')?.content;
  const currentGoal = explicitGoal || (projectId === project.id ? project.current_goal : workspace.project_name);
  const memoryLines = memory.slice(0, 25).map(item => `- [${item.scope}] ${item.content}`);
  const activeLines = activeTasks.slice(0, 15).map(task => `- ${task.id} ${task.status} ${task.assignee}: ${task.title}`);
  const completedLines = recentCompleted.slice(0, 10).map(task => `- ${task.id}: ${task.title}`);
  const bootstrapText = [
    `PROJECT: ${workspace.project_name}`,
    `WORKSPACE: ${workspace.workspace_id}`,
    `REPO: ${workspace.repository_url} @ ${workspace.branch}`,
    `CURRENT GOAL: ${currentGoal}`,
    '',
    'SHARED PROJECT MEMORY:',
    ...(memoryLines.length ? memoryLines : ['- No durable project memories recorded yet.']),
    '',
    'ACTIVE TASKS:',
    ...(activeLines.length ? activeLines : ['- None']),
    '',
    'RECENTLY COMPLETED:',
    ...(completedLines.length ? completedLines : ['- None']),
    '',
    'RULE: Treat Project Brain as shared team context. Keep session scratch private; record only durable decisions, architecture, blockers, facts, goals, and handoffs here.',
  ].join('\n');

  return {
    version: 1,
    workspace_id: workspaceId,
    project_id: projectId,
    project_name: workspace.project_name,
    repository_url: workspace.repository_url,
    branch: workspace.branch,
    current_goal: currentGoal,
    shared_memory: memory,
    active_tasks: activeTasks,
    recent_completed: recentCompleted,
    bootstrap_text: bootstrapText,
    generated_at: new Date().toISOString(),
  };
}
