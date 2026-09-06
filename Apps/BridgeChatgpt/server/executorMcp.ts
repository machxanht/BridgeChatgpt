import { Request, Response } from 'express';
import { verifyToken } from './auth.js';
import { projectScopedExecutorPayload } from './executorRouting.js';
import {
  cancelExecutorJob,
  createExecutorJob,
  getExecutorJob,
  getExecutorSnapshot,
} from './executorStore.js';

const EXECUTOR_MCP_TOOLS = [
  {
    name: 'executor_snapshot',
    description: 'List Bridge Local Executor PC nodes and recent jobs for an optional workspace/project.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string' },
        project_id: { type: 'string' },
        node_id: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'executor_job_create',
    description: 'Queue a safe project-scoped job for a connected Bridge Local Executor PC. Bridge forces cwd to the workspace project path and the PC enforces its own read/write/command permissions.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string' },
        project_id: { type: 'string' },
        node_id: { type: 'string', description: 'Optional exact PC node. Omit to let a compatible node claim the job.' },
        task_id: { type: 'string', description: 'Optional Bridge task ID associated with this executor job.' },
        action: {
          type: 'string',
          enum: ['fs.list', 'fs.read', 'fs.write', 'command.run', 'git.status', 'git.diff', 'npm.test', 'npm.build'],
        },
        payload: { type: 'object', description: 'Action payload. Any caller-supplied cwd is replaced by the registered workspace cwd.' },
      },
      required: ['workspace_id', 'project_id', 'action'],
    },
  },
  {
    name: 'executor_job_get',
    description: 'Get the current state/result of one Bridge Local Executor job.',
    inputSchema: {
      type: 'object',
      properties: { job_id: { type: 'string' } },
      required: ['job_id'],
    },
  },
  {
    name: 'executor_job_cancel',
    description: 'Cancel a pending/running Bridge Local Executor job.',
    inputSchema: {
      type: 'object',
      properties: { job_id: { type: 'string' } },
      required: ['job_id'],
    },
  },
];

async function executeExecutorMcpTool(name: string, args: Record<string, any>) {
  switch (name) {
    case 'executor_snapshot':
      return await getExecutorSnapshot({
        workspace_id: args.workspace_id,
        project_id: args.project_id,
        node_id: args.node_id,
        limit: args.limit,
      });
    case 'executor_job_create': {
      const payload = await projectScopedExecutorPayload(args.workspace_id, args.project_id, args.payload);
      return await createExecutorJob({
        workspace_id: args.workspace_id,
        project_id: args.project_id,
        node_id: args.node_id,
        task_id: args.task_id,
        action: args.action,
        payload,
        created_by: 'mcp',
      });
    }
    case 'executor_job_get': {
      const job = await getExecutorJob(args.job_id);
      if (!job) throw new Error(`Executor job ${args.job_id} not found`);
      return job;
    }
    case 'executor_job_cancel':
      return await cancelExecutorJob(args.job_id);
    default:
      throw new Error(`Unknown executor tool: ${name}`);
  }
}

function executorTokenAllowed(req: Request) {
  const mainToken = String(process.env.BRIDGE_MCP_TOKEN || '').trim();
  const configured = String(process.env.BRIDGE_EXECUTOR_TOKEN || '').trim();
  if (mainToken && verifyToken(req)) return true;
  if (!mainToken && !configured) return true;
  if (!configured) return false;
  const explicit = req.headers['x-bridge-executor-token'];
  if (typeof explicit === 'string' && explicit === configured) return true;
  const [scheme, token] = String(req.headers.authorization || '').split(' ');
  return Boolean(token && (scheme === 'Bearer' || scheme === 'Token') && token === configured);
}

export async function handleExecutorMcpRequest(req: Request, res: Response) {
  if (!executorTokenAllowed(req)) {
    res.status(401).json({ jsonrpc: '2.0', id: req.body?.id ?? null, error: { code: -32001, message: 'Unauthorized executor MCP client' } });
    return;
  }

  if (req.method === 'GET') {
    const acceptHeader = req.headers.accept || '';
    if (acceptHeader.includes('text/event-stream')) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write(`event: endpoint\ndata: /mcp-executor\n\n`);
      return;
    }
    res.json({
      name: 'Bridge Local Executor MCP',
      protocolVersion: '2024-11-05',
      transport: 'Streamable HTTP',
      status: 'online',
      tools_available: EXECUTOR_MCP_TOOLS.length,
      endpoint: '/mcp-executor',
    });
    return;
  }

  const body = req.body;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Request body must be a JSON object' } });
    return;
  }
  const { id, method, params } = body;

  try {
    if (method === 'initialize') {
      res.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'Bridge Local Executor MCP', version: '0.1.0' },
          instructions: 'Use executor_snapshot to find an online PC. Queue work with executor_job_create, then poll executor_job_get for the result. Bridge enforces workspace cwd and the PC enforces approved-root isolation and local permissions.',
        },
      });
      return;
    }
    if (method === 'notifications/initialized' || method === 'initialized' || method === 'ping') {
      res.json({ jsonrpc: '2.0', id: id ?? null, result: {} });
      return;
    }
    if (method === 'tools/list') {
      res.json({ jsonrpc: '2.0', id, result: { tools: EXECUTOR_MCP_TOOLS } });
      return;
    }
    if (method === 'tools/call') {
      const toolName = params?.name;
      if (!toolName) {
        res.json({ jsonrpc: '2.0', id, error: { code: -32602, message: 'Missing params.name' } });
        return;
      }
      try {
        const result = await executeExecutorMcpTool(toolName, params?.arguments || {});
        res.json({
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: false },
        });
      } catch (error: any) {
        res.json({
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: `Error executing ${toolName}: ${error.message}` }], isError: true },
        });
      }
      return;
    }
    res.status(404).json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method ${method} not found` } });
  } catch (error: any) {
    res.status(500).json({ jsonrpc: '2.0', id: id ?? null, error: { code: -32603, message: error.message } });
  }
}
