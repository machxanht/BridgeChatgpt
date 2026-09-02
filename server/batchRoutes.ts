import { Router, Request, Response } from 'express';
import {
  cancelBatch,
  createBatch,
  getBatch,
  getBatchDashboard,
  listBatches,
  pauseBatch,
  resumeBatch,
  startBatch,
  tickBatch,
} from './batchOrchestrator.js';

export const batchRouter = Router();

batchRouter.get('/', async (_req: Request, res: Response) => {
  try {
    res.json(await listBatches());
  } catch (error: any) {
    res.status(500).json({ error: error?.message || String(error) });
  }
});

batchRouter.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    res.json(await getBatchDashboard());
  } catch (error: any) {
    res.status(500).json({ error: error?.message || String(error) });
  }
});

batchRouter.post('/', async (req: Request, res: Response) => {
  try {
    const batch = await createBatch({
      title: req.body.title,
      goal: req.body.goal,
      tasks: req.body.tasks,
      limits: req.body.limits,
      created_by: req.body.created_by === 'human' ? 'human' : 'chatgpt',
    });
    const result = req.body.auto_start === false ? batch : await startBatch(batch.id);
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error?.message || String(error) });
  }
});

batchRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const batch = await getBatch(req.params.id);
    if (!batch) {
      res.status(404).json({ error: `Batch ${req.params.id} not found.` });
      return;
    }
    res.json(batch);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || String(error) });
  }
});

batchRouter.post('/:id/start', async (req: Request, res: Response) => {
  try {
    res.json(await startBatch(req.params.id));
  } catch (error: any) {
    res.status(400).json({ error: error?.message || String(error) });
  }
});

batchRouter.post('/:id/pause', async (req: Request, res: Response) => {
  try {
    res.json(await pauseBatch(req.params.id, req.body?.reason || 'Paused by operator.'));
  } catch (error: any) {
    res.status(400).json({ error: error?.message || String(error) });
  }
});

batchRouter.post('/:id/resume', async (req: Request, res: Response) => {
  try {
    res.json(await resumeBatch(req.params.id));
  } catch (error: any) {
    res.status(400).json({ error: error?.message || String(error) });
  }
});

batchRouter.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    res.json(await cancelBatch(req.params.id));
  } catch (error: any) {
    res.status(400).json({ error: error?.message || String(error) });
  }
});

batchRouter.post('/:id/tick', async (req: Request, res: Response) => {
  try {
    res.json(await tickBatch(req.params.id));
  } catch (error: any) {
    res.status(400).json({ error: error?.message || String(error) });
  }
});
