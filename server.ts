import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './server/routes.js';
import { initDatabase } from './server/db.js';
import { handleMcpRequest } from './server/mcp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize SQLite database
  await initDatabase();

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

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'Bridge — Shared AI Workspace',
      mcp_transport: 'Streamable HTTP',
      time: new Date().toISOString(),
    });
  });

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
