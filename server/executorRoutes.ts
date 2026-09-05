import { NextFunction, Request, Response, Router } from 'express';
import { isSameOriginBrowserRequest, verifyToken } from './auth.js';
import {
  cancelExecutorJob,
  claimExecutorJob,
  completeExecutorJob,
  createExecutorJob,
  getExecutorJob,
  getExecutorSnapshot,
  heartbeatExecutorNode,
  registerExecutorNode,
} from './executorStore.js';

export const executorRouter = Router();

function readPresentedExecutorToken(req: Request) {
  const explicit = req.headers['x-bridge-executor-token'];
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const auth = req.headers.authorization || '';
  const [scheme, token] = auth.split(' ');
  if (token && (scheme === 'Bearer' || scheme === 'Token')) return token;
  return '';
}

function requireExecutorAccess(req: Request, res: Response, next: NextFunction) {
  const executorToken = String(process.env.BRIDGE_EXECUTOR_TOKEN || '').trim();
  const mainToken = String(process.env.BRIDGE_MCP_TOKEN || '').trim();
  if (isSameOriginBrowserRequest(req) || (mainToken && verifyToken(req))) {
    next();
    return;
  }
  if (!executorToken && !mainToken) {
    next();
    return;
  }
  if (executorToken && readPresentedExecutorToken(req) === executorToken) {
    next();
    return;
  }
  res.status(401).json({
    ok: false,
    error: 'Unauthorized executor client. Provide x-bridge-executor-token or a valid Bridge token.',
  });
}

executorRouter.use(requireExecutorAccess);

executorRouter.get('/snapshot', async (req: Request, res: Response) => {
  try {
    const snapshot = await getExecutorSnapshot({
      workspace_id: req.query.workspace_id ? String(req.query.workspace_id) : undefined,
      project_id: req.query.project_id ? String(req.query.project_id) : undefined,
      node_id: req.query.node_id ? String(req.query.node_id) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ ok: true, ...snapshot });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

executorRouter.get('/jobs/:job_id', async (req: Request, res: Response) => {
  try {
    const job = await getExecutorJob(req.params.job_id);
    if (!job) {
      res.status(404).json({ ok: false, error: `Executor job ${req.params.job_id} not found` });
      return;
    }
    res.json({ ok: true, job });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

executorRouter.post('/nodes/register', async (req: Request, res: Response) => {
  try {
    const node = await registerExecutorNode({
      node_id: req.body?.node_id,
      name: req.body?.name,
      workspace_id: req.body?.workspace_id,
      project_id: req.body?.project_id,
      root_label: req.body?.root_label,
      platform: req.body?.platform,
      capabilities: req.body?.capabilities,
    });
    res.status(201).json({ ok: true, node });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

executorRouter.post('/nodes/:node_id/heartbeat', async (req: Request, res: Response) => {
  try {
    const node = await heartbeatExecutorNode(req.params.node_id);
    res.json({ ok: true, node });
  } catch (err: any) {
    res.status(404).json({ ok: false, error: err.message });
  }
});

executorRouter.post('/jobs', async (req: Request, res: Response) => {
  try {
    const job = await createExecutorJob({
      workspace_id: req.body?.workspace_id,
      project_id: req.body?.project_id,
      node_id: req.body?.node_id,
      task_id: req.body?.task_id,
      action: req.body?.action,
      payload: req.body?.payload,
      created_by: req.body?.created_by || (req as any).auth?.agentName || 'bridge',
    });
    res.status(201).json({ ok: true, job });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

executorRouter.post('/jobs/claim', async (req: Request, res: Response) => {
  try {
    const job = await claimExecutorJob({
      node_id: req.body?.node_id,
      workspace_id: req.body?.workspace_id,
      project_id: req.body?.project_id,
    });
    res.json({ ok: true, job });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

executorRouter.post('/jobs/:job_id/result', async (req: Request, res: Response) => {
  try {
    const job = await completeExecutorJob({
      node_id: req.body?.node_id,
      job_id: req.params.job_id,
      ok: req.body?.ok === true,
      result: req.body?.result,
      error: req.body?.error,
    });
    res.json({ ok: true, job });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

executorRouter.post('/jobs/:job_id/cancel', async (req: Request, res: Response) => {
  try {
    const job = await cancelExecutorJob(req.params.job_id);
    res.json({ ok: true, job });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});
