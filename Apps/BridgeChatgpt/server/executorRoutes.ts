import { NextFunction, Request, Response, Router } from 'express';
import { isSameOriginBrowserRequest, verifyToken } from './auth.js';
import { getProject } from './db.js';
import { issueExecutorPairing, redeemExecutorPairing, verifyPairedExecutorToken, type PairedExecutorAuth } from './executorPairing.js';
import { executorCwdForWorkspace } from './executorRouting.js';
import { getResourceRegistry } from './resourceRegistry.js';
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

type ExecutorRequestAuth =
  | { kind: 'browser' | 'main' | 'legacy' | 'open' }
  | { kind: 'paired'; pairing: PairedExecutorAuth };

function readPresentedExecutorToken(req: Request) {
  const explicit = req.headers['x-bridge-executor-token'];
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const auth = req.headers.authorization || '';
  const [scheme, token] = auth.split(' ');
  if (token && (scheme === 'Bearer' || scheme === 'Token')) return token;
  return '';
}

function requestAuth(req: Request): ExecutorRequestAuth | undefined {
  return (req as any).executorAuth as ExecutorRequestAuth | undefined;
}

function requirePairingIssuer(req: Request, res: Response, next: NextFunction) {
  const mainToken = String(process.env.BRIDGE_MCP_TOKEN || '').trim();
  if (isSameOriginBrowserRequest(req) || (mainToken && verifyToken(req))) {
    next();
    return;
  }
  res.status(401).json({ ok: false, error: 'Pairing codes can only be created from the Bridge UI or an authenticated Bridge agent.' });
}

executorRouter.post('/pairing-codes', requirePairingIssuer, async (req: Request, res: Response) => {
  try {
    const pairing = await issueExecutorPairing({
      workspace_id: req.body?.workspace_id,
      project_id: req.body?.project_id,
      ttl_ms: req.body?.ttl_ms,
    });
    res.status(201).json({ ok: true, ...pairing });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

executorRouter.post('/pair', async (req: Request, res: Response) => {
  try {
    const paired = await redeemExecutorPairing({ code: req.body?.code, node_id: req.body?.node_id });
    res.json({ ok: true, ...paired });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

function requireExecutorAccess(req: Request, res: Response, next: NextFunction) {
  const executorToken = String(process.env.BRIDGE_EXECUTOR_TOKEN || '').trim();
  const mainToken = String(process.env.BRIDGE_MCP_TOKEN || '').trim();
  if (isSameOriginBrowserRequest(req)) {
    (req as any).executorAuth = { kind: 'browser' } satisfies ExecutorRequestAuth;
    next();
    return;
  }
  if (mainToken && verifyToken(req)) {
    (req as any).executorAuth = { kind: 'main' } satisfies ExecutorRequestAuth;
    next();
    return;
  }
  const presented = readPresentedExecutorToken(req);
  if (executorToken && presented === executorToken) {
    (req as any).executorAuth = { kind: 'legacy' } satisfies ExecutorRequestAuth;
    next();
    return;
  }
  const pairing = presented ? verifyPairedExecutorToken(presented) : null;
  if (pairing) {
    (req as any).executorAuth = { kind: 'paired', pairing } satisfies ExecutorRequestAuth;
    next();
    return;
  }
  if (!executorToken && !mainToken) {
    (req as any).executorAuth = { kind: 'open' } satisfies ExecutorRequestAuth;
    next();
    return;
  }
  res.status(401).json({
    ok: false,
    error: 'Unauthorized executor client. Pair this PC from Bridge or provide a valid executor token.',
  });
}

/**
 * Paired executor credentials are machine-scoped. The pairing remembers the
 * workspace/project where the PC was first connected for audit/backward
 * compatibility, but it does not need a new token for each Apps/<Project>.
 */
function enforcePairedNode(req: Request, nodeIdRaw: unknown) {
  const auth = requestAuth(req);
  if (!auth || auth.kind !== 'paired') return;
  if (nodeIdRaw != null && String(nodeIdRaw) !== auth.pairing.node_id) {
    throw new Error('Paired token belongs to another PC node');
  }
}

function requireController(req: Request) {
  const auth = requestAuth(req);
  if (auth?.kind === 'paired') throw new Error('PC worker tokens cannot queue or cancel jobs');
}

async function projectScopedPayload(workspaceIdRaw: unknown, projectIdRaw: unknown, rawPayload: unknown) {
  const workspaceId = String(workspaceIdRaw || '').trim();
  const projectId = String(projectIdRaw || '').trim();
  const payload = rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
    ? { ...(rawPayload as Record<string, unknown>) }
    : {};
  const project = await getProject();
  const registry = await getResourceRegistry(project);
  const workspace = registry.workspaces.find(item => item.workspace_id === workspaceId && item.project_id === projectId);
  if (!workspace) throw new Error(`Workspace/project not found: ${workspaceId}/${projectId}`);
  // Bridge itself is monorepo-style: source is under Apps/BridgeChatgpt but Git/package.json live at repo root.
  // Independent managed projects execute from Apps/<ProjectName>. The local executor still independently
  // rejects any cwd that escapes its approved root.
  payload.cwd = executorCwdForWorkspace(project.id, workspace.project_id, workspace.local_path);
  return payload;
}

executorRouter.use(requireExecutorAccess);

executorRouter.get('/snapshot', async (req: Request, res: Response) => {
  try {
    const auth = requestAuth(req);
    const paired = auth?.kind === 'paired' ? auth.pairing : null;
    const snapshot = await getExecutorSnapshot({
      workspace_id: req.query.workspace_id ? String(req.query.workspace_id) : undefined,
      project_id: req.query.project_id ? String(req.query.project_id) : undefined,
      node_id: paired?.node_id || (req.query.node_id ? String(req.query.node_id) : undefined),
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
    const auth = requestAuth(req);
    if (auth?.kind === 'paired' && job.node_id !== auth.pairing.node_id) {
      throw new Error(`Executor job ${job.job_id} does not belong to this PC node`);
    }
    res.json({ ok: true, job });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

executorRouter.post('/nodes/register', async (req: Request, res: Response) => {
  try {
    enforcePairedNode(req, req.body?.node_id);
    const auth = requestAuth(req);
    const paired = auth?.kind === 'paired' ? auth.pairing : null;
    const node = await registerExecutorNode({
      node_id: req.body?.node_id,
      name: req.body?.name,
      // Keep the original pairing project as node metadata. It no longer limits
      // which project jobs the machine may execute.
      workspace_id: paired?.workspace_id || req.body?.workspace_id,
      project_id: paired?.project_id || req.body?.project_id,
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
    enforcePairedNode(req, req.params.node_id);
    const node = await heartbeatExecutorNode(req.params.node_id);
    res.json({ ok: true, node });
  } catch (err: any) {
    res.status(404).json({ ok: false, error: err.message });
  }
});

executorRouter.post('/jobs', async (req: Request, res: Response) => {
  try {
    requireController(req);
    const payload = await projectScopedPayload(req.body?.workspace_id, req.body?.project_id, req.body?.payload);
    const job = await createExecutorJob({
      workspace_id: req.body?.workspace_id,
      project_id: req.body?.project_id,
      node_id: req.body?.node_id,
      task_id: req.body?.task_id,
      action: req.body?.action,
      payload,
      created_by: req.body?.created_by || (req as any).auth?.agentName || 'bridge',
    });
    res.status(201).json({ ok: true, job });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

executorRouter.post('/jobs/claim', async (req: Request, res: Response) => {
  try {
    enforcePairedNode(req, req.body?.node_id);
    const job = await claimExecutorJob({
      node_id: req.body?.node_id,
      // Accepted for backward-compatible clients; routing is machine-scoped.
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
    enforcePairedNode(req, req.body?.node_id);
    const job = await completeExecutorJob({
      node_id: req.body?.node_id,
      job_id: req.params.job_id,
      ok: req.body?.ok === true,
      result: req.body?.result,
      error: req.body?.error,
    });
    enforcePairedNode(req, job.node_id || undefined);
    res.json({ ok: true, job });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

executorRouter.post('/jobs/:job_id/cancel', async (req: Request, res: Response) => {
  try {
    requireController(req);
    const job = await cancelExecutorJob(req.params.job_id);
    res.json({ ok: true, job });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});