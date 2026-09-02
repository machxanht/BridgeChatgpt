import { Router, Request, Response } from 'express';
import {
  claimNextTask,
  createMessage,
  getTask,
  getWorkflowStateForAgent,
  recordHeartbeat,
  setAgentStatus,
  updateTask,
} from './db.js';
import { extractExecutionPayload, studioInputContract } from './executionPayload.js';

/** REST relay for Google AI Studio Build mode. Bridge never calls Gemini here. */
export const studioRelayRouter = Router();

type ChangedFileArtifact = {
  path: string;
  operation: 'create' | 'update' | 'delete';
  content?: string;
  base_sha?: string | null;
};

const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024;
const MAX_ARTIFACT_COUNT = 100;
const MAX_PATH_LENGTH = 300;
const VALID_SHA = /^[0-9a-f]{40}$/i;
const BLOCKED_EXACT = new Set([
  '.env', '.npmrc', '.netrc', 'credentials.json', 'service-account.json',
  'id_rsa', 'id_ed25519', 'data/bridge.sqlite',
]);
const BLOCKED_PREFIXES = ['.git/', 'data/', 'node_modules/', 'bridge-bus/inbox/', 'bridge-bus/outbox/'];
const BLOCKED_SUFFIXES = ['.pem', '.key', '.p12', '.pfx'];

function safePath(value: string): boolean {
  if (!value || value.length > MAX_PATH_LENGTH || value.startsWith('/') || value.includes('\\') || value.includes('\0')) return false;
  const segments = value.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) return false;
  const lower = value.toLowerCase();
  if (BLOCKED_EXACT.has(lower)) return false;
  if (lower.startsWith('.env.')) return false;
  if (BLOCKED_PREFIXES.some(prefix => lower.startsWith(prefix))) return false;
  if (BLOCKED_SUFFIXES.some(suffix => lower.endsWith(suffix))) return false;
  return true;
}

function normalizeArtifacts(value: unknown): ChangedFileArtifact[] {
  if (!Array.isArray(value)) return [];
  return value.map((item: any) => ({
    path: String(item?.path || '').trim(),
    operation: item?.operation,
    content: typeof item?.content === 'string' ? item.content : undefined,
    base_sha: item?.base_sha === null ? null : typeof item?.base_sha === 'string' ? item.base_sha.trim() : undefined,
  })).filter(item => safePath(item.path)) as ChangedFileArtifact[];
}

function validateArtifacts(artifacts: ChangedFileArtifact[]): string | null {
  if (artifacts.length > MAX_ARTIFACT_COUNT) return `artifact count exceeds ${MAX_ARTIFACT_COUNT}`;
  const seen = new Set<string>();
  for (const artifact of artifacts) {
    if (!safePath(artifact.path)) return `artifact path is not allowed: ${artifact.path}`;
    if (seen.has(artifact.path)) return `duplicate artifact path: ${artifact.path}`;
    seen.add(artifact.path);
    if (!['create', 'update', 'delete'].includes(artifact.operation)) return `artifact ${artifact.path} requires operation create, update, or delete`;
    if (artifact.operation === 'create') {
      if (artifact.content === undefined) return `create artifact ${artifact.path} requires full content`;
      if (artifact.base_sha !== null) return `create artifact ${artifact.path} requires base_sha: null`;
    }
    if (artifact.operation === 'update') {
      if (artifact.content === undefined) return `update artifact ${artifact.path} requires full content`;
      if (!artifact.base_sha || !VALID_SHA.test(artifact.base_sha)) return `update artifact ${artifact.path} requires the 40-character Git blob SHA read before editing`;
    }
    if (artifact.operation === 'delete') {
      if (artifact.content !== undefined) return `delete artifact ${artifact.path} must omit content`;
      if (!artifact.base_sha || !VALID_SHA.test(artifact.base_sha)) return `delete artifact ${artifact.path} requires the 40-character Git blob SHA read before deleting`;
    }
  }
  return null;
}

const resultContract = {
  review_requires_artifacts: true,
  conflict_safe: true,
  protected_paths: ['.env*', '.git/**', 'data/**', 'node_modules/**', 'bridge-bus/inbox/**', 'bridge-bus/outbox/**', 'credential/private-key files'],
  artifact_format: {
    path: 'relative/path',
    operation: 'create|update|delete',
    content: 'full UTF-8 content for create/update; omit for delete',
    base_sha: 'null for create; exact 40-char Git blob SHA of the source file for update/delete',
  },
  rules: [
    'Submit every changed text file exactly once.',
    'Before updating/deleting an existing file, read its Git blob SHA and return it as base_sha.',
    'For a new file, return base_sha: null.',
    'Never submit secrets, runtime data, command-bus files, Git internals, dependency trees, or private keys as artifacts.',
    'Do not git push. ChatGPT will compare base_sha with current GitHub before applying artifacts.',
    'When a ChatGPT execution payload was supplied, return the final workspace form of every file changed by that task.',
  ],
  max_artifacts: MAX_ARTIFACT_COUNT,
  max_payload_bytes: MAX_ARTIFACT_BYTES,
};

function prepareTaskForStudio(task: any) {
  if (!task) return { task: null, execution_payload: null };
  const parsed = extractExecutionPayload(String(task.description || ''));
  return {
    task: { ...task, description: parsed.description },
    execution_payload: parsed.payload,
  };
}

studioRelayRouter.get('/state', async (_req: Request, res: Response) => {
  try {
    const state = await getWorkflowStateForAgent('gemini');
    res.json({
      ok: true,
      executor: 'google-ai-studio',
      input_contract: studioInputContract,
      result_contract: resultContract,
      ...state,
    });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

studioRelayRouter.get('/input/:task_id', async (req: Request, res: Response) => {
  try {
    const task = await getTask(req.params.task_id);
    if (!task) { res.status(404).json({ ok: false, error: `Task ${req.params.task_id} not found` }); return; }
    if (task.assignee !== 'gemini') { res.status(403).json({ ok: false, error: `Task ${task.id} is not assigned to Gemini/Studio` }); return; }
    const prepared = prepareTaskForStudio(task);
    res.json({
      ok: true,
      input_contract: studioInputContract,
      task: prepared.task,
      execution_payload: prepared.execution_payload,
    });
  } catch (err: any) { res.status(400).json({ ok: false, error: err.message }); }
});

studioRelayRouter.post('/heartbeat', async (req: Request, res: Response) => {
  try { const heartbeat = await recordHeartbeat({ agent: 'gemini', task_id: req.body?.task_id ?? null, status: req.body?.status || 'idle', message: req.body?.message || 'Google AI Studio relay active' }); res.json({ ok: true, heartbeat }); }
  catch (err: any) { res.status(400).json({ ok: false, error: err.message }); }
});

studioRelayRouter.post('/claim', async (_req: Request, res: Response) => {
  try {
    await recordHeartbeat({ agent: 'gemini', status: 'idle', message: 'Google AI Studio checking for work' });
    const claim = await claimNextTask('gemini');
    const prepared = prepareTaskForStudio(claim.task);
    res.json({
      ok: true,
      input_contract: studioInputContract,
      result_contract: resultContract,
      ...claim,
      task: prepared.task,
      execution_payload: prepared.execution_payload,
    });
  } catch (err: any) { res.status(400).json({ ok: false, error: err.message }); }
});

studioRelayRouter.post('/progress', async (req: Request, res: Response) => {
  try {
    const { task_id, stage, message } = req.body || {};
    if (!task_id) { res.status(400).json({ ok: false, error: 'task_id is required' }); return; }
    const task = await getTask(task_id);
    if (!task) { res.status(404).json({ ok: false, error: `Task ${task_id} not found` }); return; }
    if (task.assignee !== 'gemini' || !['working', 'blocked'].includes(task.status)) { res.status(409).json({ ok: false, error: `Task ${task_id} is not actively owned by Gemini` }); return; }
    const allowedStages = new Set(['inspecting', 'editing', 'testing', 'submitting', 'working', 'blocked']);
    const normalizedStage = allowedStages.has(stage) ? stage : 'working';
    const status = normalizedStage === 'blocked' ? 'blocked' : 'working';
    const agentStatus = await setAgentStatus({ agent: 'gemini', status, current_task_id: task_id, message: message || `AI Studio stage: ${normalizedStage}` });
    res.json({ ok: true, task_id, stage: normalizedStage, agent_status: agentStatus });
  } catch (err: any) { res.status(400).json({ ok: false, error: err.message }); }
});

studioRelayRouter.post('/result', async (req: Request, res: Response) => {
  try {
    const { task_id, summary, tests, files_changed, artifacts: rawArtifacts, blocked } = req.body || {};
    if (!task_id || !summary) { res.status(400).json({ ok: false, error: 'task_id and summary are required' }); return; }
    const task = await getTask(task_id);
    if (!task) { res.status(404).json({ ok: false, error: `Task ${task_id} not found` }); return; }
    if (task.assignee !== 'gemini' || !['working', 'blocked'].includes(task.status)) { res.status(409).json({ ok: false, error: `Task ${task_id} cannot accept a Studio result from status ${task.status}` }); return; }
    if (Array.isArray(rawArtifacts) && rawArtifacts.length > MAX_ARTIFACT_COUNT) { res.status(413).json({ ok: false, error: `artifact count exceeds ${MAX_ARTIFACT_COUNT}` }); return; }
    const artifacts = normalizeArtifacts(rawArtifacts);
    if (Array.isArray(rawArtifacts) && artifacts.length !== rawArtifacts.length) { res.status(400).json({ ok: false, error: 'one or more artifact paths are unsafe or protected' }); return; }
    if (!blocked && artifacts.length === 0) { res.status(400).json({ ok: false, error: 'artifacts are required before review; Git push is not required.' }); return; }
    const artifactError = validateArtifacts(artifacts);
    if (artifactError) { res.status(400).json({ ok: false, error: artifactError }); return; }

    const resultObject = { executor: 'google-ai-studio', summary, tests: tests ?? null, files_changed: Array.isArray(files_changed) ? files_changed : artifacts.map(a => a.path), artifacts, conflict_policy: 'ChatGPT must compare each base_sha with current GitHub before create/update/delete', submitted_at: new Date().toISOString() };
    const resultPayload = JSON.stringify(resultObject, null, 2);
    if (Buffer.byteLength(resultPayload, 'utf8') > MAX_ARTIFACT_BYTES) { res.status(413).json({ ok: false, error: `result payload exceeds ${MAX_ARTIFACT_BYTES} bytes` }); return; }

    const updated = await updateTask(task_id, { status: blocked ? 'blocked' : 'review', result: resultPayload }, 'gemini');
    await setAgentStatus({ agent: 'gemini', status: blocked ? 'blocked' : 'idle', current_task_id: blocked ? task_id : null, message: blocked ? `AI Studio blocked on ${task_id}` : `AI Studio submitted conflict-safe artifacts for ${task_id}` });
    await createMessage({ from: 'gemini', to: 'chatgpt', type: 'review_request', content: blocked ? `AI Studio blocked on ${task_id}` : `${task_id} has conflict-safe artifacts ready. Compare base_sha with GitHub before applying.`, task_id, finding_id: null });
    res.json({ ok: true, task: updated, artifact_count: artifacts.length, conflict_safe: true });
  } catch (err: any) { res.status(400).json({ ok: false, error: err.message }); }
});

studioRelayRouter.post('/message', async (req: Request, res: Response) => {
  try {
    const { content, task_id, finding_id, type } = req.body || {};
    if (!content) { res.status(400).json({ ok: false, error: 'content is required' }); return; }
    const message = await createMessage({ from: 'gemini', to: 'chatgpt', type: type || 'handoff', content, task_id: task_id || null, finding_id: finding_id || null });
    res.status(201).json({ ok: true, message });
  } catch (err: any) { res.status(400).json({ ok: false, error: err.message }); }
});
