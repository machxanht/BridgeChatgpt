import { GoogleGenAI } from '@google/genai';
import {
  claimNextTask,
  createMessage,
  getFinding,
  getProject,
  getTask,
  getWorkflowStateForAgent,
  logActivity,
  recordHeartbeat,
  setAgentStatus,
  updateTask,
} from './db.js';
import {
  toolProjectGitDiff,
  toolProjectGitStatus,
  toolProjectPatchFile,
  toolProjectReadFile,
  toolProjectTest,
  toolProjectWriteFile,
} from './projectTools.js';
import { Task } from '../src/types.js';

let workerIntervalTimer: NodeJS.Timeout | null = null;
let isWorkerRunning = false;
let isCycleInProgress = false;

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

export interface GeminiWorkerConfig {
  enabled: boolean;
  model: string;
  intervalMs: number;
}

export function getGeminiWorkerConfig(): GeminiWorkerConfig {
  return {
    enabled: process.env.GEMINI_WORKER_ENABLED === 'true',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    intervalMs: parseInt(process.env.GEMINI_WORKER_INTERVAL_MS || '5000', 10),
  };
}

/**
 * Execute a single task end-to-end using the Gemini API.
 */
export async function executeTaskWithGemini(task: Task, config: GeminiWorkerConfig): Promise<{
  success: boolean;
  summary: string;
  changedFiles: string[];
  testPassed: boolean;
}> {
  const project = await getProject();
  const startTime = Date.now();

  await logActivity({
    agent: 'gemini',
    action: `Started autonomous task execution for ${task.id}`,
    entity_type: 'task',
    entity_id: task.id,
    details: `Task: "${task.title}" using model ${config.model}`,
  });

  // 1. Gather context: Related finding, file hints, git status
  let relatedFindingInfo = '';
  if (task.related_finding) {
    const finding = await getFinding(task.related_finding);
    if (finding) {
      relatedFindingInfo = `
Related Finding (${finding.id}):
- Severity: ${finding.severity}
- File: ${finding.file || 'N/A'}${finding.line ? ` (Line ${finding.line})` : ''}
- Description: ${finding.description}
- Resolution Note: ${finding.resolution || 'N/A'}
`;
    }
  }

  // Read target file if specified in task or finding
  let targetFileContent = '';
  const candidateFile = task.related_files?.[0] || (task.related_finding ? (await getFinding(task.related_finding))?.file : undefined);
  if (candidateFile) {
    try {
      const fileData = await toolProjectReadFile({ file_path: candidateFile });
      targetFileContent = `\n--- Content of ${candidateFile} ---\n${fileData.content}\n--- End of ${candidateFile} ---`;
    } catch {
      targetFileContent = `\n(Target file ${candidateFile} could not be read or does not exist yet)`;
    }
  }

  const gitStatus = await toolProjectGitStatus();

  // 2. Formulate Prompt for Gemini
  const prompt = `
You are Gemini 3.7 Flash acting as the autonomous Coder & Executor for Bridge.
Your responsibility is to implement the requested code changes, bug fixes, or features for the assigned task.

Project: ${project.project_name}
Project Root: ${project.project_root}
Task ID: ${task.id}
Task Title: ${task.title}
Task Description: ${task.description}
Acceptance Criteria: Pass all project tests without regressions.
${relatedFindingInfo}
${targetFileContent}

Current Git Status:
Branch: ${gitStatus.branch}
Modified files: ${gitStatus.modified.join(', ') || 'None'}
Untracked files: ${gitStatus.untracked.join(', ') || 'None'}

Instructions:
1. Provide a concise summary of the changes to make.
2. Provide the exact file edits needed in structured JSON format at the very end of your response inside a \`\`\`json block:
\`\`\`json
{
  "summary": "Brief summary of implementation",
  "files": [
    {
      "path": "path/to/file.ts",
      "action": "write" | "patch",
      "content": "Full content if action is write",
      "target_content": "Exact unique substring to replace if action is patch",
      "replacement_content": "Replacement string if action is patch"
    }
  ]
}
\`\`\`
Keep edits minimal, clean, and strictly focused on satisfying the task requirements.
`;

  const ai = getAiClient();
  if (!ai) {
    throw new Error('Gemini API key is not configured. Set GEMINI_API_KEY to enable autonomous execution.');
  }

  // 3. Call Gemini model
  const response = await ai.models.generateContent({
    model: config.model,
    contents: prompt,
  });

  const responseText = response.text || '';
  const changedFiles: string[] = [];
  let summary = `Autonomous execution completed by Gemini (${config.model})`;

  // 4. Parse file edits from JSON block
  const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch && jsonMatch[1]) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.summary) summary = parsed.summary;
      if (Array.isArray(parsed.files)) {
        for (const fileEdit of parsed.files) {
          if (fileEdit.path) {
            if (fileEdit.action === 'patch' && fileEdit.target_content && fileEdit.replacement_content !== undefined) {
              await toolProjectPatchFile(
                {
                  file_path: fileEdit.path,
                  target_content: fileEdit.target_content,
                  replacement_content: fileEdit.replacement_content,
                },
                'gemini'
              );
              changedFiles.push(fileEdit.path);
            } else if (fileEdit.content !== undefined) {
              await toolProjectWriteFile(
                {
                  file_path: fileEdit.path,
                  content: fileEdit.content,
                  create_if_missing: true,
                },
                'gemini'
              );
              changedFiles.push(fileEdit.path);
            }
          }
        }
      }
    } catch (parseErr) {
      console.warn('[GeminiWorker] Could not parse structured file edits from response:', parseErr);
    }
  }

  // 5. Run test suite to verify implementation
  const testResult = await toolProjectTest({
    command: project.test_command || 'npm run lint',
    agent: 'gemini',
  });

  // 6. Capture git diff
  const diffResult = await toolProjectGitDiff();
  const diffSummary = diffResult?.has_changes
    ? `Working tree modified (Diff size: ${diffResult.diff.length} chars)`
    : 'Working tree clean';

  const durationMs = Date.now() - startTime;

  // 7. Format structured implementation result
  const resultReport = `
### Gemini Implementation Report
**Model**: ${config.model}
**Duration**: ${durationMs}ms
**Summary**: ${summary}

#### Changed Files
${changedFiles.length > 0 ? changedFiles.map((f) => `- \`${f}\``).join('\n') : '- No file modifications made'}

#### Test Execution
- **Command**: \`${testResult.command}\`
- **Result**: ${testResult.success ? 'PASSED (exit code 0)' : `FAILED (exit code ${testResult.exitCode})`}
- **Test Duration**: ${testResult.durationMs}ms
\`\`\`
${testResult.stdout.trim() || testResult.stderr.trim() || 'No test output'}
\`\`\`

#### Git Diff Summary
${diffSummary}

---
*Ready for ChatGPT review. Submitted for approval.*
`.trim();

  // 8. Transition task to 'review' status (Gemini NEVER marks tasks completed!)
  await updateTask(
    task.id,
    {
      status: 'review',
      result: resultReport,
    },
    'gemini'
  );

  // 9. Send review notification message to ChatGPT
  await createMessage({
    from: 'gemini',
    to: 'chatgpt',
    type: 'review_requested',
    content: `Gemini has completed implementation for ${task.id} ("${task.title}"). Tests ${testResult.success ? 'PASSED' : 'FAILED'}. Ready for explicit review.`,
    task_id: task.id,
    finding_id: task.related_finding,
  });

  // 10. Update agent status back to idle
  await setAgentStatus({
    agent: 'gemini',
    status: 'idle',
    current_task_id: undefined,
    message: `Completed ${task.id} in ${durationMs}ms. Awaiting ChatGPT review.`,
  });

  return {
    success: true,
    summary,
    changedFiles,
    testPassed: testResult.success,
  };
}

/**
 * Single worker iteration cycle.
 */
export async function runGeminiWorkerCycle(): Promise<{ executed: boolean; message: string; taskId?: string }> {
  if (isCycleInProgress) {
    return { executed: false, message: 'Cycle already in progress' };
  }

  isCycleInProgress = true;
  try {
    const config = getGeminiWorkerConfig();
    await recordHeartbeat('gemini');

    if (!config.enabled) {
      return { executed: false, message: 'Gemini worker is disabled (GEMINI_WORKER_ENABLED!=true)' };
    }

    if (!process.env.GEMINI_API_KEY) {
      return { executed: false, message: 'GEMINI_API_KEY is not set' };
    }

    // Check workflow state
    const workflow = await getWorkflowStateForAgent('gemini');

    // If an active task is currently working, fetch it
    let activeTask: Task | null = null;
    if (workflow.active_task) {
      activeTask = workflow.active_task;
    }

    // Otherwise, claim next available task
    if (!activeTask || activeTask.status !== 'working') {
      const claimResult = await claimNextTask('gemini');
      if (!claimResult.claimed || !claimResult.task) {
        // No task to execute
        return { executed: false, message: 'No eligible tasks to claim' };
      }
      activeTask = claimResult.task;
    }

    // Execute the claimed task
    const result = await executeTaskWithGemini(activeTask, config);
    return {
      executed: true,
      message: `Executed task ${activeTask.id}: ${result.summary}`,
      taskId: activeTask.id,
    };
  } catch (err: any) {
    console.error('[GeminiWorker Cycle Error]', err);
    await setAgentStatus({
      agent: 'gemini',
      status: 'blocked',
      message: `Execution error: ${err.message}`,
    });
    return { executed: false, message: `Error: ${err.message}` };
  } finally {
    isCycleInProgress = false;
  }
}

/**
 * Start background polling loop for the Gemini worker.
 */
export function startGeminiWorker(): void {
  const config = getGeminiWorkerConfig();
  if (isWorkerRunning) return;

  isWorkerRunning = true;
  console.log(`[GeminiWorker] Started background worker (enabled=${config.enabled}, model=${config.model}, interval=${config.intervalMs}ms)`);

  // Run initial cycle after brief startup delay
  setTimeout(() => {
    runGeminiWorkerCycle().catch((err) => console.error('[GeminiWorker Initial Run Error]', err));
  }, 1000);

  workerIntervalTimer = setInterval(() => {
    runGeminiWorkerCycle().catch((err) => console.error('[GeminiWorker Interval Error]', err));
  }, Math.max(config.intervalMs, 2000));
}

/**
 * Stop the background Gemini worker.
 */
export function stopGeminiWorker(): void {
  if (workerIntervalTimer) {
    clearInterval(workerIntervalTimer);
    workerIntervalTimer = null;
  }
  isWorkerRunning = false;
  console.log('[GeminiWorker] Stopped background worker');
}
