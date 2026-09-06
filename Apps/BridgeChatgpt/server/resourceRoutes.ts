import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getProject } from './db.js';
import { getResourceRegistry, removeResourceTarget, upsertResourceTarget } from './resourceRegistry.js';
import { projectLocalPath, upsertWorkspace } from './workspaceRegistry.js';
import { buildWakeQueue } from './wakeQueue.js';
import { createExecutorJob, getExecutorSnapshot } from './executorStore.js';

export const resourceRegistryRouter = Router();

function normalizeRepoUrl(raw: unknown) {
  const value = String(raw || '').trim();
  if (!value) throw new Error('repository_url is required');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('repository_url must be a valid absolute URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('repository_url must use http or https');
  parsed.hash = '';
  parsed.search = '';
  const cleanedPath = parsed.pathname.replace(/\.git$/i, '').replace(/\/+$/, '');
  parsed.pathname = cleanedPath;
  return parsed.toString().replace(/\/$/, '');
}

function deriveProjectName(repositoryUrl: string) {
  const parsed = new URL(repositoryUrl);
  const parts = parsed.pathname.split('/').filter(Boolean);
  return parts.at(-1) || 'Bridge Project';
}

function makeWorkspaceId(repositoryUrl: string) {
  const parsed = new URL(repositoryUrl);
  const slug = parsed.pathname
    .split('/')
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 54) || 'project';
  const digest = crypto.createHash('sha256').update(repositoryUrl).digest('hex').slice(0, 8);
  return `workspace-${slug}-${digest}`;
}

async function queuePcProjectSetup(workspace: {
  workspace_id: string;
  project_id: string;
  repository_url: string;
  branch: string;
  local_path: string;
}) {
  const snapshot = await getExecutorSnapshot({ limit: 10 });
  const node = snapshot.nodes.find(item => item.connection_status === 'online' && item.capabilities.includes('command.run'));
  if (!node) return { status: 'waiting_for_pc' as const, job: null };

  const job = await createExecutorJob({
    workspace_id: workspace.workspace_id,
    project_id: workspace.project_id,
    node_id: node.node_id,
    action: 'command.run',
    payload: {
      argv: ['git', 'clone', '--branch', workspace.branch || 'main', '--single-branch', workspace.repository_url, workspace.local_path],
      cwd: '.',
      timeout_ms: 10 * 60_000,
    },
    created_by: 'bridge-project-create',
  });
  return { status: 'queued' as const, job };
}

resourceRegistryRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const project = await getProject();
    res.json({ ok: true, ...(await getResourceRegistry(project)) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

resourceRegistryRouter.get('/wake-queue', async (_req: Request, res: Response) => {
  try {
    const project = await getProject();
    const events = await buildWakeQueue(project);
    res.json({
      ok: true,
      events,
      event_count: events.length,
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

resourceRegistryRouter.post('/projects', async (req: Request, res: Response) => {
  try {
    const project = await getProject();
    const repositoryUrl = normalizeRepoUrl(req.body?.repository_url);
    const suppliedWorkspaceId = String(req.body?.workspace_id || '').trim();
    const creating = !suppliedWorkspaceId;
    const workspaceId = suppliedWorkspaceId || makeWorkspaceId(repositoryUrl);
    const projectId = String(req.body?.project_id || '').trim() || workspaceId.replace(/^workspace-/, 'project-');
    const projectName = String(req.body?.project_name || '').trim() || deriveProjectName(repositoryUrl);
    const branch = String(req.body?.branch || '').trim() || 'main';

    const workspace = await upsertWorkspace(project, {
      workspace_id: workspaceId,
      project_id: projectId,
      project_name: projectName,
      repository_url: repositoryUrl,
      branch,
      local_path: creating ? projectLocalPath(projectName, projectId) : undefined,
      execution_target: req.body?.execution_target,
    });

    let pcSetup: 'not_requested' | 'queued' | 'waiting_for_pc' = 'not_requested';
    let pcSetupJob: Awaited<ReturnType<typeof createExecutorJob>> | null = null;
    if (creating) {
      const setup = await queuePcProjectSetup(workspace);
      pcSetup = setup.status;
      pcSetupJob = setup.job;
    }

    res.status(201).json({
      ok: true,
      workspace,
      pc_setup: pcSetup,
      pc_setup_job: pcSetupJob,
    });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

resourceRegistryRouter.post('/targets', async (req: Request, res: Response) => {
  try {
    const project = await getProject();
    const target = await upsertResourceTarget(project, {
      workspace_id: req.body?.workspace_id,
      resource_url: req.body?.resource_url,
      label: req.body?.label,
    });
    res.status(201).json({ ok: true, target });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

resourceRegistryRouter.delete('/targets/:target_id', async (req: Request, res: Response) => {
  try {
    const removed = await removeResourceTarget(req.params.target_id);
    if (!removed) {
      res.status(404).json({ ok: false, error: `target ${req.params.target_id} not found` });
      return;
    }
    res.json({ ok: true, removed: req.params.target_id });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});
