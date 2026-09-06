import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function completeChat({ taskId, answer, checkOnly = false, request }) {
  if (!/^TASK-\d+$/.test(taskId)) throw new Error('Invalid task ID');
  if (!checkOnly && (typeof answer !== 'string' || !answer.trim())) throw new Error('Answer is required');
  const endpoint = `/api/tasks/${taskId}`;
  const task = await request(endpoint);
  if (!/<!-- BRIDGE_(CHAT|DEBATE)_V1 -->/.test(task.description)) throw new Error('Only chat/discussion tasks are allowed');
  if (checkOnly) return { ok: true, task_id: taskId, status: task.status };
  if (task.status === 'completed') return { ok: true, task_id: taskId, already_completed: true };
  if (task.status === 'cancelled') throw new Error('Task was cancelled');
  const updated = await request(endpoint, { status: 'completed', result: answer, agent: 'chatgpt' });
  if (updated.status !== 'completed' || updated.result !== answer) throw new Error('Completion could not be verified');
  return { ok: true, task_id: taskId, status: 'completed' };
}

async function main() {
  const [taskId, encoded, filePath] = process.argv.slice(2);
  const checkOnly = encoded === '--check';
  const fileMode = encoded === '--file';
  if (!/^TASK-\d+$/.test(taskId || '')) throw new Error('Pass a task ID and answer source, or --check');
  if (fileMode && (!filePath || !path.isAbsolute(filePath))) throw new Error('Pass an absolute answer file path');
  if (!checkOnly && !fileMode && (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))) throw new Error('Invalid base64 answer');
  const answer = checkOnly ? '' : fileMode ? fs.readFileSync(filePath, 'utf8') : Buffer.from(encoded, 'base64').toString('utf8');
  const raw = execFileSync('E:\\AI\\Bridge\\runtime\\railway-cli\\node_modules\\@railway\\cli\\bin\\railway.exe', [
    'variables', '--project', '664cfde0-1227-4403-8757-f957f7b5d1de',
    '--service', '12d9ceee-f56b-4c18-a8b0-243df2a55fd9',
    '--environment', '3149b2cc-806d-48c8-a40e-bfcee3eea6ee', '--json',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 });
  const token = JSON.parse(raw).BRIDGE_MCP_TOKEN;
  if (!token) throw new Error('Bridge authentication unavailable');
  const request = async (path, body) => {
    const response = await fetch(`https://bridgechatgpt-production.up.railway.app${path}`, {
      method: body ? 'PATCH' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Bridge HTTP ${response.status}`);
    return response.json();
  };
  console.log(JSON.stringify(await completeChat({ taskId, answer, checkOnly, request })));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Chat completion failed. Check CLI login, task state and Bridge connectivity.'); process.exitCode = 1; });
}
