import { Router, Request, Response } from 'express';
import {
  claimNextTask,
  createFinding,
  createMessage,
  createTask,
  deleteTask,
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
  logActivity,
  recordHeartbeat,
  reviewTask,
  setAgentStatus,
  updateFinding,
  updateProject,
  updateTask,
} from './db.js';
import {
  BRIDGE_TOOLS,
  executeTool,
  handleMcpRequest,
  verifyAuthToken,
} from './mcp.js';
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
import { checkAndTriggerAutoReview } from './autoReview.js';
import { requireAuth } from './auth.js';
import {
  buildMissionControlData,
  cancelCurrentTask,
  pauseAllAgents,
  resumeAllAgents,
  stopSingleAgent,
} from './missionControl.js';

export const apiRouter = Router();

// ---------------- MCP ROUTE (Self-authenticating JSON-RPC) ----------------
apiRouter.all('/mcp', handleMcpRequest);

// ---------------- REST API AUTHENTICATION MIDDLEWARE ----------------
// Centralized protection for all privileged REST endpoints
apiRouter.use(requireAuth);

// ---------------- WORKSPACE & MISSION CONTROL SNAPSHOT ----------------
apiRouter.get('/workspace', async (req: Request, res: Response) => {
  try {
    const state = await getWorkspaceState();
    const missionControl = await buildMissionControlData();
    res.json({
      ...state,
      mission_control: missionControl,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/mission-control', async (req: Request, res: Response) => {
  try {
    const data = await buildMissionControlData();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- ORCHESTRATOR EMERGENCY CONTROLS ----------------
apiRouter.post('/orchestrator/pause-all', async (req: Request, res: Response) => {
  try {
    const result = await pauseAllAgents();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/orchestrator/resume', async (req: Request, res: Response) => {
  try {
    const result = await resumeAllAgents();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/orchestrator/stop-agent', async (req: Request, res: Response) => {
  try {
    const agent = req.body.agent || 'gemini';
    const result = await stopSingleAgent(agent);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/orchestrator/cancel-task', async (req: Request, res: Response) => {
  try {
    const taskId = req.body.taskId;
    const result = await cancelCurrentTask(taskId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/workflow', async (req: Request, res: Response) => {
  try {
    const agent = (req.query.agent as string) || 'gemini';
    const state = await getWorkflowStateForAgent(agent);
    res.json(state);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- PROJECT APIS ----------------
apiRouter.get('/project/info', async (req: Request, res: Response) => {
  try {
    const info = await toolProjectInfo();
    res.json(info);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.patch('/project', async (req: Request, res: Response) => {
  try {
    const updated = await updateProject(req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/project/files', async (req: Request, res: Response) => {
  try {
    const directory = req.query.directory as string;
    const recursive = req.query.recursive !== 'false';
    const files = await toolProjectListFiles({ directory, recursive });
    res.json(files);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/project/file', async (req: Request, res: Response) => {
  try {
    const filePath = req.query.path as string;
    const startLine = req.query.start ? parseInt(req.query.start as string, 10) : undefined;
    const endLine = req.query.end ? parseInt(req.query.end as string, 10) : undefined;

    if (!filePath) {
      res.status(400).json({ error: 'Missing path query parameter' });
      return;
    }

    const fileData = await toolProjectReadFile({ file_path: filePath, start_line: startLine, end_line: endLine });
    res.json(fileData);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/project/file', async (req: Request, res: Response) => {
  try {
    const { file_path, content, create_if_missing } = req.body;
    const result = await toolProjectWriteFile({ file_path, content, create_if_missing }, 'human');
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/project/search', async (req: Request, res: Response) => {
  try {
    const { query, is_regex, file_extension, max_results } = req.body;
    const result = await toolProjectSearch({ query, is_regex, file_extension, max_results });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.get('/project/git/status', async (req: Request, res: Response) => {
  try {
    const status = await toolProjectGitStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/project/git/diff', async (req: Request, res: Response) => {
  try {
    const staged = req.query.staged === 'true';
    const filePath = req.query.file as string;
    const commit = req.query.commit as string;
    const diff = await toolProjectGitDiff({ staged, file_path: filePath, commit });
    res.json(diff);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/project/git/log', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 15;
    const filePath = req.query.file as string;
    const log = await toolProjectGitLog({ limit, file_path: filePath });
    res.json(log);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/project/test', async (req: Request, res: Response) => {
  try {
    const { command, timeout_ms, agent } = req.body;
    const testResult = await toolProjectTest({ command, timeout_ms, agent: agent || 'human' });
    res.json(testResult);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- TASKS ----------------
apiRouter.get('/tasks', async (req: Request, res: Response) => {
  try {
    const { status, assignee, priority, limit } = req.query;
    const tasks = await getTasks({
      status: status as string,
      assignee: assignee as string,
      priority: priority as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json(tasks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/tasks', async (req: Request, res: Response) => {
  try {
    const task = await createTask(req.body);
    res.status(201).json(task);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/tasks/claim', async (req: Request, res: Response) => {
  try {
    const agent = req.body.agent || 'gemini';
    const claimed = await claimNextTask(agent);
    res.json(claimed);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/tasks/:id/review', async (req: Request, res: Response) => {
  try {
    const { decision, summary, tests_verified, reviewer } = req.body;
    const reviewResult = await reviewTask({
      id: req.params.id,
      decision,
      summary,
      tests_verified: tests_verified !== false,
      reviewer: reviewer || 'chatgpt',
    });
    res.json(reviewResult);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/tasks/:id/heartbeat', async (req: Request, res: Response) => {
  try {
    const { agent, status, message } = req.body;
    const heartbeat = await recordHeartbeat({
      agent: agent || 'gemini',
      task_id: req.params.id,
      status: status || 'working',
      message,
    });
    res.json(heartbeat);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.get('/tasks/:id', async (req: Request, res: Response) => {
  try {
    const task = await getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json(task);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.patch('/tasks/:id', async (req: Request, res: Response) => {
  try {
    const agent = (req.body.agent || 'gemini') as any;
    const task = await updateTask(req.params.id, req.body, agent);
    res.json(task);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.delete('/tasks/:id', async (req: Request, res: Response) => {
  try {
    await deleteTask(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- FINDINGS ----------------
apiRouter.get('/findings', async (req: Request, res: Response) => {
  try {
    const { status, severity, assigned_to, limit } = req.query;
    const findings = await getFindings({
      status: status as string,
      severity: severity as string,
      assigned_to: assigned_to as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json(findings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/findings', async (req: Request, res: Response) => {
  try {
    const finding = await createFinding(req.body);
    res.status(201).json(finding);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.get('/findings/:id', async (req: Request, res: Response) => {
  try {
    const finding = await getFinding(req.params.id);
    if (!finding) {
      res.status(404).json({ error: 'Finding not found' });
      return;
    }
    res.json(finding);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.patch('/findings/:id', async (req: Request, res: Response) => {
  try {
    const agent = (req.body.agent || 'chatgpt') as any;
    const finding = await updateFinding(req.params.id, req.body, agent);
    res.json(finding);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ---------------- MESSAGES ----------------
apiRouter.get('/messages', async (req: Request, res: Response) => {
  try {
    const { task_id, finding_id, from, to, limit } = req.query;
    const messages = await getMessages({
      task_id: task_id as string,
      finding_id: finding_id as string,
      from: from as string,
      to: to as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/messages', async (req: Request, res: Response) => {
  try {
    const message = await createMessage(req.body);
    res.status(201).json(message);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ---------------- AGENT STATUS ----------------
apiRouter.get('/agents', async (req: Request, res: Response) => {
  try {
    const statuses = await getAgentStatuses();
    res.json(statuses);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/agents/:agent/status', async (req: Request, res: Response) => {
  try {
    const agent = req.params.agent as 'chatgpt' | 'gemini' | 'human';
    const status = await setAgentStatus({
      agent,
      status: req.body.status,
      current_task_id: req.body.current_task_id,
      message: req.body.message,
    });
    res.json(status);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ---------------- ACTIVITY ----------------
apiRouter.get('/activity', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const activities = await getActivities(limit);
    res.json(activities);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- AUTO REVIEW ----------------
apiRouter.post('/auto-review/toggle', async (req: Request, res: Response) => {
  try {
    const project = await getProject();
    const updated = await updateProject({ auto_review: !project.auto_review });
    res.json({ auto_review: updated.auto_review });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/auto-review/cycle', async (req: Request, res: Response) => {
  try {
    const result = await checkAndTriggerAutoReview();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- HUMAN COMMAND BAR DISPATCHER ----------------
apiRouter.post('/command', async (req: Request, res: Response) => {
  try {
    const { command, targetAgent } = req.body;
    if (!command || !command.trim()) {
      res.status(400).json({ error: 'Command text is required' });
      return;
    }

    const trimmed = command.trim();
    let agentTarget = targetAgent || 'all';

    // Parse @ mentions if present in command text
    if (trimmed.startsWith('@chatgpt') || trimmed.includes('@chatgpt')) {
      agentTarget = 'chatgpt';
    } else if (trimmed.startsWith('@gemini') || trimmed.includes('@gemini')) {
      agentTarget = 'gemini';
    } else if (trimmed.startsWith('@codex') || trimmed.includes('@codex')) {
      agentTarget = 'codex';
    } else if (trimmed.startsWith('@all') || trimmed.includes('@all')) {
      agentTarget = 'all';
    }

    // Log human command in activity audit
    await logActivity({
      agent: 'human',
      action: 'Chỉ thị từ Trung Tâm Điều Khiển',
      entity_type: 'system',
      details: `[Đích: ${agentTarget.toUpperCase()}]: "${trimmed}"`,
    });

    // Create broadcast/targeted message
    const msg = await createMessage({
      from: 'human',
      to: agentTarget,
      type: 'handoff',
      content: trimmed,
    });

    const lower = trimmed.toLowerCase();
    let createdTask = null;
    let createdFinding = null;
    let actionResult = null;

    // Natural Language Emergency Commands
    if (lower === 'pause' || lower === 'tạm dừng' || lower === 'tạm dừng tất cả' || lower === 'pause all') {
      actionResult = await pauseAllAgents();
    } else if (lower === 'resume' || lower === 'tiếp tục' || lower === 'tiếp tục hoạt động' || lower === 'resume all') {
      actionResult = await resumeAllAgents();
    } else if (lower.includes('dừng gemini') || lower.includes('stop gemini')) {
      actionResult = await stopSingleAgent('gemini');
    } else if (lower.includes('dừng chatgpt') || lower.includes('stop chatgpt')) {
      actionResult = await stopSingleAgent('chatgpt');
    } else if (
      lower.startsWith('task:') ||
      lower.startsWith('todo:') ||
      lower.startsWith('fix:') ||
      lower.startsWith('nhiệm vụ:') ||
      lower.startsWith('sửa:') ||
      lower.includes('giao cho gemini') ||
      lower.includes('give to gemini')
    ) {
      const cleanTitle = trimmed
        .replace(/^(@[a-zA-Z0-9_-]+\s*)?/i, '')
        .replace(/^(task:|todo:|fix:|nhiệm vụ:|sửa:)\s*/i, '')
        .trim();

      createdTask = await createTask({
        title: cleanTitle || trimmed,
        description: `Yêu cầu từ người điều hành qua Mission Control: "${trimmed}"`,
        assignee: agentTarget === 'codex' ? 'gemini' : 'gemini',
        created_by: 'human',
        priority: 'high',
      });
    } else if (
      lower.startsWith('bug:') ||
      lower.startsWith('finding:') ||
      lower.startsWith('lỗi:') ||
      lower.startsWith('phát hiện:')
    ) {
      const cleanTitle = trimmed
        .replace(/^(@[a-zA-Z0-9_-]+\s*)?/i, '')
        .replace(/^(bug:|finding:|lỗi:|phát hiện:)\s*/i, '')
        .trim();

      createdFinding = await createFinding({
        title: cleanTitle || trimmed,
        severity: 'high',
        description: `Lỗi báo cáo từ người điều hành: "${trimmed}"`,
        file: 'src/App.tsx',
        line: 1,
        created_by: 'human',
        assigned_to: 'gemini',
      });
    } else if (
      lower.includes('review') ||
      lower.includes('đánh giá') ||
      lower.includes('kiểm tra') ||
      lower.includes('inspect')
    ) {
      // Trigger Auto-Review / evaluation cycle
      await checkAndTriggerAutoReview();
      actionResult = { triggered_review: true };
    }

    res.json({
      success: true,
      message: msg,
      createdTask,
      createdFinding,
      actionResult,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- MCP TOOLS & CONFIGURATION MANIFESTS ----------------
apiRouter.get('/mcp/tools', (req: Request, res: Response) => {
  res.json({
    tools: BRIDGE_TOOLS,
    total: BRIDGE_TOOLS.length,
  });
});

apiRouter.get('/mcp/configs', async (req: Request, res: Response) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const mcpUrl = `${protocol}://${host}/mcp`;
  const tokenConfigured = Boolean(process.env.BRIDGE_MCP_TOKEN);

  const geminiConfig = {
    mcpServers: {
      bridge: {
        url: mcpUrl,
        headers: tokenConfigured
          ? {
              Authorization: `Bearer ${process.env.BRIDGE_MCP_TOKEN}`,
              'x-agent-name': 'gemini',
            }
          : {
              'x-agent-name': 'gemini',
            },
      },
    },
  };

  const chatgptConfig = {
    name: 'Bridge Shared AI Workspace',
    description: 'Bridge MCP remote server for ChatGPT code review and task coordination with Gemini.',
    mcp_endpoint: mcpUrl,
    auth_type: tokenConfigured ? 'Bearer Token' : 'None',
    bearer_token: tokenConfigured ? '••••••••' : '(Not required / local)',
    custom_gpt_instructions:
      'You are the Reviewer / Architect / Task Manager for the Bridge workspace. ' +
      'Use project_* tools to inspect code and diffs. ' +
      'When you find issues, use finding_create and task_create assigned to Gemini. ' +
      'Do not directly modify project files. Verify Gemini results with project_git_diff and project_test.',
  };

  res.json({
    mcp_url: mcpUrl,
    token_required: tokenConfigured,
    gemini_mcp_config: geminiConfig,
    chatgpt_mcp_config: chatgptConfig,
  });
});

// ---------------- SEED CONCRETE EXAMPLE SCENARIO ----------------
apiRouter.post('/seed-sample-scenario', async (req: Request, res: Response) => {
  try {
    // 1. ChatGPT reports BUG-21
    const bug = await createFinding({
      title: 'Refresh token race condition in auth service',
      severity: 'high',
      description: 'Multiple concurrent API calls during token refresh trigger duplicate exchange requests, causing token invalidation.',
      file: 'src/services/auth.ts',
      line: 42,
      created_by: 'chatgpt',
      assigned_to: 'gemini',
    });

    // 2. ChatGPT creates TASK-21 assigned to Gemini
    const task = await createTask({
      title: 'Fix refresh token race condition and add mutex lock',
      description: 'Implement a pending promise singleton or mutex in auth refresh flow to serialize concurrent refresh requests. Ensure tests pass.',
      priority: 'high',
      assignee: 'gemini',
      created_by: 'chatgpt',
      related_files: ['src/services/auth.ts', 'src/services/auth.test.ts'],
      related_finding: bug.id,
      status: 'review',
    });

    // 3. Gemini reports execution result
    await updateTask(
      task.id,
      {
        status: 'review',
        result: 'Implemented activeRefreshPromise mutex lock in auth.ts to coalesce concurrent refresh calls. Added unit test verifying 5 parallel requests only call refresh once. All tests passed.',
      },
      'gemini'
    );

    // 4. Update agent statuses
    await setAgentStatus({
      agent: 'gemini',
      status: 'working',
      current_task_id: task.id,
      message: 'Completed code edits and test validation.',
    });

    await setAgentStatus({
      agent: 'chatgpt',
      status: 'reviewing',
      current_task_id: task.id,
      message: `Reviewing git diff and test output for ${task.id}`,
    });

    res.json({
      success: true,
      seededFinding: bug,
      seededTask: task,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
