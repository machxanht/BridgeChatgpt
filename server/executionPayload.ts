export type ExecutionMode = 'chatgpt_primary' | 'studio_primary' | 'studio_tooling' | 'shared';

export type WorkspaceInputArtifact = {
  path: string;
  operation: 'create' | 'update' | 'delete';
  content?: string;
  base_sha?: string | null;
};

export type StudioExecutionPayload = {
  version: 1;
  mode: ExecutionMode;
  instructions?: string;
  artifacts: WorkspaceInputArtifact[];
  requested_checks: string[];
};

const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
const MAX_ARTIFACT_COUNT = 100;
const MAX_PATH_LENGTH = 300;
const MAX_INSTRUCTIONS_LENGTH = 20_000;
const MAX_CHECK_COUNT = 20;
const MAX_CHECK_LENGTH = 300;
const VALID_SHA = /^[0-9a-f]{40}$/i;
const START_MARKER = '<!-- BRIDGE_EXECUTION_PAYLOAD_V1\n';
const END_MARKER = '\nBRIDGE_EXECUTION_PAYLOAD_V1 -->';

const BLOCKED_EXACT = new Set([
  '.env', '.npmrc', '.netrc', 'credentials.json', 'service-account.json',
  'id_rsa', 'id_ed25519', 'data/bridge.sqlite',
]);
const BLOCKED_PREFIXES = ['.git/', 'data/', 'node_modules/', 'bridge-bus/inbox/', 'bridge-bus/outbox/'];
const BLOCKED_SUFFIXES = ['.pem', '.key', '.p12', '.pfx'];

function safePath(value: string): boolean {
  if (!value || value.length > MAX_PATH_LENGTH || value.startsWith('/') || value.includes('\\') || value.includes('\0')) return false;
  const segments = value.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return false;
  const lower = value.toLowerCase();
  if (BLOCKED_EXACT.has(lower)) return false;
  if (lower.startsWith('.env.')) return false;
  if (BLOCKED_PREFIXES.some((prefix) => lower.startsWith(prefix))) return false;
  if (BLOCKED_SUFFIXES.some((suffix) => lower.endsWith(suffix))) return false;
  return true;
}

function normalizeArtifact(item: any): WorkspaceInputArtifact {
  return {
    path: String(item?.path || '').trim(),
    operation: item?.operation,
    content: typeof item?.content === 'string' ? item.content : undefined,
    base_sha: item?.base_sha === null ? null : typeof item?.base_sha === 'string' ? item.base_sha.trim() : undefined,
  } as WorkspaceInputArtifact;
}

export function normalizeExecutionPayload(value: unknown): StudioExecutionPayload {
  const raw = (value && typeof value === 'object') ? value as any : {};
  const mode: ExecutionMode = ['chatgpt_primary', 'studio_primary', 'studio_tooling', 'shared'].includes(raw.mode)
    ? raw.mode
    : 'shared';
  const artifacts = Array.isArray(raw.artifacts) ? raw.artifacts.map(normalizeArtifact) : [];
  const requested_checks = Array.isArray(raw.requested_checks)
    ? raw.requested_checks.map((item: unknown) => String(item).trim()).filter(Boolean)
    : [];

  return {
    version: 1,
    mode,
    instructions: typeof raw.instructions === 'string' ? raw.instructions.trim() : undefined,
    artifacts,
    requested_checks,
  };
}

export function validateExecutionPayload(payload: StudioExecutionPayload): string | null {
  if (payload.version !== 1) return 'execution payload version must be 1';
  if (payload.instructions && payload.instructions.length > MAX_INSTRUCTIONS_LENGTH) return `instructions exceed ${MAX_INSTRUCTIONS_LENGTH} characters`;
  if (payload.artifacts.length > MAX_ARTIFACT_COUNT) return `artifact count exceeds ${MAX_ARTIFACT_COUNT}`;
  if (payload.requested_checks.length > MAX_CHECK_COUNT) return `requested check count exceeds ${MAX_CHECK_COUNT}`;
  if (payload.requested_checks.some((check) => check.length > MAX_CHECK_LENGTH)) return `requested check exceeds ${MAX_CHECK_LENGTH} characters`;

  const seen = new Set<string>();
  for (const artifact of payload.artifacts) {
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
      if (!artifact.base_sha || !VALID_SHA.test(artifact.base_sha)) return `update artifact ${artifact.path} requires a 40-character Git blob SHA`;
    }
    if (artifact.operation === 'delete') {
      if (artifact.content !== undefined) return `delete artifact ${artifact.path} must omit content`;
      if (!artifact.base_sha || !VALID_SHA.test(artifact.base_sha)) return `delete artifact ${artifact.path} requires a 40-character Git blob SHA`;
    }
  }

  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PAYLOAD_BYTES) return `execution payload exceeds ${MAX_PAYLOAD_BYTES} bytes`;
  if (!payload.instructions && payload.artifacts.length === 0 && payload.requested_checks.length === 0) return 'execution payload must contain instructions, artifacts, or requested checks';
  return null;
}

export function attachExecutionPayload(description: string, value: unknown): { description: string; payload: StudioExecutionPayload } {
  const payload = normalizeExecutionPayload(value);
  const error = validateExecutionPayload(payload);
  if (error) throw new Error(`Invalid execution_payload: ${error}`);
  const cleanDescription = extractExecutionPayload(description).description.trim();
  return {
    description: `${cleanDescription}\n\n${START_MARKER}${JSON.stringify(payload)}${END_MARKER}`,
    payload,
  };
}

export function extractExecutionPayload(description: string): { description: string; payload: StudioExecutionPayload | null } {
  const start = description.indexOf(START_MARKER);
  if (start < 0) return { description, payload: null };
  const end = description.indexOf(END_MARKER, start + START_MARKER.length);
  if (end < 0) return { description, payload: null };

  const encoded = description.slice(start + START_MARKER.length, end);
  const cleanDescription = `${description.slice(0, start)}${description.slice(end + END_MARKER.length)}`.trim();
  try {
    const payload = normalizeExecutionPayload(JSON.parse(encoded));
    const error = validateExecutionPayload(payload);
    if (error) return { description: cleanDescription, payload: null };
    return { description: cleanDescription, payload };
  } catch {
    return { description: cleanDescription, payload: null };
  }
}

export const studioInputContract = {
  version: 1,
  purpose: 'Carry ChatGPT-authored workspace changes and execution instructions to Google AI Studio.',
  modes: ['chatgpt_primary', 'studio_primary', 'studio_tooling', 'shared'],
  artifact_format: {
    path: 'relative/path',
    operation: 'create|update|delete',
    content: 'full UTF-8 content for create/update; omit for delete',
    base_sha: 'null for create; exact Git blob SHA for update/delete',
  },
  workspace_safety: [
    'For update/delete, compute the Git blob SHA of the current workspace file before editing and compare it to base_sha.',
    'If the workspace content does not match base_sha, do not overwrite it; report the task as blocked with the mismatch.',
    'For create, do not overwrite an existing file; block instead.',
    'Apply only the listed artifacts when mode is chatgpt_primary unless instructions explicitly delegate additional lightweight edits.',
    'Run requested_checks after applying changes and return logs/results through Studio Relay.',
  ],
  max_artifacts: MAX_ARTIFACT_COUNT,
  max_payload_bytes: MAX_PAYLOAD_BYTES,
};
