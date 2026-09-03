import fs from 'node:fs';

const path = '.github/scripts/apply-single-flight-recovery-hotfix.mjs';
let source = fs.readFileSync(path, 'utf8');
const startMarker = "const androidWake = read('server/androidWake.ts');";
const endMarker = "\n\nreplaceOnce(\n  'android/bridge-wake-app/app/src/main/java/com/bridge/wake/WakeService.java'";
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('androidWake generator block markers not found');

const routeLines = [
  "androidWakeRouter.post('/recovery-report', async (req: Request, res: Response) => {",
  "  try {",
  "    const token = readBearer(req);",
  "    const payload = token ? verifyWakeToken(token) : null;",
  "    if (!payload) {",
  "      res.status(401).json({ ok: false, error: 'Invalid or expired Android wake token.' });",
  "      return;",
  "    }",
  "",
  "    const taskId = String(req.body?.task_id || '').trim();",
  "    const targetId = String(req.body?.target_id || '').trim();",
  "    const provider = String(req.body?.provider || '').trim();",
  "    if (!taskId || !targetId || !provider) {",
  "      res.status(400).json({ ok: false, error: 'task_id, target_id and provider are required.' });",
  "      return;",
  "    }",
  "",
  "    const task = await getTask(taskId);",
  "    if (!task) {",
  "      res.status(404).json({ ok: false, error: 'Task ' + taskId + ' not found.' });",
  "      return;",
  "    }",
  "    const binding = extractTaskBinding(String(task.description || '')).binding;",
  "    if (!binding?.agent_instance_id || binding.agent_instance_id !== targetId) {",
  "      res.status(403).json({ ok: false, error: 'Recovery report target does not own this task.' });",
  "      return;",
  "    }",
  "    const expectedProvider = task.assignee === 'gemini' ? 'google-ai-studio' : task.assignee === 'chatgpt' ? 'chatgpt' : '';",
  "    if (!expectedProvider || expectedProvider !== provider) {",
  "      res.status(403).json({ ok: false, error: 'Recovery report provider does not match task assignee.' });",
  "      return;",
  "    }",
  "    if (task.status === 'completed' || task.status === 'cancelled') {",
  "      res.json({ ok: true, terminal: true, task });",
  "      return;",
  "    }",
  "    if (task.status === 'blocked') {",
  "      res.json({ ok: true, idempotent: true, task });",
  "      return;",
  "    }",
  "",
  "    const report = {",
  "      source: 'bridge-android-wake',",
  "      event_id: String(req.body?.event_id || ''),",
  "      target_id: targetId,",
  "      provider,",
  "      reason: String(req.body?.reason || 'bounded-recovery-exhausted'),",
  "      attempts: Number(req.body?.attempts || 0),",
  "      reported_at: new Date().toISOString(),",
  "    };",
  "    const note = '[Android Wake recovery BLOCKED]\\n' + JSON.stringify(report, null, 2);",
  "    const result = task.result ? task.result + '\\n\\n' + note : note;",
  "    const updated = await updateTask(task.id, { status: 'blocked', result }, 'human');",
  "    res.json({ ok: true, blocked: true, task: updated });",
  "  } catch (error: any) {",
  "    res.status(500).json({ ok: false, error: error?.message || String(error) });",
  "  }",
  "});",
];

const replacement = [
  "const androidWake = read('server/androidWake.ts');",
  "if (!androidWake.includes(\"androidWakeRouter.post('/recovery-report'\")) {",
  "  const recoveryRoute = " + JSON.stringify(routeLines.join('\n')) + ";",
  "  write('server/androidWake.ts', androidWake + '\\n\\n' + recoveryRoute + '\\n');",
  "}",
].join('\n');

source = source.slice(0, start) + replacement + source.slice(end);
// Emit target-code interpolations literally instead of evaluating them in this generator.
source = source.replaceAll('\\\\${', '\\${');

// `Bundle args = new Bundle()` appears more than once in the Accessibility service.
// Scope the FILLING-state insertion to the SET_TEXT block so deterministic patching
// still fails closed everywhere else.
const oldFillPatch = [
  "replaceOnce(",
  "  'android/bridge-wake-app/app/src/main/java/com/bridge/wake/BridgeAccessibilityService.java',",
  "  `        Bundle args = new Bundle();`,",
  "  `        setAutomationState(STATE_FILLING, pending.optString(\"task_id\", \"\"));\\n        Bundle args = new Bundle();`",
  ");",
].join('\n');
const newFillPatch = [
  "replaceOnce(",
  "  'android/bridge-wake-app/app/src/main/java/com/bridge/wake/BridgeAccessibilityService.java',",
  "  `        Bundle args = new Bundle();\\n        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, prompt);`,",
  "  `        setAutomationState(STATE_FILLING, pending.optString(\"task_id\", \"\"));\\n        Bundle args = new Bundle();\\n        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, prompt);`",
  ");",
].join('\n');
if (!source.includes(oldFillPatch)) throw new Error('FILLING patch block not found in generator');
source = source.replace(oldFillPatch, newFillPatch);

fs.writeFileSync(path, source, 'utf8');
console.log('hotfix generator quoting/interpolation/Android marker repaired');
