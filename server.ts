import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './server/routes.js';
import { initDatabase } from './server/db.js';
import { handleMcpRequest } from './server/mcp.js';
import { startGeminiWorker, getGeminiWorkerConfig } from './server/geminiWorker.js';
import { requireAuth } from './server/auth.js';
import { studioRelayRouter } from './server/studioRelay.js';
import { studioSessionPairingGuard } from './server/studioSessionPairingGuard.js';
import { reviewPacketsRouter } from './server/reviewPackets.js';
import { startGitHubCommandBus } from './server/githubCommandBus.js';
import { batchRouter } from './server/batchRoutes.js';
import { startBatchOrchestrator } from './server/batchOrchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  await initDatabase();
  startGitHubCommandBus();
  startBatchOrchestrator();

  const workerConfig = getGeminiWorkerConfig();
  if (workerConfig.enabled && process.env.GEMINI_API_KEY) {
    startGeminiWorker();
  } else {
    console.log('[Bridge] Gemini API worker idle. External AI Studio relay can still be used.');
  }

  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-bridge-token', 'x-mcp-token', 'x-agent-name'],
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.all('/mcp', handleMcpRequest);

  const healthHandler = async (_req: express.Request, res: express.Response) => {
    try {
      const { getProject } = await import('./server/db.js');
      const project = await getProject();
      res.json({
        status: 'ok',
        server: 'healthy',
        database: 'connected (sql.js persisted to disk)',
        project: project.project_name,
        mcp: 'ready (Streamable HTTP)',
        studio_relay: 'ready',
        review_packets: 'ready',
        batch_orchestrator: 'ready',
        github_command_bus: process.env.GITHUB_COMMAND_BUS_ENABLED === 'false' ? 'disabled' : 'ready',
        service: 'Bridge — Shared AI Workspace',
        time: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({
        status: 'error',
        server: 'healthy',
        database: `error: ${err.message}`,
        project: 'unknown',
        mcp: 'degraded',
        studio_relay: 'degraded',
        review_packets: 'degraded',
        batch_orchestrator: 'degraded',
        github_command_bus: 'degraded',
      });
    }
  };

  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  // External Google AI Studio Build-mode relay. It never calls Gemini itself;
  // it only exchanges task/state data with an authenticated Studio client.
  // The pairing guard resolves a single registered Studio session automatically
  // and blocks ambiguous multi-session claims unless agent_instance_id is explicit.
  app.use('/api/studio-relay', requireAuth, studioSessionPairingGuard, studioRelayRouter);

  // Batch/epic orchestration: DAG scheduling, leases, retry/review limits and dashboard.
  app.use('/api/batches', requireAuth, batchRouter);

  // Review-ready Studio results, including full conflict-safe artifacts.
  app.use('/api', requireAuth, reviewPacketsRouter);
  app.use('/api', apiRouter);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: PORT },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[Server] Vite middleware mounted in development mode');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('[Server] Serving production build from', distPath);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Bridge Server] Running on http://0.0.0.0:${PORT}`);
    console.log(`[Bridge MCP] Streamable HTTP endpoint: http://0.0.0.0:${PORT}/mcp`);
    console.log(`[Bridge Studio Relay] REST endpoint: http://0.0.0.0:${PORT}/api/studio-relay`);
    console.log('[Bridge Review Packets] REST endpoint: /api/review-packets');
    console.log('[Bridge Batch] REST endpoint: /api/batches');
    console.log('[Bridge GitHub Bus] Inbox: bridge-bus/inbox');
  });
}

startServer().catch((err) => {
  console.error('[Server Fatal Error]', err);
  process.exit(1);
});
