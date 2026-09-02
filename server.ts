import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './server/routes.js';
import { initDatabase } from './server/db.js';
import { handleMcpRequest } from './server/mcp.js';
import { startGeminiWorker, getGeminiWorkerConfig } from './server/geminiWorker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize SQLite database
  await initDatabase();

  // Optionally start background Gemini worker if enabled in environment
  const workerConfig = getGeminiWorkerConfig();
  if (workerConfig.enabled && process.env.GEMINI_API_KEY) {
    startGeminiWorker();
  } else {
    console.log('[Bridge] Gemini autonomous background worker is idle (GEMINI_WORKER_ENABLED=false or GEMINI_API_KEY not set)');
  }

  // Middleware
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-bridge-token', 'x-mcp-token', 'x-agent-name'],
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Root MCP endpoints (Streamable HTTP MCP Protocol)
  app.all('/mcp', handleMcpRequest);

  // Health check endpoints (/health and /api/health)
  const healthHandler = async (req: express.Request, res: express.Response) => {
    try {
      const { getProject } = await import('./server/db.js');
      const project = await getProject();
      res.json({
        status: 'ok',
        server: 'healthy',
        database: 'connected (SQLite WAL & Memory-Disk Persistence)',
        project: project.project_name,
        mcp: 'ready (Streamable HTTP)',
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
      });
    }
  };

  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  // REST API router
  app.use('/api', apiRouter);

  // Vite middleware in development vs Static files in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: 3000 },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[Server] Vite middleware mounted in development mode');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('[Server] Serving production build from', distPath);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Bridge Server] Running on http://0.0.0.0:${PORT}`);
    console.log(`[Bridge MCP] Streamable HTTP endpoint: http://0.0.0.0:${PORT}/mcp`);
  });
}

startServer().catch((err) => {
  console.error('[Server Fatal Error]', err);
  process.exit(1);
});
