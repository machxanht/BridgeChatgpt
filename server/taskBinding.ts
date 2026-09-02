export interface TaskBinding {
  version: 1;
  workspace_id: string;
  project_id: string;
  agent_instance_id?: string | null;
}

const START = '<!-- BRIDGE_TASK_BINDING_V1';
const END = 'BRIDGE_TASK_BINDING_V1 -->';
const SAFE_ID = /^[a-zA-Z0-9._-]{1,120}$/;

function safeId(name: string, value: unknown, required = true): string | null {
  const normalized = String(value || '').trim();
  if (!normalized && !required) return null;
  if (!SAFE_ID.test(normalized)) throw new Error(`${name} is invalid`);
  return normalized;
}

export function normalizeTaskBinding(value: unknown): TaskBinding | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  return {
    version: 1,
    workspace_id: safeId('workspace_id', raw.workspace_id)!,
    project_id: safeId('project_id', raw.project_id)!,
    agent_instance_id: safeId('agent_instance_id', raw.agent_instance_id, false),
  };
}

export function attachTaskBinding(description: string, value: unknown): { description: string; binding: TaskBinding | null } {
  const binding = normalizeTaskBinding(value);
  if (!binding) return { description, binding: null };
  const cleaned = extractTaskBinding(description).description;
  return {
    description: `${cleaned.trim()}\n\n${START}\n${JSON.stringify(binding)}\n${END}`,
    binding,
  };
}

export function extractTaskBinding(description: string): { description: string; binding: TaskBinding | null } {
  const source = String(description || '');
  const start = source.indexOf(START);
  if (start < 0) return { description: source, binding: null };
  const end = source.indexOf(END, start + START.length);
  if (end < 0) return { description: source, binding: null };
  const payloadText = source.slice(start + START.length, end).trim();
  let binding: TaskBinding | null = null;
  try {
    binding = normalizeTaskBinding(JSON.parse(payloadText));
  } catch {
    binding = null;
  }
  const cleaned = `${source.slice(0, start)}${source.slice(end + END.length)}`.trim();
  return { description: cleaned, binding };
}

export function taskMatchesBinding(description: string, workspaceId: string, projectId: string, instanceId?: string | null): boolean {
  const binding = extractTaskBinding(description).binding;
  if (!binding) return true; // legacy tasks belong to the default/legacy lane
  if (binding.workspace_id !== workspaceId || binding.project_id !== projectId) return false;
  if (binding.agent_instance_id && binding.agent_instance_id !== instanceId) return false;
  return true;
}
