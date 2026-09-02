import { Request, Response } from 'express';
import {
  claimNextTask,
  createFinding,
  createMessage,
  createTask,
  getActivities,
  getAgentStatuses,
  getFinding,
  getFindings,
  getMessages,
  getProject,
  getTask,
  getTasks,
  getWorkflowStateForAgent,
  getWorkspaceState,
  recordHeartbeat,
  reviewTask,
  setAgentStatus,
  updateFinding,
  updateTask,
} from './db.js';
import {
  toolProjectCreateFile,
  toolProjectDeleteFile,
  toolProjectGitDiff,
  toolProjectGitLog,
  toolProjectGitStatus,
  toolProjectInfo,
  toolProjectListFiles,
  toolProjectPatchFile,
  toolProjectReadFile,
  toolProjectSearch,
  toolProjectTest,
  toolProjectWriteFile,
} from './projectTools.js';
import { MCPToolDefinition } from '../src/types.js';

// All Bridge MCP Tools
export const BRIDGE_TOOLS: MCPToolDefinition[] = [
  // --- Workflow & State Tools ---
  {
    name: 'workflow_state',
    description: 'Get lightweight workflow state and immediate recommended next action for the querying agent (claim_task, continue_task, review_task, or standby).',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', enum: ['gemini', 'chatgpt', 'human'], description: 'Agent querying workflow (default: caller or gemini)' },
      },
    },
  },
  {
    name: 'workspace_state',
    description: 'Get the complete unified workspace state snapshot: project details, active tasks, open findings, agent statuses, and recent activity.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // --- Project Inspection Tools ---
  {
    name: 'project_info',
    description: 'Get project metadata, configured root, GitHub repo, default branch, test command, and workspace statistics.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'project_list_files',
    description: 'List files and directories within the sandboxed project repository.',
    inputSchema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Relative directory path from project root (defaults to ".")' },
        recursive: { type: 'boolean', description: 'Whether to list subdirectories recursively (default: true)' },
        max_depth: { type: 'number', description: 'Max depth of directory traversal (default: 8)' },
      },
    },
  },
  {
    name: 'project_read_file',
    description: 'Safely read the text content of a file in the project with optional line ranges. Path traversal is strictly blocked.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Relative path to the file in the project' },
        start_line: { type: 'number', description: 'Optional 1-based start line number' },
        end_line: { type: 'number', description: 'Optional 1-based end line number' },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'project_search',
    description: 'Search for text or regular expressions across project source code, excluding secrets and binaries.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text string or regex pattern to search for' },
        is_regex: { type: 'boolean', description: 'Whether query is a regex pattern (default: false)' },
        file_extension: { type: 'string', description: 'Optional filter by extension (e.g. ".ts", ".tsx")' },
        max_results: { type: 'number', description: 'Maximum matches to return (default: 40)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'project_git_status',
    description: 'Get current Git working tree status (branch, modified, staged, and untracked files).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'project_git_diff',
    description: 'Inspect the git diff of unstaged or staged changes, or compare specific files/commits.',
    inputSchema: {
      type: 'object',
      properties: {
        staged: { type: 'boolean', description: 'Whether to view staged changes (--staged)' },
        file_path: { type: 'string', description: 'Optional specific file path to diff' },
        commit: { type: 'string', description: 'Optional commit or branch ref to diff against' },
      },
    },
  },
  {
    name: 'project_git_log',
    description: 'View recent Git commit log entries in the project.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of recent commits to fetch (default: 15)' },
        file_path: { type: 'string', description: 'Optional filter by file path' },
      },
    },
  },
  {
    name: 'project_test',
    description: 'Execute allowlisted project test/lint/build commands inside the sandboxed workspace and report stdout/stderr/exit code.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Test command to run (defaults to project configured test command)' },
        timeout_ms: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
      },
    },
  },

  // --- Safe Project Modification Tools (Gemini/Executor) ---
  {
    name: 'project_write_file',
    description: 'Safely write or overwrite text content to a project file within the sandbox.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Relative path to file in project' },
        content: { type: 'string', description: 'Full text content to write' },
        create_if_missing: { type: 'boolean', description: 'Whether to create file if it does not exist (default: true)' },
      },
      required: ['file_path', 'content'],
    },
  },
  {
    name: 'project_patch_file',
    description: 'Safely replace an exact unique target block of text within a project file.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Relative path to file' },
        target_content: { type: 'string', description: 'Exact string to be replaced (must match uniquely)' },
        replacement_content: { type: 'string', description: 'Replacement string' },
      },
      required: ['file_path', 'target_content', 'replacement_content'],
    },
  },
  {
    name: 'project_create_file',
    description: 'Create a new file in the project repository.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Relative path to new file' },
        content: { type: 'string', description: 'Initial file content (default empty)' },
        overwrite: { type: 'boolean', description: 'Whether to overwrite if already exists (default false)' },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'project_delete_file',
    description: 'Safely delete a non-critical file within the project sandbox.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Relative path to file to delete' },
      },
      required: ['file_path'],
    },
  },

  // --- Collaboration & Task Lifecycle Tools ---
  {
    name: 'task_create',
    description: 'Create a new collaboration task in the shared workspace, assigned to Gemini (or ChatGPT/Human).',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short descriptive title of the task' },
        description: { type: 'string', description: 'Detailed instructions, context, acceptance criteria, and guidance' },
        priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'], description: 'Priority level (default: medium)' },
        assignee: { type: 'string', enum: ['gemini', 'chatgpt', 'human'], description: 'Agent assigned to execute (default: gemini)' },
        related_files: { type: 'array', items: { type: 'string' }, description: 'List of relevant file paths' },
        related_finding: { type: 'string', description: 'Optional ID of associated finding (e.g. BUG-1)' },
        created_by: { type: 'string', enum: ['chatgpt', 'gemini', 'human'], description: 'Agent creating the task (default: chatgpt)' },
      },
      required: ['title', 'description'],
    },
  },
  {
    name: 'task_claim_next',
    description: 'Atomically claim the highest priority eligible pending/assigned task for Gemini (or specified agent) and transition status to working.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', enum: ['gemini', 'chatgpt', 'human'], description: 'Agent claiming the task (default: gemini)' },
      },
    },
  },
  {
    name: 'task_list',
    description: 'List tasks from the shared workspace with optional filters.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'assigned', 'working', 'blocked', 'review', 'completed', 'cancelled'] },
        assignee: { type: 'string', enum: ['gemini', 'chatgpt', 'human'] },
        priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'] },
        limit: { type: 'number', description: 'Max tasks to return (default: 50)' },
      },
    },
  },
  {
    name: 'task_get',
    description: 'Get full details of a specific task including description, related files, and execution result.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task ID (e.g. TASK-1)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'task_update',
    description: 'Update the status, execution result, or assignee of a task (e.g. Gemini marking as working or review with result).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task ID (e.g. TASK-1)' },
        status: { type: 'string', enum: ['pending', 'assigned', 'working', 'blocked', 'review', 'completed', 'cancelled'] },
        result: { type: 'string', description: 'Detailed result report from the execution agent (files changed, tests run, notes)' },
        assignee: { type: 'string', enum: ['gemini', 'chatgpt', 'human'] },
        priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'] },
        description: { type: 'string', description: 'Updated instructions or criteria' },
      },
      required: ['id'],
    },
  },
  {
    name: 'task_review',
    description: 'Submit explicit review decision for a task in "review" status (approve -> completed, or request_changes -> dispatched back to Gemini).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task ID (e.g. TASK-1)' },
        decision: { type: 'string', enum: ['approve', 'request_changes'], description: 'Review outcome' },
        summary: { type: 'string', description: 'Review summary, feedback, or verification remarks' },
        tests_verified: { type: 'boolean', description: 'Whether tests and code diff were verified (default: true)' },
        reviewer: { type: 'string', enum: ['chatgpt', 'human'], description: 'Reviewer agent (default: chatgpt)' },
      },
      required: ['id', 'decision', 'summary'],
    },
  },
  {
    name: 'task_heartbeat',
    description: 'Record heartbeat and operational status for an active agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', enum: ['chatgpt', 'gemini', 'human'], description: 'Agent sending heartbeat' },
        task_id: { type: 'string', description: 'Active task ID' },
        status: { type: 'string', enum: ['idle', 'working', 'reviewing', 'blocked'], description: 'Operational status' },
        message: { type: 'string', description: 'Brief progress note' },
      },
      required: ['agent'],
    },
  },

  // --- Findings Tools ---
  {
    name: 'finding_create',
    description: 'Create a code review finding / bug report identified by ChatGPT (or Gemini/Human) with file location and severity.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short summary of the bug or architectural issue' },
        severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'], description: 'Severity of the issue' },
        description: { type: 'string', description: 'In-depth explanation of the flaw, reproduction steps, or suggested remedy' },
        file: { type: 'string', description: 'Path to the affected file' },
        line: { type: 'string', description: 'Line number or line range (e.g. "42" or "42-50")' },
        created_by: { type: 'string', enum: ['chatgpt', 'gemini', 'human'], description: 'Author of finding (default: chatgpt)' },
        assigned_to: { type: 'string', enum: ['gemini', 'chatgpt', 'human'], description: 'Agent assigned to resolve (default: gemini)' },
      },
      required: ['title', 'severity', 'description', 'file'],
    },
  },
  {
    name: 'finding_list',
    description: 'List code review findings and bugs with optional status/severity filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'assigned', 'fixed', 'rejected', 'verified'] },
        severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
        assigned_to: { type: 'string', enum: ['gemini', 'chatgpt', 'human'] },
        limit: { type: 'number', description: 'Max items to return' },
      },
    },
  },
  {
    name: 'finding_get',
    description: 'Get full details of a specific code finding.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Finding ID (e.g. BUG-1)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'finding_update',
    description: 'Update the status, resolution, severity, or assigned agent of an identified finding.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Finding ID (e.g. BUG-1)' },
        status: { type: 'string', enum: ['open', 'assigned', 'fixed', 'rejected', 'verified'], description: 'New status' },
        resolution: { type: 'string', description: 'Explanation of resolution or validation outcome' },
        assigned_to: { type: 'string', enum: ['gemini', 'chatgpt', 'human'], description: 'Reassign finding' },
        severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
        title: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['id'],
    },
  },

  // --- Messages & Activity Tools ---
  {
    name: 'message_send',
    description: 'Send a structured agent-to-agent communication message (handoff, question, review request, result summary).',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', enum: ['chatgpt', 'gemini', 'human'], description: 'Sender agent' },
        to: { type: 'string', enum: ['chatgpt', 'gemini', 'human', 'all'], description: 'Recipient agent (default: all)' },
        type: {
          type: 'string',
          enum: [
            'task',
            'finding',
            'review',
            'status',
            'question',
            'result',
            'handoff',
            'task_created',
            'task_claimed',
            'review_requested',
            'review_approved',
            'review_changes_requested',
            'task_blocked',
          ],
        },
        content: { type: 'string', description: 'Message body' },
        task_id: { type: 'string', description: 'Optional associated task ID' },
        finding_id: { type: 'string', description: 'Optional associated finding ID' },
      },
      required: ['from', 'type', 'content'],
    },
  },
  {
    name: 'message_list',
    description: 'List recent structured messages between agents.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Filter by task ID' },
        finding_id: { type: 'string', description: 'Filter by finding ID' },
        limit: { type: 'number', description: 'Number of messages to retrieve (default: 30)' },
      },
    },
  },
  {
    name: 'agent_status',
    description: 'Query or update operational status of agents (chatgpt, gemini, human).',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', enum: ['chatgpt', 'gemini', 'human'], description: 'Agent name' },
        status: { type: 'string', enum: ['idle', 'reviewing', 'working', 'blocked', 'offline'], description: 'New status (if updating)' },
        current_task_id: { type: 'string', description: 'Current task being processed' },
        message: { type: 'string', description: 'Optional status note' },
      },
    },
  },
  {
    name: 'activity_list',
    description: 'Retrieve the audit log of recent collaboration actions and tool executions.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max events to return (default: 30)' },
      },
    },
  },
];

// Tool execution router
export async function executeTool(name: string, args: Record<string, any> = {}, callerAgent?: string): Promise<any> {
  const agent = (callerAgent || 'chatgpt') as any;

  switch (name) {
    // Workflow Tools
    case 'workflow_state':
      return await getWorkflowStateForAgent(args.agent || agent);

    case 'workspace_state':
      return await getWorkspaceState();

    // Project Tools
    case 'project_info':
      return await toolProjectInfo();

    case 'project_list_files':
      return await toolProjectListFiles(args);

    case 'project_read_file':
      return await toolProjectReadFile({
        file_path: args.file_path,
        start_line: args.start_line,
        end_line: args.end_line,
      });

    case 'project_search':
      return await toolProjectSearch({
        query: args.query,
        is_regex: args.is_regex,
        file_extension: args.file_extension,
        max_results: args.max_results,
      });

    case 'project_git_status':
      return await toolProjectGitStatus();

    case 'project_git_diff':
      return await toolProjectGitDiff(args);

    case 'project_git_log':
      return await toolProjectGitLog(args);

    case 'project_test':
      return await toolProjectTest({
        command: args.command,
        timeout_ms: args.timeout_ms,
        agent,
      });

    case 'project_write_file':
      return await toolProjectWriteFile(
        {
          file_path: args.file_path,
          content: args.content,
          create_if_missing: args.create_if_missing,
        },
        agent
      );

    case 'project_patch_file':
      return await toolProjectPatchFile(
        {
          file_path: args.file_path,
          target_content: args.target_content,
          replacement_content: args.replacement_content,
        },
        agent
      );

    case 'project_create_file':
      return await toolProjectCreateFile(
        {
          file_path: args.file_path,
          content: args.content,
          overwrite: args.overwrite,
        },
        agent
      );

    case 'project_delete_file':
      return await toolProjectDeleteFile(
        {
          file_path: args.file_path,
        },
        agent
      );

    // Collaboration Tools
    case 'task_create':
      return await createTask({
        title: args.title,
        description: args.description,
        priority: args.priority,
        assignee: args.assignee,
        created_by: args.created_by || agent,
        related_files: args.related_files,
        related_finding: args.related_finding,
      });

    case 'task_claim_next':
      return await claimNextTask(args.agent || agent);

    case 'task_list':
      return await getTasks({
        status: args.status,
        assignee: args.assignee,
        priority: args.priority,
        limit: args.limit,
      });

    case 'task_get':
      return await getTask(args.id);

    case 'task_update':
      return await updateTask(
        args.id,
        {
          status: args.status,
          result: args.result,
          assignee: args.assignee,
          priority: args.priority,
          description: args.description,
        },
        agent
      );

    case 'task_review':
      return await reviewTask({
        id: args.id,
        decision: args.decision,
        summary: args.summary,
        tests_verified: args.tests_verified !== false,
        reviewer: args.reviewer || agent,
      });

    case 'task_heartbeat':
      return await recordHeartbeat({
        agent: args.agent || agent,
        task_id: args.task_id,
        status: args.status,
        message: args.message,
      });

    case 'finding_create':
      return await createFinding({
        title: args.title,
        severity: args.severity,
        description: args.description,
        file: args.file,
        line: args.line,
        created_by: args.created_by || agent,
        assigned_to: args.assigned_to,
      });

    case 'finding_list':
      return await getFindings({
        status: args.status,
        severity: args.severity,
        assigned_to: args.assigned_to,
        limit: args.limit,
      });

    case 'finding_get':
      return await getFinding(args.id);

    case 'finding_update':
      return await updateFinding(
        args.id,
        {
          status: args.status,
          resolution: args.resolution,
          assigned_to: args.assigned_to,
          severity: args.severity,
          title: args.title,
          description: args.description,
        },
        agent
      );

    case 'message_send':
      return await createMessage({
        from: args.from || agent,
        to: args.to,
        type: args.type,
        content: args.content,
        task_id: args.task_id,
        finding_id: args.finding_id,
      });

    case 'message_list':
      return await getMessages({
        task_id: args.task_id,
        finding_id: args.finding_id,
        limit: args.limit,
      });

    case 'agent_status':
      if (args.agent && args.status) {
        return await setAgentStatus({
          agent: args.agent,
          status: args.status,
          current_task_id: args.current_task_id,
          message: args.message,
        });
      }
      return await getAgentStatuses();

    case 'activity_list':
      return await getActivities(args.limit || 30);

    default:
      throw new Error(`Unknown tool "${name}". Supported tools: ${BRIDGE_TOOLS.map((t) => t.name).join(', ')}`);
  }
}


import { verifyToken } from './auth.js';

// Centralized authentication token verifier (re-exported for backward compatibility)
export const verifyAuthToken = verifyToken;

// Extract agent name from headers if provided
function extractCallerAgent(req: Request): string {
  const headerAgent = req.headers['x-agent-name'] as string;
  if (headerAgent && ['chatgpt', 'gemini', 'human'].includes(headerAgent.toLowerCase())) {
    return headerAgent.toLowerCase();
  }
  return 'chatgpt';
}

// Streamable HTTP JSON-RPC handler for MCP
export async function handleMcpRequest(req: Request, res: Response) {
  // Check auth
  if (!verifyAuthToken(req)) {
    res.status(401).json({
      jsonrpc: '2.0',
      id: req.body?.id ?? null,
      error: {
        code: -32001,
        message: 'Unauthorized: Invalid or missing BRIDGE_MCP_TOKEN. Provide header "Authorization: Bearer <token>" or query "?token=<token>".',
      },
    });
    return;
  }

  // Handle GET requests (SSE / Streamable handshake or metadata discovery)
  if (req.method === 'GET') {
    const acceptHeader = req.headers.accept || '';
    if (acceptHeader.includes('text/event-stream')) {
      // SSE connection
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write(`event: endpoint\ndata: ${req.baseUrl || ''}/mcp\n\n`);
      return;
    }

    // Standard GET status info
    const project = await getProject();
    res.json({
      name: 'Bridge MCP Server',
      protocolVersion: '2024-11-05',
      transport: 'Streamable HTTP',
      status: 'online',
      project: project.project_name,
      tools_available: BRIDGE_TOOLS.length,
      endpoints: {
        mcp: '/mcp',
        workspace: '/api/workspace',
      },
    });
    return;
  }

  const callerAgent = extractCallerAgent(req);
  const body = req.body;

  // Validate JSON-RPC structure
  if (!body || typeof body !== 'object') {
    res.status(400).json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error: Request body must be a JSON object' },
    });
    return;
  }

  const { jsonrpc, id, method, params } = body;

  try {
    // 1. MCP Initialization
    if (method === 'initialize') {
      res.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {
              listChanged: false,
            },
            resources: {
              subscribe: false,
              listChanged: false,
            },
            prompts: {
              listChanged: false,
            },
          },
          serverInfo: {
            name: 'Bridge Shared AI Workspace MCP Server',
            version: '1.0.0',
          },
          instructions:
            'Bridge provides shared project context and collaboration tools for ChatGPT (Reviewer) and Gemini (Coder). ' +
            'Use project_* tools to inspect code and git diffs. Use task_create/task_update to assign and complete tasks. ' +
            'Use finding_create to log code review findings. Use message_send for structured agent handoffs.',
        },
      });
      return;
    }

    // 2. Initialized Notification
    if (method === 'notifications/initialized' || method === 'initialized') {
      res.json({ jsonrpc: '2.0', id: id ?? null, result: {} });
      return;
    }

    // 3. Ping
    if (method === 'ping') {
      res.json({ jsonrpc: '2.0', id, result: {} });
      return;
    }

    // 4. List Tools
    if (method === 'tools/list') {
      res.json({
        jsonrpc: '2.0',
        id,
        result: {
          tools: BRIDGE_TOOLS,
        },
      });
      return;
    }

    // 5. Call Tool
    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};

      if (!toolName) {
        res.json({
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: 'Missing tool name in params.name' },
        });
        return;
      }

      try {
        const toolResult = await executeTool(toolName, toolArgs, callerAgent);
        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2),
              },
            ],
            isError: false,
          },
        });
      } catch (toolErr: any) {
        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `Error executing tool "${toolName}": ${toolErr.message}`,
              },
            ],
            isError: true,
          },
        });
      }
      return;
    }

    // 6. Resources List
    if (method === 'resources/list') {
      const project = await getProject();
      res.json({
        jsonrpc: '2.0',
        id,
        result: {
          resources: [
            {
              uri: 'bridge://workspace/state',
              name: 'Workspace State Snapshot',
              mimeType: 'application/json',
              description: 'Current tasks, open findings, agent statuses, and project goal.',
            },
            {
              uri: `bridge://project/${project.project_name}`,
              name: `Project Config (${project.project_name})`,
              mimeType: 'application/json',
              description: 'Active project settings and root path.',
            },
          ],
        },
      });
      return;
    }

    // 7. Resources Read
    if (method === 'resources/read') {
      const uri = params?.uri;
      if (uri === 'bridge://workspace/state') {
        const state = await getWorkspaceState();
        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(state, null, 2),
              },
            ],
          },
        });
        return;
      }
    }

    // Unknown method
    res.status(404).json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method "${method}" not found` },
    });
  } catch (err: any) {
    console.error('[MCP Error]', err);
    res.status(500).json({
      jsonrpc: '2.0',
      id: id ?? null,
      error: { code: -32603, message: `Internal server error: ${err.message}` },
    });
  }
}
