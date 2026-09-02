import { Router, Request, Response } from 'express';
import { buildProjectBootstrap, rememberProjectMemory, type ProjectBrainScope } from './projectBrain.js';
import { getProject } from './db.js';
import { getWorkspaceRegistry } from './workspaceRegistry.js';

export const projectBrainRouter = Router();

async function resolveWorkspace(workspaceId: string) {
  const project = await getProject();
  const registry = await getWorkspaceRegistry(project);
  const workspace = registry.workspaces.find(item => item.workspace_id === workspaceId);
  if (!workspace) throw new Error(`workspace ${workspaceId} not found`);
  return workspace;
}

projectBrainRouter.get('/:workspace_id/bootstrap', async (req: Request, res: Response) => {
  try {
    const workspace = await resolveWorkspace(req.params.workspace_id);
    const bootstrap = await buildProjectBootstrap(workspace.workspace_id, workspace.project_id);
    res.json({ ok: true, project_brain: bootstrap });
  } catch (err: any) {
    res.status(404).json({ ok: false, error: err.message });
  }
});

projectBrainRouter.post('/:workspace_id/memory', async (req: Request, res: Response) => {
  try {
    const workspace = await resolveWorkspace(req.params.workspace_id);
    const { scope, content, source_agent, source_session, source_task_id, id } = req.body || {};
    if (!scope || !content) {
      res.status(400).json({ ok: false, error: 'scope and content are required' });
      return;
    }
    const entry = await rememberProjectMemory({
      workspace_id: workspace.workspace_id,
      project_id: workspace.project_id,
      scope: scope as ProjectBrainScope,
      content,
      source_agent: source_agent || 'human',
      source_session: source_session || null,
      source_task_id: source_task_id || null,
      id,
    });
    res.status(201).json({ ok: true, memory: entry });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

projectBrainRouter.post('/:workspace_id/handoff', async (req: Request, res: Response) => {
  try {
    const workspace = await resolveWorkspace(req.params.workspace_id);
    const { summary, source_agent, source_session, source_task_id } = req.body || {};
    if (!summary) {
      res.status(400).json({ ok: false, error: 'summary is required' });
      return;
    }
    const entry = await rememberProjectMemory({
      workspace_id: workspace.workspace_id,
      project_id: workspace.project_id,
      scope: 'handoff',
      content: summary,
      source_agent: source_agent || 'unknown',
      source_session: source_session || null,
      source_task_id: source_task_id || null,
    });
    res.status(201).json({ ok: true, handoff: entry });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});
