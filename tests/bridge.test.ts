import assert from 'node:assert';
import {
  initDatabase,
  createTask,
  getTask,
  getTasks,
  updateTask,
  createFinding,
  getFinding,
  getFindings,
  updateFinding,
  createMessage,
  getMessages,
  getWorkspaceState,
  getProject,
} from '../server/db.js';
import {
  toolProjectReadFile,
  toolProjectSearch,
  toolProjectGitDiff,
  toolProjectGitStatus,
  toolProjectInfo,
  toolProjectListFiles,
  toolProjectTest,
  resolveSafePath,
} from '../server/projectTools.js';
import { executeTool, BRIDGE_TOOLS } from '../server/mcp.js';

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
  console.log('\n========================================');
  console.log('  Running Bridge Shared AI Workspace Test Suite');
  console.log('========================================\n');

  // Initialize DB before tests
  await initDatabase();

  // Test 1: Task Creation
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

  // Test 2: Task Assignment
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

  // Test 3: Task Status Transition
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
        result: 'Replaced anonymous callback with named listener and added useEffect cleanup. Tests pass.',
      },
      'gemini'
    );
    assert.strictEqual(inReview.status, 'review');
    assert.ok(inReview.result?.includes('cleanup'), 'Result should contain reported fix summary');

    // ChatGPT completes review and marks completed
    const completed = await updateTask(task.id, { status: 'completed' }, 'chatgpt');
    assert.strictEqual(completed.status, 'completed');
  });

  // Test 4: Finding Creation & Status
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

    // Update finding to fixed/verified
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

  // Test 5: Message Creation
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

  // Test 6: Project File Read
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

  // Test 7: Project Search
  await test('7. Project Search: finds keyword matches across project source tree', async () => {
    const searchResult = await toolProjectSearch({
      query: 'BRIDGE_MCP_TOKEN',
      max_results: 10,
    });

    assert.ok(searchResult.match_count > 0, 'Should find occurrences of BRIDGE_MCP_TOKEN');
    assert.ok(searchResult.matches.some((m) => m.file.includes('.env.example') || m.file.includes('server')), 'Match found in expected files');
  });

  // Test 8: Git Diff & Status
  await test('8. Git Diff: queries working tree status and diff without throwing errors', async () => {
    const status = await toolProjectGitStatus();
    assert.ok(typeof status.clean === 'boolean', 'Status clean should be a boolean');
    assert.ok(typeof status.branch === 'string', 'Status branch should be a string');

    const diff = await toolProjectGitDiff();
    assert.ok(typeof diff.diff === 'string', 'Diff output should be a string');
    assert.ok(typeof diff.has_changes === 'boolean', 'has_changes should be a boolean');
  });

  // Test 9: Path Traversal Rejection & Sensitive File Guard
  await test('9. Path Traversal Rejection: blocks ../ directory escapes and sensitive .env files', async () => {
    // Escape attempt 1: ../../../etc/passwd
    let rejected1 = false;
    try {
      await resolveSafePath('../../../etc/passwd');
    } catch (err: any) {
      rejected1 = true;
      assert.ok(err.message.includes('outside project root') || err.message.includes('Access denied'));
    }
    assert.ok(rejected1, 'Path traversal should throw access denied error');

    // Escape attempt 2: Direct read attempt via project_read_file on /etc/hosts
    let rejected2 = false;
    try {
      await toolProjectReadFile({ file_path: '../../../../etc/hosts' });
    } catch (err: any) {
      rejected2 = true;
      assert.ok(err.message.includes('Access denied') || err.message.includes('does not exist'));
    }
    assert.ok(rejected2, 'Reading file outside sandbox should be rejected');

    // Sensitive file protection: reading .env
    let rejectedEnv = false;
    try {
      await resolveSafePath('.env');
    } catch (err: any) {
      rejectedEnv = true;
      assert.ok(err.message.includes('sensitive'));
    }
    assert.ok(rejectedEnv, 'Reading .env file should be blocked by security filter');
  });

  // Test 10: MCP Endpoint & Tools Router
  await test('10. MCP Endpoint Tools: executes tools via unified MCP router', async () => {
    assert.strictEqual(BRIDGE_TOOLS.length, 21, 'Should expose all 21 Bridge MCP tools');

    // Execute project_info tool
    const info = await executeTool('project_info', {});
    assert.ok(info.project_id, 'Project info tool returned metadata');

    // Execute workspace_state tool
    const state = await executeTool('workspace_state', {});
    assert.ok(state.project, 'Workspace state tool returned project');
    assert.ok(state.agents, 'Workspace state tool returned agents');
    assert.ok(Array.isArray(state.tasks), 'Workspace state tool returned tasks list');

    // Execute task_create tool via MCP
    const createdViaMcp = await executeTool('task_create', {
      title: 'MCP Executed Task',
      description: 'Created through MCP tool dispatcher',
      priority: 'low',
      assignee: 'gemini',
    });
    assert.ok(createdViaMcp.id, 'Task created via MCP should have an ID');
  });

  // Test 11: Health & Workspace State Verification
  await test('11. Health & Workspace State: returns clean database and project configuration', async () => {
    const project = await getProject();
    assert.ok(project.project_name, 'Project name is present');
    assert.ok(project.test_command, 'Test command is configured');

    const workspace = await getWorkspaceState();
    assert.ok(workspace.stats.total_tasks > 0, 'Workspace contains total tasks count');
    assert.strictEqual(workspace.agents.gemini.agent, 'gemini');
    assert.strictEqual(workspace.agents.chatgpt.agent, 'chatgpt');
    assert.strictEqual(workspace.agents.human.agent, 'human');
  });

  // Test 12: Bearer Token Authentication Verification
  await test('12. Bearer Authentication: verifies valid token and rejects unauthorized requests', async () => {
    const { verifyAuthToken } = await import('../server/mcp.js');

    // Case A: When BRIDGE_MCP_TOKEN is set
    process.env.BRIDGE_MCP_TOKEN = 'secret_test_token_xyz';

    // 1. Authorized via Authorization: Bearer <token>
    const validReq = {
      headers: { authorization: 'Bearer secret_test_token_xyz' },
      query: {},
    } as any;
    assert.strictEqual(verifyAuthToken(validReq), true, 'Valid Bearer token must be accepted');

    // 2. Unauthorized via wrong token
    const wrongReq = {
      headers: { authorization: 'Bearer wrong_token' },
      query: {},
    } as any;
    assert.strictEqual(verifyAuthToken(wrongReq), false, 'Wrong token must be rejected');

    // 3. Unauthorized when header is missing
    const missingReq = {
      headers: {},
      query: {},
    } as any;
    assert.strictEqual(verifyAuthToken(missingReq), false, 'Missing token must be rejected');

    // Cleanup env
    delete process.env.BRIDGE_MCP_TOKEN;
  });

  console.log('\n========================================');
  console.log(`  All ${passedTests}/${totalTests} Tests Passed Successfully! ✓`);
  console.log('========================================\n');
}

runAllTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
