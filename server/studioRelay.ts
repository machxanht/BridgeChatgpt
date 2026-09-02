import { Router, Request, Response } from 'express';
import {
  claimNextTask,
  createMessage,
  getTask,
  getWorkflowStateForAgent,
  recordHeartbeat,
  setAgentStatus,
  updateTask,
} from './db.js';

/** REST relay for Google AI Studio Build mode. Bridge never calls Gemini here. */
export const studioRelayRouter = Router();

type ChangedFileArtifact = {
  path: string;
  operation?: 'create' | 'update' | 'delete';
  content?: string;
};

const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024;

function normalizeArtifacts(value: unknown): ChangedFileArtifact[] {
  if (!Array.isArray(value)) return [];
  return value.map((item: any) => ({
    path: String(item?.path || '').trim(),
    operation: item?.operation || 'update',
    content: typeof item?.content === 'string' ? item.content : undefined,
  })).filter(item => item.path && !item.path.startsWith('/') && !item.path.includes('..'));
}

studioRelayRouter.get('/state', async (_req: Request, res: Response) => {
  try {
    const state = await getWorkflowStateForAgent('gemini');
    res.json({ ok: true, executor: 'google-ai-studio', result_contract: {
      review_requires_artifacts: true,
      artifact_format: { path: 'relative/path', operation: 'create|update|delete', content: 'full UTF-8 content; omit only for delete' },
      max_payload_bytes: MAX_ARTIFACT_BYTES,
    }, ...state });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

studioRelayRouter.post('/heartbeat', async (req: Request, res: Response) => {
  try {
    const heartbeat = await recordHeartbeat({ agent: 'gemini', task_id: req.body?.task_id ?? null, status: req.body?.status || 'idle', message: req.body?.message || 'Google AI Studio relay active' });
    res.json({ ok: true, heartbeat });
  } catch (err: any) { res.status(400).json({ ok: false, error: err.message }); }
});

studioRelayRouter.post('/claim', async (_req: Request, res: Response) => {
  try {
    await recordHeartbeat({ agent: 'gemini', status: 'idle', message: 'Google AI Studio checking for work' });
    const claim = await claimNextTask('gemini');
    res.json({ ok: true, result_contract: {
      review_requires_artifacts: true,
      instruction: 'When submitting, include artifacts with full UTF-8 contents for every created/updated text file. Git push is not required.'
    }, ...claim });
  } catch (err: any) { res.status(400).json({ ok: false, error: err.message }); }
});

studioRelayRouter.post('/progress', async (req: Request, res: Response) => {
  try {
    const { task_id, stage, message } = req.body || {};
    if (!task_id) { res.status(400).json({ ok: false, error: 'task_id is required' }); return; }
    const task = await getTask(task_id);
    if (!task) { res.status(404).json({ ok: false, error: `Task ${task_id} not found` }); return; }
    const allowedStages = new Set(['inspecting', 'editing', 'testing', 'submitting', 'working', 'blocked']);
    const normalizedStage = allowedStages.has(stage) ? stage : 'working';
    const status = normalizedStage === 'blocked' ? 'blocked' : 'working';
    const agentStatus = await setAgentStatus({ agent: 'gemini', status, current_task_id: task_id, message: message || `AI Studio stage: ${normalizedStage}` });
    res.json({ ok: true, task_id, stage: normalizedStage, agent_status: agentStatus });
  } catch (err: any) { res.status(400).json({ ok: false, error: err.message }); }
});

studioRelayRouter.post('/result', async (req: Request, res: Response) => {
  try {
    const { task_id, summary, tests, files_changed, artifacts: rawArtifacts, blocked } = req.body || {};
    if (!task_id || !summary) { res.status(400).json({ ok: false, error: 'task_id and summary are required' }); return; }
    const task = await getTask(task_id);
    if (!task) { res.status(404).json({ ok: false, error: `Task ${task_id} not found` }); return; }

    const artifacts = normalizeArtifacts(rawArtifacts);
    if (!blocked && artifacts.length === 0) {
      res.status(400).json({ ok: false, error: 'artifacts are required before a task can enter review; include full changed-file contents. Git push is not required.' });
      return;
    }
    for (const artifact of artifacts) {
      if (artifact.operation !== 'delete' && artifact.content === undefined) {
        res.status(400).json({ ok: false, error: `artifact ${artifact.path} requires full content` }); return;
      }
    }

    const resultObject = { executor: 'google-ai-studio', summary, tests: tests ?? null, files_changed: Array.isArray(files_changed) ? files_changed : artifacts.map(a => a.path), artifacts, submitted_at: new Date().toISOString() };
    const resultPayload = JSON.stringify(resultObject, null, 2);
    if (Buffer.byteLength(resultPayload, 'utf8') > MAX_ARTIFACT_BYTES) {
      res.status(413).json({ ok: false, error: `result payload exceeds ${MAX_ARTIFACT_BYTES} bytes` }); return;
    }

    const updated = await updateTask(task_id, { status: blocked ? 'blocked' : 'review', result: resultPayload }, 'gemini');
    await setAgentStatus({ agent: 'gemini', status: blocked ? 'blocked' : 'idle', current_task_id: blocked ? task_id : null, message: blocked ? `AI Studio blocked on ${task_id}` : `AI Studio submitted reviewable artifacts for ${task_id}` });
    await createMessage({ from: 'gemini', to: 'chatgpt', type: 'review_request', content: blocked ? `AI Studio blocked on ${task_id}` : `${task_id} has reviewable changed-file artifacts; Git push is not required.`, task_id, finding_id: null });
    res.json({ ok: true, task: updated, artifact_count: artifacts.length });
  } catch (err: any) { res.status(400).json({ ok: false, error: err.message }); }
});

studioRelayRouter.post('/message', async (req: Request, res: Response) => {
  try {
    const { content, task_id, finding_id, type } = req.body || {};
    if (!content) { res.status(400).json({ ok: false, error: 'content is required' }); return; }
    const message = await createMessage({ from: 'gemini', to: 'chatgpt', type: type || 'handoff', content, task_id: task_id || null, finding_id: finding_id || null });
    res.status(201).json({ ok: true, message });
  } catch (err: any) { res.status(400).json({ ok: false, error: err.message }); }
});
