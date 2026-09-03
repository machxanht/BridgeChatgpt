import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.mkdirSync(path.split('/').slice(0, -1).join('/') || '.', { recursive: true });
  fs.writeFileSync(path, content, 'utf8');
}

function replaceOnce(path, from, to) {
  const source = read(path);
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`${path}: expected block not found: ${from.slice(0, 100)}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`${path}: expected block is not unique`);
  write(path, source.slice(0, first) + to + source.slice(first + from.length));
}

function replaceRange(path, startMarker, endMarker, replacement) {
  const source = read(path);
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`${path}: start marker not found: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`${path}: end marker not found: ${endMarker}`);
  write(path, source.slice(0, start) + replacement + source.slice(end));
}

function replaceFrom(path, startMarker, replacement) {
  const source = read(path);
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`${path}: start marker not found: ${startMarker}`);
  write(path, source.slice(0, start) + replacement);
}

write('server/singleFlight.ts', `import type { Task } from '../src/types.js';
import { extractTaskBinding } from './taskBinding.js';

export const TERMINAL_TASK_STATUSES = new Set(['completed', 'cancelled']);
const CLAIMABLE_TASK_STATUSES = new Set(['pending', 'assigned']);

export function isNonTerminalTask(task: Task): boolean {
  return !TERMINAL_TASK_STATUSES.has(task.status);
}

export function taskCreatedOrder(a: Task, b: Task): number {
  const created = String(a.created_at || '').localeCompare(String(b.created_at || ''));
  if (created !== 0) return created;
  return a.id.localeCompare(b.id);
}

export function exactTaskLaneKey(task: Task): string | null {
  const binding = extractTaskBinding(String(task.description || '')).binding;
  if (!binding?.agent_instance_id) return null;
  return [task.assignee, binding.workspace_id, binding.project_id, binding.agent_instance_id].join(':');
}

export function exactLaneBlocker(task: Task, tasks: Task[]): Task | null {
  const lane = exactTaskLaneKey(task);
  if (!lane) return null;
  const head = tasks
    .filter(candidate => isNonTerminalTask(candidate) && exactTaskLaneKey(candidate) === lane)
    .sort(taskCreatedOrder)[0] || null;
  if (!head || head.id === task.id) return null;
  return head;
}

export function filterClaimableSingleFlight(tasks: Task[], assignee?: string): Task[] {
  return tasks.filter(task => {
    if (assignee && task.assignee !== assignee) return false;
    if (!CLAIMABLE_TASK_STATUSES.has(task.status)) return false;
    return exactLaneBlocker(task, tasks) === null;
  });
}
`);

replaceOnce(
  'server/db.ts',
  `} from '../src/types.js';\n`,
  `} from '../src/types.js';\nimport { exactLaneBlocker, filterClaimableSingleFlight } from './singleFlight.js';\n`
);

replaceOnce(
  'server/db.ts',
  `  for (const [key, value] of Object.entries(updates)) {\n    if (value !== undefined) {\n      (cleanUpdates as any)[key] = value;\n    }\n  }\n\n  const updated: Task = {`,
  `  for (const [key, value] of Object.entries(updates)) {\n    if (value !== undefined) {\n      (cleanUpdates as any)[key] = value;\n    }\n  }\n\n  const requestedStatus = cleanUpdates.status;\n  if (requestedStatus && ['working', 'review', 'blocked'].includes(requestedStatus)) {\n    const laneTasks = await getTasks({ assignee: current.assignee });\n    const blocker = exactLaneBlocker(current, laneTasks);\n    if (blocker) {\n      throw new Error(\n        \`Single-flight lane busy: \\${blocker.id} is \\${blocker.status}; \\${current.id} cannot enter \\${requestedStatus} until the earlier task is completed or cancelled.\`\n      );\n    }\n  }\n\n  const updated: Task = {`
);

replaceRange(
  'server/db.ts',
  `export async function claimNextTask(`,
  `// Explicit Review Submission`,
  `export async function claimNextTask(agent: AgentType = 'gemini', requestedTaskId?: string): Promise<{\n  claimed: boolean;\n  message?: string;\n  task: Task | null;\n}> {\n  return await dbMutex.runExclusive(async () => {\n    const d = await getDb();\n    const allTasks = await getTasks({ assignee: agent });\n    const claimable = filterClaimableSingleFlight(allTasks, agent);\n\n    let selected: Task | null = null;\n    if (requestedTaskId) {\n      const requested = allTasks.find(task => task.id === requestedTaskId) || null;\n      if (!requested) {\n        return { claimed: false, message: \`Task \\${requestedTaskId} is not assigned to agent \\\"\\${agent}\\\".\`, task: null };\n      }\n      if (!['assigned', 'pending'].includes(requested.status)) {\n        return { claimed: false, message: \`Task \\${requested.id} is \\${requested.status}, not claimable.\`, task: null };\n      }\n      const blocker = exactLaneBlocker(requested, allTasks);\n      if (blocker) {\n        return {\n          claimed: false,\n          message: \`Single-flight lane busy: \\${blocker.id} is \\${blocker.status}; refusing to claim \\${requested.id}.\`,\n          task: null,\n        };\n      }\n      selected = requested;\n    } else {\n      if (claimable.length === 0) {\n        return {\n          claimed: false,\n          message: \`No claimable pending/assigned tasks available for agent \\\"\\${agent}\\\"; an exact target lane may already be busy.\`,\n          task: null,\n        };\n      }\n\n      claimable.sort((a, b) => {\n        const weightA = PRIORITY_WEIGHTS[a.priority] || 3;\n        const weightB = PRIORITY_WEIGHTS[b.priority] || 3;\n        if (weightA !== weightB) return weightA - weightB;\n        return a.created_at.localeCompare(b.created_at);\n      });\n      selected = claimable[0];\n    }\n\n    const now = new Date().toISOString();\n    d.run(\n      \`UPDATE tasks SET status = 'working', updated_at = ? WHERE id = ? AND (status = 'assigned' OR status = 'pending')\`,\n      [now, selected.id]\n    );\n\n    const rowsModified = d.getRowsModified();\n    if (rowsModified !== 1) {\n      return {\n        claimed: false,\n        message: \`Task \\${selected.id} was claimed or modified concurrently by another worker.\`,\n        task: null,\n      };\n    }\n\n    persistToDisk();\n\n    const refreshed = await getTask(selected.id);\n    if (!refreshed || refreshed.status !== 'working') {\n      return {\n        claimed: false,\n        message: \`Task \\${selected.id} status verification failed after claim.\`,\n        task: null,\n      };\n    }\n\n    await setAgentStatus({\n      agent: agent as any,\n      status: 'working',\n      current_task_id: selected.id,\n      message: \`Actively executing \\\"\\${selected.title}\\\"\`,\n    });\n\n    await logActivity({\n      agent,\n      action: \`Claimed task \\${selected.id}\`,\n      entity_type: 'task',\n      entity_id: selected.id,\n      details: \`Priority: \\${selected.priority} | \\\"\\${selected.title}\\\"\`,\n    });\n\n    await createMessage({\n      from: agent,\n      to: 'chatgpt',\n      type: 'task_claimed',\n      content: \`\\${agent.toUpperCase()} claimed \\${selected.id}: \\\"\\${selected.title}\\\". Implementation started.\`,\n      task_id: selected.id,\n      finding_id: selected.related_finding,\n    });\n\n    return {\n      claimed: true,\n      message: \`Successfully claimed task \\${selected.id}\`,\n      task: refreshed,\n    };\n  });\n}\n\n`
);

replaceOnce(
  'server/db.ts',
  `  const pendingForMe = tasks.filter((t) => t.assignee === normalizedAgent && (t.status === 'assigned' || t.status === 'pending'));`,
  `  const pendingForMe = filterClaimableSingleFlight(tasks, normalizedAgent);`
);

replaceOnce(
  'server/mcp.ts',
  `      properties: {\n        agent: { type: 'string', enum: ['gemini', 'chatgpt', 'human'], description: 'Agent claiming the task (default: gemini)' },\n      },`,
  `      properties: {\n        agent: { type: 'string', enum: ['gemini', 'chatgpt', 'human'], description: 'Agent claiming the task (default: gemini)' },\n        task_id: { type: 'string', description: 'Optional exact task ID. Bound target lanes reject this claim if an earlier task is still non-terminal.' },\n      },`
);
replaceOnce(
  'server/mcp.ts',
  `    case 'task_claim_next':\n      return await claimNextTask(args.agent || agent);`,
  `    case 'task_claim_next':\n      return await claimNextTask(args.agent || agent, args.task_id);`
);

replaceOnce(
  'server/routes.ts',
  `apiRouter.post('/tasks/claim', async (req: Request, res: Response) => {\n  try {\n    const agent = req.body.agent || 'gemini';\n    const claimed = await claimNextTask(agent);`,
  `apiRouter.post('/tasks/claim', async (req: Request, res: Response) => {\n  try {\n    const agent = req.body.agent || 'gemini';\n    const claimed = await claimNextTask(agent, req.body.task_id);`
);

replaceOnce(
  'server/workspaceTaskRouter.ts',
  `const PRIORITY_WEIGHTS: Record<TaskPriority, number> = { urgent: 1, high: 2, medium: 3, low: 4 };\n`,
  ``
);
replaceOnce(
  'server/workspaceTaskRouter.ts',
  `import type { AgentType, Task, TaskPriority } from '../src/types.js';`,
  `import type { AgentType, Task, TaskPriority } from '../src/types.js';\nimport { isNonTerminalTask, taskCreatedOrder } from './singleFlight.js';`
);
replaceFrom(
  'server/workspaceTaskRouter.ts',
  `export async function claimNextBoundTask(`,
  `export async function claimNextBoundTask(input: {\n  agent: 'gemini';\n  workspace_id: string;\n  project_id: string;\n  agent_instance_id: string;\n  task_id?: string;\n  allow_legacy?: boolean;\n}): Promise<{\n  claimed: boolean;\n  message?: string;\n  task: Task | null;\n  binding: TaskBinding | null;\n  project_context: ProjectBrainBootstrap;\n}> {\n  return withClaimLock(async () => {\n    const projectContext = await buildProjectBootstrap(input.workspace_id, input.project_id);\n    const tasks = await getTasks({ assignee: input.agent, limit: 200 });\n    const matchesLane = (task: Task) => {\n      const binding = extractTaskBinding(task.description).binding;\n      if (!binding) return Boolean(input.allow_legacy);\n      if (binding.workspace_id !== input.workspace_id || binding.project_id !== input.project_id) return false;\n      if (binding.agent_instance_id && binding.agent_instance_id !== input.agent_instance_id) return false;\n      return true;\n    };\n\n    const routed = tasks.filter(matchesLane);\n    const firstOpen = routed.filter(isNonTerminalTask).sort(taskCreatedOrder)[0] || null;\n    if (!firstOpen) {\n      return {\n        claimed: false,\n        message: \`No task available for \\${input.agent_instance_id} in \\${input.workspace_id}.\`,\n        task: null,\n        binding: null,\n        project_context: projectContext,\n      };\n    }\n\n    if (input.task_id && firstOpen.id !== input.task_id) {\n      const requestedExists = routed.some(task => task.id === input.task_id);\n      return {\n        claimed: false,\n        message: requestedExists\n          ? \`Single-flight lane busy: \\${firstOpen.id} is \\${firstOpen.status}; refusing exact claim for \\${input.task_id}.\`\n          : \`Task \\${input.task_id} is not routed to \\${input.agent_instance_id}.\`,\n        task: null,\n        binding: null,\n        project_context: projectContext,\n      };\n    }\n\n    if (!['assigned', 'pending'].includes(firstOpen.status)) {\n      return {\n        claimed: false,\n        message: \`Single-flight lane busy: \\${firstOpen.id} is \\${firstOpen.status}. The next task stays queued until it is completed or cancelled.\`,\n        task: null,\n        binding: extractTaskBinding(firstOpen.description).binding,\n        project_context: projectContext,\n      };\n    }\n\n    const selected = firstOpen;\n    const latestTasks = await getTasks({ assignee: input.agent, limit: 200 });\n    const latestHead = latestTasks.filter(matchesLane).filter(isNonTerminalTask).sort(taskCreatedOrder)[0] || null;\n    if (!latestHead || latestHead.id !== selected.id || !['assigned', 'pending'].includes(latestHead.status)) {\n      return {\n        claimed: false,\n        message: \`\\${selected.id} changed before claim or is no longer the lane head.\`,\n        task: null,\n        binding: null,\n        project_context: projectContext,\n      };\n    }\n\n    await updateTask(selected.id, { status: 'working' }, input.agent);\n    const refreshed = await getTask(selected.id);\n    if (!refreshed || refreshed.status !== 'working') {\n      return {\n        claimed: false,\n        message: \`\\${selected.id} claim verification failed.\`,\n        task: null,\n        binding: null,\n        project_context: projectContext,\n      };\n    }\n\n    const parsed = extractTaskBinding(refreshed.description);\n    await setAgentStatus({\n      agent: 'gemini',\n      status: 'working',\n      current_task_id: refreshed.id,\n      message: \`\\${input.agent_instance_id} executing \\${refreshed.id} in \\${input.workspace_id}\`,\n    });\n    await logActivity({\n      agent: 'gemini',\n      action: \`Workspace instance \\${input.agent_instance_id} claimed \\${refreshed.id}\`,\n      entity_type: 'task',\n      entity_id: refreshed.id,\n      details: \`\\${input.workspace_id} / \\${input.project_id}\`,\n    });\n    await createMessage({\n      from: 'gemini',\n      to: 'chatgpt',\n      type: 'task_claimed',\n      content: \`\\${input.agent_instance_id} claimed \\${refreshed.id} for workspace \\${input.workspace_id}.\`,\n      task_id: refreshed.id,\n      finding_id: refreshed.related_finding,\n    });\n\n    return {\n      claimed: true,\n      message: \`Successfully claimed \\${refreshed.id} for \\${input.agent_instance_id}\`,\n      task: { ...refreshed, description: parsed.description },\n      binding: parsed.binding,\n      project_context: projectContext,\n    };\n  });\n}\n`
);

replaceOnce(
  'server/studioRelay.ts',
  `      agent_instance_id: resolved.instance.agent_instance_id,\n      allow_legacy: resolved.instance.workspace_id === resolved.fallbackWorkspace.workspace_id,`,
  `      agent_instance_id: resolved.instance.agent_instance_id,\n      task_id: req.body?.task_id ? String(req.body.task_id) : undefined,\n      allow_legacy: resolved.instance.workspace_id === resolved.fallbackWorkspace.workspace_id,`
);

replaceOnce(
  'server/wakeQueue.ts',
  `      'Check Bridge now. Claim only pending work mapped to this Studio app, process it completely, run the required build/tests, and submit the result back to Bridge.',`,
  `      \`Claim exactly \\${task.id} for this Studio target. When using the Studio relay, pass task_id=\\${task.id}; never use an unscoped claim-next to skip an earlier non-terminal task.\`,\n      \`Process only \\${task.id} completely, run the required build/tests, and submit its result back to Bridge.\`,`
);

replaceOnce(
  'server/androidWake.ts',
  `import { getProject } from './db.js';`,
  `import { getProject, getTask, updateTask } from './db.js';\nimport { extractTaskBinding } from './taskBinding.js';`
);
const androidWake = read('server/androidWake.ts');
if (!androidWake.includes(`androidWakeRouter.post('/recovery-report'`)) {
  write('server/androidWake.ts', androidWake + `\n\nandroidWakeRouter.post('/recovery-report', async (req: Request, res: Response) => {\n  try {\n    const token = readBearer(req);\n    const payload = token ? verifyWakeToken(token) : null;\n    if (!payload) {\n      res.status(401).json({ ok: false, error: 'Invalid or expired Android wake token.' });\n      return;\n    }\n\n    const taskId = String(req.body?.task_id || '').trim();\n    const targetId = String(req.body?.target_id || '').trim();\n    const provider = String(req.body?.provider || '').trim();\n    if (!taskId || !targetId || !provider) {\n      res.status(400).json({ ok: false, error: 'task_id, target_id and provider are required.' });\n      return;\n    }\n\n    const task = await getTask(taskId);\n    if (!task) {\n      res.status(404).json({ ok: false, error: \\`Task \\${taskId} not found.\\` });\n      return;\n    }\n    const binding = extractTaskBinding(String(task.description || '')).binding;\n    if (!binding?.agent_instance_id || binding.agent_instance_id !== targetId) {\n      res.status(403).json({ ok: false, error: 'Recovery report target does not own this task.' });\n      return;\n    }\n    const expectedProvider = task.assignee === 'gemini' ? 'google-ai-studio' : task.assignee === 'chatgpt' ? 'chatgpt' : '';\n    if (!expectedProvider || expectedProvider !== provider) {\n      res.status(403).json({ ok: false, error: 'Recovery report provider does not match task assignee.' });\n      return;\n    }\n    if (task.status === 'completed' || task.status === 'cancelled') {\n      res.json({ ok: true, terminal: true, task });\n      return;\n    }\n    if (task.status === 'blocked') {\n      res.json({ ok: true, idempotent: true, task });\n      return;\n    }\n\n    const report = {\n      source: 'bridge-android-wake',\n      event_id: String(req.body?.event_id || ''),\n      target_id: targetId,\n      provider,\n      reason: String(req.body?.reason || 'bounded-recovery-exhausted'),\n      attempts: Number(req.body?.attempts || 0),\n      reported_at: new Date().toISOString(),\n    };\n    const note = \\`[Android Wake recovery BLOCKED]\\n\\${JSON.stringify(report, null, 2)}\\`;\n    const result = task.result ? \\`\\${task.result}\\n\\n\\${note}\\` : note;\n    const updated = await updateTask(task.id, { status: 'blocked', result }, 'human');\n    res.json({ ok: true, blocked: true, task: updated });\n  } catch (error: any) {\n    res.status(500).json({ ok: false, error: error?.message || String(error) });\n  }\n});\n`);
}

replaceOnce(
  'android/bridge-wake-app/app/src/main/java/com/bridge/wake/WakeService.java',
  `import java.io.InputStreamReader;`,
  `import java.io.InputStreamReader;\nimport java.io.OutputStream;`
);
replaceOnce(
  'android/bridge-wake-app/app/src/main/java/com/bridge/wake/WakeService.java',
  `import java.util.concurrent.ExecutorService;`,
  `import java.util.HashSet;\nimport java.util.Map;\nimport java.util.Set;\nimport java.util.concurrent.ExecutorService;`
);
replaceOnce(
  'android/bridge-wake-app/app/src/main/java/com/bridge/wake/WakeService.java',
  `    public static final String ACTION_STOP = "com.bridge.wake.STOP";\n\n    private static final String BRIDGE_QUEUE_URL = "https://bridge-ai-mission-control.ai.studio/api/android-wake/queue";\n    private static final String WAKE_LOGIC_VERSION = "0.4.9-single-flight-reload-v1";`,
  `    public static final String ACTION_STOP = "com.bridge.wake.STOP";\n    public static final String ACTION_RELOAD_TARGET = "com.bridge.wake.RELOAD_TARGET";\n    public static final String ACTION_REPORT_BLOCKED = "com.bridge.wake.REPORT_BLOCKED";\n\n    private static final String BRIDGE_QUEUE_URL = "https://bridge-ai-mission-control.ai.studio/api/android-wake/queue";\n    private static final String BRIDGE_RECOVERY_URL = "https://bridge-ai-mission-control.ai.studio/api/android-wake/recovery-report";\n    private static final String WAKE_LOGIC_VERSION = "0.5.0-exact-lane-recovery-v2";`
);
replaceOnce(
  'android/bridge-wake-app/app/src/main/java/com/bridge/wake/WakeService.java',
  `    public int onStartCommand(Intent intent, int flags, int startId) {\n        if (intent != null && ACTION_STOP.equals(intent.getAction())) {`,
  `    public int onStartCommand(Intent intent, int flags, int startId) {\n        if (intent != null && ACTION_RELOAD_TARGET.equals(intent.getAction())) {\n            String url = intent.getStringExtra("resource_url");\n            boolean opened = openChrome(url);\n            WakeState.log(this, opened ? "🔄 Recovery · reopen exact target" : "⚠ Recovery · reopen exact target failed");\n            return START_STICKY;\n        }\n        if (intent != null && ACTION_REPORT_BLOCKED.equals(intent.getAction())) {\n            String eventJson = intent.getStringExtra("event_json");\n            String reason = intent.getStringExtra("reason");\n            int attempts = intent.getIntExtra("attempts", 0);\n            reportBlockedAsync(eventJson, reason, attempts);\n            return START_STICKY;\n        }\n        if (intent != null && ACTION_STOP.equals(intent.getAction())) {`
);
replaceOnce(
  'android/bridge-wake-app/app/src/main/java/com/bridge/wake/WakeService.java',
  `            .remove("recovery_last_refresh_at")\n            .apply();`,
  `            .remove("recovery_last_refresh_at")\n            .putString("automation_state", "IDLE")\n            .apply();`
);
replaceOnce(
  'android/bridge-wake-app/app/src/main/java/com/bridge/wake/WakeService.java',
  `                JSONArray events = packet.optJSONArray("events");\n                if (events == null || events.length() == 0) {\n                    clearOrphanPending(prefs, "queue-empty");\n                    updateNotification("Bridge Wake · idle · không có task");\n                    return;\n                }`,
  `                JSONArray events = packet.optJSONArray("events");\n                reconcileWakeGates(prefs, events);\n                if (events == null || events.length() == 0) {\n                    String pendingRaw = prefs.getString("pending_event", "");\n                    if (!isRecoveryOwnedPending(prefs, pendingRaw)) {\n                        clearOrphanPending(prefs, "queue-empty");\n                    }\n                    updateNotification(isRecoveryOwnedPending(prefs, pendingRaw)\n                        ? "Bridge Wake · recovering current task"\n                        : "Bridge Wake · idle · không có task");\n                    return;\n                }`
);
replaceOnce(
  'android/bridge-wake-app/app/src/main/java/com/bridge/wake/WakeService.java',
  `                    boolean stillQueued = !pendingGate.isEmpty() && queueContainsGate(events, pendingGate);\n                    boolean stillFresh = pendingAt > 0 && now - pendingAt < STALE_PENDING_MS;\n                    if (stillQueued && stillFresh) {\n                        // Accessibility owns this live prompt. Never open another task/tab.\n                        return;\n                    }`,
  `                    boolean stillQueued = !pendingGate.isEmpty() && queueContainsGate(events, pendingGate);\n                    boolean stillFresh = pendingAt > 0 && now - pendingAt < STALE_PENDING_MS;\n                    boolean recoveryOwned = isRecoveryOwnedPending(prefs, pendingRaw);\n                    if ((stillQueued || recoveryOwned) && stillFresh) {\n                        // Accessibility owns this live prompt/recovery. Never open another task/tab.\n                        return;\n                    }`
);
replaceOnce(
  'android/bridge-wake-app/app/src/main/java/com/bridge/wake/WakeService.java',
  `                prefs.edit()\n                    .putString("pending_event", selected.toString())\n                    .putLong("pending_opened_at", now)\n                    .putLong(selectedGate, now)\n                    .apply();`,
  `                prefs.edit()\n                    .putString("pending_event", selected.toString())\n                    .putLong("pending_opened_at", now)\n                    .putLong(selectedGate, now)\n                    .putString("automation_state", "OPENING")\n                    .apply();`
);
replaceOnce(
  'android/bridge-wake-app/app/src/main/java/com/bridge/wake/WakeService.java',
  `    private JSONObject fetchQueue(String token) throws Exception {`,
  `    private void reconcileWakeGates(SharedPreferences prefs, JSONArray events) {\n        Set<String> active = new HashSet<>();\n        if (events != null) {\n            for (int i = 0; i < Math.min(events.length(), 100); i++) {\n                JSONObject event = events.optJSONObject(i);\n                if (event == null) continue;\n                String gate = wakeGateKey(event);\n                if (!gate.isEmpty()) active.add(gate);\n            }\n        }\n        SharedPreferences.Editor editor = prefs.edit();\n        boolean changed = false;\n        for (Map.Entry<String, ?> entry : prefs.getAll().entrySet()) {\n            String key = entry.getKey();\n            if (key.startsWith("wake_gate:") && !active.contains(key)) {\n                editor.remove(key);\n                changed = true;\n            }\n        }\n        if (changed) editor.apply();\n    }\n\n    private boolean isRecoveryOwnedPending(SharedPreferences prefs, String pendingRaw) {\n        if (pendingRaw == null || pendingRaw.isEmpty()) return false;\n        String recoveryRaw = prefs.getString("recovery_event", "");\n        if (recoveryRaw == null || recoveryRaw.isEmpty()) return false;\n        try {\n            JSONObject pending = new JSONObject(pendingRaw);\n            JSONObject recovery = new JSONObject(recoveryRaw);\n            String pendingTask = pending.optString("task_id", "");\n            return !pendingTask.isEmpty() && pendingTask.equals(recovery.optString("task_id", ""));\n        } catch (Exception ignored) {\n            return false;\n        }\n    }\n\n    private void reportBlockedAsync(String eventJson, String reason, int attempts) {\n        if (eventJson == null || eventJson.trim().isEmpty()) return;\n        executor.execute(() -> {\n            try {\n                SharedPreferences prefs = getSharedPreferences(WakeState.PREFS, MODE_PRIVATE);\n                String token = prefs.getString("wake_token", "");\n                if (token == null || token.isEmpty()) {\n                    WakeState.log(this, "⚠ Không report blocked được · wake token trống");\n                    return;\n                }\n                JSONObject event = new JSONObject(eventJson);\n                JSONObject body = new JSONObject();\n                body.put("event_id", event.optString("event_id", ""));\n                body.put("task_id", event.optString("task_id", ""));\n                body.put("target_id", event.optString("target_id", ""));\n                body.put("provider", event.optString("provider", ""));\n                body.put("reason", reason == null ? "bounded-recovery-exhausted" : reason);\n                body.put("attempts", attempts);\n                JSONObject response = postRecoveryReport(token, body);\n                if (response.optBoolean("ok", false)) {\n                    WakeState.log(this, "🧱 Đã report Bridge blocked · " + event.optString("task_id", ""));\n                } else {\n                    WakeState.log(this, "⚠ Report blocked lỗi: " + response.optString("error", "unknown"));\n                }\n            } catch (Exception error) {\n                WakeState.log(this, "⚠ Report blocked lỗi: " + error.getMessage());\n            }\n        });\n    }\n\n    private JSONObject postRecoveryReport(String token, JSONObject body) throws Exception {\n        HttpURLConnection connection = (HttpURLConnection) new URL(BRIDGE_RECOVERY_URL).openConnection();\n        connection.setRequestMethod("POST");\n        connection.setConnectTimeout(12_000);\n        connection.setReadTimeout(15_000);\n        connection.setUseCaches(false);\n        connection.setDoOutput(true);\n        connection.setRequestProperty("Accept", "application/json");\n        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");\n        connection.setRequestProperty("Authorization", "Bearer " + token);\n        byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);\n        try (OutputStream output = connection.getOutputStream()) {\n            output.write(bytes);\n        }\n        int status = connection.getResponseCode();\n        InputStream stream = status >= 200 && status < 400 ? connection.getInputStream() : connection.getErrorStream();\n        String responseBody = readAll(stream);\n        connection.disconnect();\n        JSONObject parsed;\n        try {\n            parsed = responseBody == null || responseBody.isEmpty() ? new JSONObject() : new JSONObject(responseBody);\n        } catch (Exception ignored) {\n            parsed = new JSONObject();\n            parsed.put("error", "Invalid JSON from Bridge recovery report");\n        }\n        parsed.put("status", status);\n        if (!parsed.has("ok")) parsed.put("ok", status >= 200 && status < 300);\n        return parsed;\n    }\n\n    private JSONObject fetchQueue(String token) throws Exception {`
);

replaceOnce(
  'android/bridge-wake-app/app/src/main/java/com/bridge/wake/BridgeAccessibilityService.java',
  `import android.accessibilityservice.AccessibilityService;`,
  `import android.accessibilityservice.AccessibilityService;\nimport android.content.Intent;`
);
replaceOnce(
  'android/bridge-wake-app/app/src/main/java/com/bridge/wake/BridgeAccessibilityService.java',
  `    private static final int MAX_HARD_REFRESHES = 2;\n`,
  `    private static final int MAX_HARD_REFRESHES = 2;\n\n    private static final String STATE_IDLE = "IDLE";\n    private static final String STATE_OPENING = "OPENING";\n    private static final String STATE_DISMISS_MODAL = "DISMISS_MODAL";\n    private static final String STATE_FILLING = "FILLING";\n    private static final String STATE_SENDING = "SENDING";\n    private static final String STATE_WAITING_RESULT = "WAITING_RESULT";\n    private static final String STATE_RECOVER_REFRESH = "RECOVER_REFRESH";\n    private static final String STATE_BLOCKED = "BLOCKED";\n`
);
replaceOnce(
  'android/bridge-wake-app/app/src/main/java/com/bridge/wake/BridgeAccessibilityService.java',
  `            JSONObject pending = new JSONObject(raw);\n            String prompt = pending.optString("prompt", "").trim();`,
  `            JSONObject pending = new JSONObject(raw);\n            setAutomationState(STATE_OPENING, pending.optString("task_id", ""));\n            String prompt = pending.optString("prompt", "").trim();`
);
replaceOnce(
  'android/bridge-wake-app/app/src/main/java/com/bridge/wake/BridgeAccessibilityService.java',
  `        if (dismissKnownBlockingModal(root)) {\n            sending = true;`,
  `        if (dismissKnownBlockingModal(root)) {\n            setAutomationState(STATE_DISMISS_MODAL, pending.optString("task_id", ""));\n            sending = true;`
);
replaceOnce(
  'android/bridge-wake-app/app/src/main/java/com/bridge/wake/BridgeAccessibilityService.java',
  `        Bundle args = new Bundle();`,
  `        setAutomationState(STATE_FILLING, pending.optString("task_id", ""));\n        Bundle args = new Bundle();`
);
replaceOnce(
  'android/bridge-wake-app/app/src/main/java/com/bridge/wake/BridgeAccessibilityService.java',
  `        sending = true;\n        handler.postDelayed(() -> finishSend(pending), 650L);`,
  `        setAutomationState(STATE_SENDING, pending.optString("task_id", ""));\n        sending = true;\n        handler.postDelayed(() -> finishSend(pending), 650L);`
);
replaceOnce(
  'android/bridge-wake-app/app/src/main/java/com/bridge/wake/BridgeAccessibilityService.java',
  `    private void finishSend(JSONObject pending) {\n        try {`,
  `    private void finishSend(JSONObject pending) {\n        setAutomationState(STATE_SENDING, pending.optString("task_id", ""));\n        try {`
);
replaceOnce(
  'android/bridge-wake-app/app/src/main/java/com/bridge/wake/BridgeAccessibilityService.java',
  `        WakeState.log(this, "✅ Đã xác nhận Send " + pending.optString("provider") + " · " + pending.optString("task_id"));`,
  `        setAutomationState(STATE_WAITING_RESULT, pending.optString("task_id", ""));\n        WakeState.log(this, "✅ Đã xác nhận Send " + pending.optString("provider") + " · " + pending.optString("task_id"));`
);
replaceOnce(
  'android/bridge-wake-app/app/src/main/java/com/bridge/wake/BridgeAccessibilityService.java',
  `        if (refreshes >= MAX_HARD_REFRESHES) {\n            String taskId = "";\n            try { taskId = new JSONObject(raw).optString("task_id", ""); } catch (Exception ignored) { }\n            WakeState.log(this, "⛔ Studio vẫn lỗi sau " + MAX_HARD_REFRESHES + " reload · dừng recovery" + (taskId.isEmpty() ? "" : " · " + taskId));\n            clearRecovery("circuit-breaker");\n            return;\n        }`,
  `        if (refreshes >= MAX_HARD_REFRESHES) {\n            String taskId = "";\n            try { taskId = new JSONObject(raw).optString("task_id", ""); } catch (Exception ignored) { }\n            setAutomationState(STATE_BLOCKED, taskId);\n            requestRecoveryBlocked(raw, refreshes, "studio-internal-error-circuit-breaker");\n            WakeState.log(this, "⛔ Studio vẫn lỗi sau " + MAX_HARD_REFRESHES + " reload · mark blocked" + (taskId.isEmpty() ? "" : " · " + taskId));\n            clearRecovery("circuit-breaker");\n            return;\n        }`
);
replaceRange(
  'android/bridge-wake-app/app/src/main/java/com/bridge/wake/BridgeAccessibilityService.java',
  `        AccessibilityNodeInfo refresh = findChromeRefreshButton(root);`,
  `    private AccessibilityNodeInfo findChromeRefreshButton`,
  `        JSONObject pending;\n        try {\n            pending = new JSONObject(raw);\n            prefs.edit()\n                .putString("pending_event", pending.toString())\n                .putLong("pending_opened_at", now)\n                .putInt("recovery_refresh_count", refreshes + 1)\n                .putLong("recovery_last_refresh_at", now)\n                .apply();\n        } catch (Exception error) {\n            WakeState.log(this, "⚠ Không khôi phục được task trước reload: " + error.getMessage());\n            return;\n        }\n\n        setAutomationState(STATE_RECOVER_REFRESH, pending.optString("task_id", ""));\n        AccessibilityNodeInfo refresh = findChromeRefreshButton(root);\n        boolean reloaded = refresh != null && refresh.performAction(AccessibilityNodeInfo.ACTION_CLICK);\n        if (!reloaded) {\n            reloaded = requestExactTargetReload(pending);\n        }\n\n        if (reloaded) {\n            WakeState.log(this, "🔄 Studio internal error · reload exact target " + (refreshes + 1) + "/" + MAX_HARD_REFRESHES + " · giữ nguyên task");\n        } else {\n            prefs.edit().remove("pending_event").remove("pending_opened_at").apply();\n            setAutomationState(STATE_BLOCKED, pending.optString("task_id", ""));\n            requestRecoveryBlocked(raw, refreshes + 1, "reload-action-unavailable");\n            clearRecovery("reload-action-unavailable");\n            WakeState.log(this, "⛔ Không reload được exact target · mark blocked");\n        }\n    }\n\n`
);
replaceOnce(
  'android/bridge-wake-app/app/src/main/java/com/bridge/wake/BridgeAccessibilityService.java',
  `    private void clearPending(String reason) {`,
  `    private void setAutomationState(String state, String taskId) {\n        getSharedPreferences(PREFS, MODE_PRIVATE)\n            .edit()\n            .putString("automation_state", state)\n            .putString("automation_task_id", taskId == null ? "" : taskId)\n            .apply();\n    }\n\n    private boolean requestExactTargetReload(JSONObject pending) {\n        String url = pending.optString("resource_url", "").trim();\n        if (url.isEmpty()) return false;\n        try {\n            Intent intent = new Intent(this, WakeService.class);\n            intent.setAction(WakeService.ACTION_RELOAD_TARGET);\n            intent.putExtra("resource_url", url);\n            startService(intent);\n            return true;\n        } catch (Exception error) {\n            WakeState.log(this, "⚠ Exact target reload lỗi: " + error.getMessage());\n            return false;\n        }\n    }\n\n    private void requestRecoveryBlocked(String eventJson, int attempts, String reason) {\n        try {\n            Intent intent = new Intent(this, WakeService.class);\n            intent.setAction(WakeService.ACTION_REPORT_BLOCKED);\n            intent.putExtra("event_json", eventJson);\n            intent.putExtra("attempts", attempts);\n            intent.putExtra("reason", reason);\n            startService(intent);\n        } catch (Exception error) {\n            WakeState.log(this, "⚠ Không gửi được blocked report: " + error.getMessage());\n        }\n    }\n\n    private void clearPending(String reason) {`
);
replaceOnce(
  'android/bridge-wake-app/app/src/main/java/com/bridge/wake/BridgeAccessibilityService.java',
  `        WakeState.log(this, "🧹 Xóa wake pending: " + reason);`,
  `        if (getSharedPreferences(PREFS, MODE_PRIVATE).getString("recovery_event", "").isEmpty()) {\n            setAutomationState(STATE_IDLE, "");\n        }\n        WakeState.log(this, "🧹 Xóa wake pending: " + reason);`
);

replaceOnce(
  'android/bridge-wake-app/app/build.gradle',
  `        versionCode 13\n        versionName '0.4.9'`,
  `        versionCode 14\n        versionName '0.5.0'`
);
replaceOnce(
  'android/bridge-wake-app/app/build.gradle',
  `// Build stamp: v0.4.9 single-flight queue + verified send + bounded Chrome reload recovery.`,
  `// Build stamp: v0.5.0 exact-target single-flight + stateful bounded reload recovery + Bridge blocker reporting.`
);

write('tests/singleFlight.test.ts', `import assert from 'node:assert';
import type { Task } from '../src/types.js';
import { attachTaskBinding } from '../server/taskBinding.js';
import { exactLaneBlocker, filterClaimableSingleFlight } from '../server/singleFlight.js';

function makeTask(id: string, status: Task['status'], created_at: string, instance: string | null): Task {
  const description = instance
    ? attachTaskBinding('single-flight test', {
        version: 1,
        workspace_id: 'workspace-proj-default',
        project_id: 'proj-default',
        agent_instance_id: instance,
      }).description
    : 'legacy unbound test';
  return {
    id,
    title: id,
    description,
    priority: 'high',
    status,
    assignee: 'gemini',
    created_by: 'chatgpt',
    created_at,
    updated_at: created_at,
    related_files: [],
    related_finding: null,
    result: null,
  };
}

const first = makeTask('TASK-1001', 'working', '2026-09-04T00:00:00.000Z', 'studio-a');
const second = makeTask('TASK-1002', 'assigned', '2026-09-04T00:01:00.000Z', 'studio-a');
const otherLane = makeTask('TASK-1003', 'assigned', '2026-09-04T00:02:00.000Z', 'studio-b');
const legacy = makeTask('TASK-1004', 'assigned', '2026-09-04T00:03:00.000Z', null);

const openTasks = [first, second, otherLane, legacy];
assert.strictEqual(exactLaneBlocker(second, openTasks)?.id, first.id, 'later task must see the active exact-target blocker');
assert.deepStrictEqual(
  filterClaimableSingleFlight(openTasks, 'gemini').map(task => task.id).sort(),
  [legacy.id, otherLane.id].sort(),
  'busy exact lane must withhold its later task while independent/legacy lanes remain claimable'
);

const completedFirst = { ...first, status: 'completed' as const };
const afterTerminal = [completedFirst, second, otherLane, legacy];
assert.strictEqual(exactLaneBlocker(second, afterTerminal), null, 'completed predecessor must release exact lane');
assert.ok(filterClaimableSingleFlight(afterTerminal, 'gemini').some(task => task.id === second.id), 'next task becomes claimable after terminal predecessor');

const blockedFirst = { ...first, status: 'blocked' as const };
assert.strictEqual(exactLaneBlocker(second, [blockedFirst, second])?.id, first.id, 'blocked is non-terminal and must keep lane busy');

console.log('✓ exact-target single-flight helper tests passed');
`);

replaceOnce(
  'package.json',
  `tsx tests/resourceRegistry.test.ts && tsx tests/wakeQueue.test.ts`,
  `tsx tests/resourceRegistry.test.ts && tsx tests/singleFlight.test.ts && tsx tests/wakeQueue.test.ts`
);

console.log('Bridge single-flight + recovery hotfix applied successfully.');
