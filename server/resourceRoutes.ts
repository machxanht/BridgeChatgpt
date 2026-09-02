import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getProject } from './db.js';
import { getResourceRegistry, removeResourceTarget, upsertResourceTarget } from './resourceRegistry.js';
import { upsertWorkspace } from './workspaceRegistry.js';

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

resourceRegistryRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const project = await getProject();
    res.json({ ok: true, ...(await getResourceRegistry(project)) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

resourceRegistryRouter.post('/projects', async (req: Request, res: Response) => {
  try {
    const project = await getProject();
    const repositoryUrl = normalizeRepoUrl(req.body?.repository_url);
    const workspaceId = String(req.body?.workspace_id || '').trim() || makeWorkspaceId(repositoryUrl);
    const workspace = await upsertWorkspace(project, {
      workspace_id: workspaceId,
      project_id: String(req.body?.project_id || '').trim() || workspaceId.replace(/^workspace-/, 'project-'),
      project_name: String(req.body?.project_name || '').trim() || deriveProjectName(repositoryUrl),
      repository_url: repositoryUrl,
      branch: String(req.body?.branch || '').trim() || 'main',
    });
    res.status(201).json({ ok: true, workspace });
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
