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
import { projectBrainRouter } from './server/projectBrainRoutes.js';
import { resourceRegistryRouter } from './server/resourceRoutes.js';
import { androidWakeRouter } from './server/androidWake.js';
import { executorRouter } from './server/executorRoutes.js';
import { handleExecutorMcpRequest } from './server/executorMcp.js';

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
    allowedHeaders: ['Content-Type', 'Authorization', 'x-bridge-token', 'x-mcp-token', 'x-agent-name', 'x-bridge-executor-token'],
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.all('/mcp', handleMcpRequest);
  app.all('/mcp-executor', handleExecutorMcpRequest);

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
        executor_mcp: 'ready (Streamable HTTP)',
        local_executor: 'ready',
        studio_relay: 'ready',
        review_packets: 'ready',
        batch_orchestrator: 'ready',
        project_brain: 'ready',
        resource_registry: 'ready',
        android_wake: 'ready',
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
        executor_mcp: 'degraded',
        local_executor: 'degraded',
        studio_relay: 'degraded',
        review_packets: 'degraded',
        batch_orchestrator: 'degraded',
        project_brain: 'degraded',
        resource_registry: 'degraded',
        android_wake: 'degraded',
        github_command_bus: 'degraded',
      });
    }
  };

  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  // Android companion pairing + read-only wake queue. Pair tokens are scoped,
  // signed, and never expose the main Bridge MCP token to the APK.
  app.use('/api/android-wake', androidWakeRouter);

  // Bridge Local Executor: project-scoped PC workers poll outbound for jobs.
  // Same-origin dashboard requests are allowed; remote workers use BRIDGE_EXECUTOR_TOKEN.
  app.use('/api/executors', executorRouter);

  // External Google AI Studio Build-mode relay. It never calls Gemini here;
  // it only exchanges task/state data with an authenticated Studio client.
  // The pairing guard resolves a single registered Studio session automatically
  // and blocks ambiguous multi-session claims unless agent_instance_id is explicit.
  app.use('/api/studio-relay', requireAuth, studioSessionPairingGuard, studioRelayRouter);

  // User-facing URL registry. A Git repo is the project anchor; AI Studio app URLs
  // and ChatGPT conversation URLs become stable routing targets without exposing
  // workspace/agent IDs in the normal dashboard flow.
  app.use('/api/resource-registry', requireAuth, resourceRegistryRouter);

  // Shared cross-session project memory. Thread/session scratch remains private;
  // this service carries durable goals, decisions, architecture, blockers and handoffs.
  app.use('/api/project-brain', requireAuth, projectBrainRouter);

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
    console.log(`[Bridge Executor MCP] Streamable HTTP endpoint: http://0.0.0.0:${PORT}/mcp-executor`);
    console.log('[Bridge Local Executor] REST endpoint: /api/executors');
    console.log(`[Bridge Studio Relay] REST endpoint: http://0.0.0.0:${PORT}/api/studio-relay`);
    console.log('[Bridge Android Wake] REST endpoint: /api/android-wake');
    console.log('[Bridge Resource Registry] REST endpoint: /api/resource-registry');
    console.log('[Bridge Project Brain] REST endpoint: /api/project-brain');
    console.log('[Bridge Review Packets] REST endpoint: /api/review-packets');
    console.log('[Bridge Batch] REST endpoint: /api/batches');
    console.log('[Bridge GitHub Bus] Inbox: bridge-bus/inbox');
  });
}

startServer().catch((err) => {
  console.error('[Server Fatal Error]', err);
  process.exit(1);
});
