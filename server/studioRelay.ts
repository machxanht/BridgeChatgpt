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

/**
 * REST relay for Google AI Studio Build mode.
 *
 * This deliberately does NOT call the Gemini API. An external Studio session/app
 * can use these endpoints to exchange work with Bridge while Bridge remains the
 * source of truth for tasks, progress and review state.
 *
 * Authentication is inherited from apiRouter's requireAuth middleware.
 */
export const studioRelayRouter = Router();

studioRelayRouter.get('/state', async (_req: Request, res: Response) => {
  try {
    const state = await getWorkflowStateForAgent('gemini');
    res.json({ ok: true, executor: 'google-ai-studio', ...state });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

studioRelayRouter.post('/heartbeat', async (req: Request, res: Response) => {
  try {
    const heartbeat = await recordHeartbeat({
      agent: 'gemini',
      task_id: req.body?.task_id ?? null,
      status: req.body?.status || 'idle',
      message: req.body?.message || 'Google AI Studio relay active',
    });
    res.json({ ok: true, heartbeat });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

studioRelayRouter.post('/claim', async (_req: Request, res: Response) => {
  try {
    await recordHeartbeat({ agent: 'gemini', status: 'idle', message: 'Google AI Studio checking for work' });
    const claim = await claimNextTask('gemini');
    res.json({ ok: true, ...claim });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

studioRelayRouter.post('/progress', async (req: Request, res: Response) => {
  try {
    const { task_id, stage, message } = req.body || {};
    if (!task_id) {
      res.status(400).json({ ok: false, error: 'task_id is required' });
      return;
    }

    const task = await getTask(task_id);
    if (!task) {
      res.status(404).json({ ok: false, error: `Task ${task_id} not found` });
      return;
    }

    const allowedStages = new Set(['inspecting', 'editing', 'testing', 'submitting', 'working', 'blocked']);
    const normalizedStage = allowedStages.has(stage) ? stage : 'working';
    const status = normalizedStage === 'blocked' ? 'blocked' : 'working';

    const agentStatus = await setAgentStatus({
      agent: 'gemini',
      status,
      current_task_id: task_id,
      message: message || `AI Studio stage: ${normalizedStage}`,
    });

    res.json({ ok: true, task_id, stage: normalizedStage, agent_status: agentStatus });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

studioRelayRouter.post('/result', async (req: Request, res: Response) => {
  try {
    const { task_id, summary, tests, files_changed, blocked } = req.body || {};
    if (!task_id || !summary) {
      res.status(400).json({ ok: false, error: 'task_id and summary are required' });
      return;
    }

    const task = await getTask(task_id);
    if (!task) {
      res.status(404).json({ ok: false, error: `Task ${task_id} not found` });
      return;
    }

    const resultPayload = JSON.stringify({
      executor: 'google-ai-studio',
      summary,
      tests: tests ?? null,
      files_changed: Array.isArray(files_changed) ? files_changed : [],
      submitted_at: new Date().toISOString(),
    }, null, 2);

    const updated = await updateTask(
      task_id,
      {
        status: blocked ? 'blocked' : 'review',
        result: resultPayload,
      },
      'gemini'
    );

    await setAgentStatus({
      agent: 'gemini',
      status: blocked ? 'blocked' : 'idle',
      current_task_id: blocked ? task_id : null,
      message: blocked ? `AI Studio blocked on ${task_id}` : `AI Studio submitted ${task_id} for ChatGPT review`,
    });

    res.json({ ok: true, task: updated });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

studioRelayRouter.post('/message', async (req: Request, res: Response) => {
  try {
    const { content, task_id, finding_id, type } = req.body || {};
    if (!content) {
      res.status(400).json({ ok: false, error: 'content is required' });
      return;
    }

    const message = await createMessage({
      from: 'gemini',
      to: 'chatgpt',
      type: type || 'handoff',
      content,
      task_id: task_id || null,
      finding_id: finding_id || null,
    });

    res.status(201).json({ ok: true, message });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});
