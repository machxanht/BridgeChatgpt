import { Router, Request, Response } from 'express';
import { getTask, getTasks } from './db.js';
import type { Task } from '../src/types.js';

export type ReviewArtifact = {
  path: string;
  operation: 'create' | 'update' | 'delete';
  content?: string;
  base_sha?: string | null;
};

export type ReviewPacket = {
  task_id: string;
  title: string;
  priority: string;
  executor: string;
  summary: string;
  tests: unknown;
  files_changed: string[];
  artifacts: ReviewArtifact[];
  submitted_at: string;
};

const MAX_PACKET_BYTES = 2 * 1024 * 1024;
const SAFE_TASK_ID = /^TASK-\d+$/;

export function parseReviewPacket(task: Task): ReviewPacket | null {
  if (task.status !== 'review' || !task.result || !SAFE_TASK_ID.test(task.id)) return null;

  let result: any;
  try { result = JSON.parse(task.result); }
  catch { return null; }

  if (!result || result.executor !== 'google-ai-studio' || typeof result.summary !== 'string') return null;
  if (!Array.isArray(result.artifacts) || !Array.isArray(result.files_changed)) return null;

  const packet: ReviewPacket = {
    task_id: task.id,
    title: task.title,
    priority: task.priority,
    executor: result.executor,
    summary: result.summary,
    tests: result.tests ?? null,
    files_changed: result.files_changed,
    artifacts: result.artifacts,
    submitted_at: typeof result.submitted_at === 'string' ? result.submitted_at : task.updated_at,
  };

  if (Buffer.byteLength(JSON.stringify(packet), 'utf8') > MAX_PACKET_BYTES) return null;
  return packet;
}

export const reviewPacketsRouter = Router();

reviewPacketsRouter.get('/review-packets', async (_req: Request, res: Response) => {
  try {
    const tasks = await getTasks({ status: 'review', limit: 100 });
    const packets = tasks.map(parseReviewPacket).filter((p): p is ReviewPacket => Boolean(p));
    res.json({ ok: true, packets });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

reviewPacketsRouter.get('/review-packets/:id', async (req: Request, res: Response) => {
  try {
    if (!SAFE_TASK_ID.test(req.params.id)) {
      res.status(400).json({ ok: false, error: 'invalid task id' });
      return;
    }
    const task = await getTask(req.params.id);
    if (!task) {
      res.status(404).json({ ok: false, error: 'task not found' });
      return;
    }
    const packet = parseReviewPacket(task);
    if (!packet) {
      res.status(409).json({ ok: false, error: 'task is not review-ready' });
      return;
    }
    res.json({ ok: true, packet });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});
