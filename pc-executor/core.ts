import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import type { ExecutorAction } from '../server/executorStore.js';

export interface ExecutorRuntimeConfig {
  projectRoot: string;
  allowWrites: boolean;
  allowCommands: boolean;
  allowedCommands?: string[];
  commandTimeoutMs?: number;
}

export interface ExecutorActionResult {
  action: ExecutorAction;
  ok: boolean;
  cwd: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  exit_code?: number | null;
  stdout?: string;
  stderr?: string;
  data?: unknown;
}

const MAX_FILE_BYTES = 512 * 1024;
const MAX_OUTPUT_CHARS = 250_000;
const DEFAULT_ALLOWED_COMMANDS = [
  'git',
  'node',
  'npm',
  'npm.cmd',
  'npx',
  'npx.cmd',
  'pnpm',
  'pnpm.cmd',
  'yarn',
  'yarn.cmd',
  'gradle',
  'gradle.bat',
  'gradlew',
  'gradlew.bat',
  './gradlew',
  '.\\gradlew.bat',
];

function normalizeRoot(raw: string) {
  const root = path.resolve(String(raw || '').trim() || process.cwd());
  if (!fs.existsSync(root)) throw new Error(`Project root does not exist: ${root}`);
  if (!fs.statSync(root).isDirectory()) throw new Error(`Project root is not a directory: ${root}`);
  return root;
}

export function safeProjectPath(projectRoot: string, relativePath = '.') {
  const root = normalizeRoot(projectRoot);
  const candidate = path.resolve(root, String(relativePath || '.'));
  if (candidate !== root && !candidate.startsWith(root + path.sep)) {
    throw new Error(`Path escapes project root: ${relativePath}`);
  }
  return candidate;
}

function relativeCwd(projectRoot: string, requested: unknown) {
  return safeProjectPath(projectRoot, String(requested || '.'));
}

function trimOutput(value: string) {
  if (value.length <= MAX_OUTPUT_CHARS) return value;
  return `[...truncated ${value.length - MAX_OUTPUT_CHARS} chars...]\n${value.slice(-MAX_OUTPUT_CHARS)}`;
}

function sha256(content: Buffer | string) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function executableForPlatform(command: string) {
  if (process.platform !== 'win32') return command;
  if (['npm', 'npx', 'pnpm', 'yarn'].includes(command)) return `${command}.cmd`;
  if (command === './gradlew' || command === 'gradlew') return '.\\gradlew.bat';
  return command;
}

function allowedExecutable(command: string, configured?: string[]) {
  const allowed = new Set((configured?.length ? configured : DEFAULT_ALLOWED_COMMANDS).map((item) => item.toLowerCase()));
  return allowed.has(command.toLowerCase()) || allowed.has(path.basename(command).toLowerCase());
}

async function runProcess(
  argv: string[],
  cwd: string,
  timeoutMs: number,
  allowedCommands?: string[]
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  if (!Array.isArray(argv) || argv.length === 0) throw new Error('argv must contain at least one executable');
  if (argv.length > 64) throw new Error('argv is too long');
  const rawExecutable = String(argv[0] || '').trim();
  if (!rawExecutable) throw new Error('Executable is required');
  if (!allowedExecutable(rawExecutable, allowedCommands)) throw new Error(`Executable is not allowlisted: ${rawExecutable}`);
  const args = argv.slice(1).map((item) => String(item));
  if (args.some((item) => item.length > 20_000)) throw new Error('One or more command arguments are too large');
  const executable = executableForPlatform(rawExecutable);

  return await new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      shell: false,
      windowsHide: true,
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 1500);
      settled = true;
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout = trimOutput(stdout + chunk.toString());
    });
    child.stderr?.on('data', (chunk) => {
      stderr = trimOutput(stderr + chunk.toString());
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: code, stdout: trimOutput(stdout), stderr: trimOutput(stderr) });
    });
  });
}

function requireCommands(config: ExecutorRuntimeConfig) {
  if (!config.allowCommands) {
    throw new Error('Command execution is disabled on this PC. Enable it in the Local Executor web app first.');
  }
}

function requireWrites(config: ExecutorRuntimeConfig) {
  if (!config.allowWrites) {
    throw new Error('File writes are disabled on this PC. Enable them in the Local Executor web app first.');
  }
}

export async function executeExecutorAction(
  action: ExecutorAction,
  payload: Record<string, unknown> = {},
  config: ExecutorRuntimeConfig
): Promise<ExecutorActionResult> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const root = normalizeRoot(config.projectRoot);
  const cwd = relativeCwd(root, payload.cwd);
  const timeoutMs = Math.max(1_000, Math.min(Number(payload.timeout_ms || config.commandTimeoutMs || 10 * 60_000), 30 * 60_000));

  const finish = (partial: Omit<ExecutorActionResult, 'action' | 'ok' | 'cwd' | 'started_at' | 'completed_at' | 'duration_ms'> = {}): ExecutorActionResult => ({
    action,
    ok: true,
    cwd,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    duration_ms: Date.now() - started,
    ...partial,
  });

  switch (action) {
    case 'fs.list': {
      const target = safeProjectPath(root, String(payload.path || '.'));
      const entries = fs.readdirSync(target, { withFileTypes: true }).slice(0, 500).map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
      }));
      return finish({ data: { path: path.relative(root, target) || '.', entries } });
    }

    case 'fs.read': {
      const target = safeProjectPath(root, String(payload.path || ''));
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error(`File not found: ${payload.path}`);
      const size = fs.statSync(target).size;
      if (size > MAX_FILE_BYTES) throw new Error(`File is too large to read (${size} bytes > ${MAX_FILE_BYTES})`);
      const buffer = fs.readFileSync(target);
      return finish({ data: { path: path.relative(root, target), size, sha256: sha256(buffer), content: buffer.toString('utf8') } });
    }

    case 'fs.write': {
      requireWrites(config);
      const relative = String(payload.path || '').trim();
      if (!relative) throw new Error('path is required');
      const target = safeProjectPath(root, relative);
      const content = String(payload.content ?? '');
      if (Buffer.byteLength(content, 'utf8') > 2 * 1024 * 1024) throw new Error('Write content exceeds 2 MB');
      const exists = fs.existsSync(target);
      if (exists && !fs.statSync(target).isFile()) throw new Error('Target path is not a regular file');
      if (exists) {
        const before = fs.readFileSync(target);
        const expected = String(payload.expected_sha256 || '').trim();
        if (expected && sha256(before) !== expected) throw new Error('expected_sha256 does not match current file');
        if (!expected && payload.overwrite !== true) {
          throw new Error('Existing files require overwrite=true or expected_sha256');
        }
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const tmp = `${target}.bridge-${process.pid}-${Date.now()}.tmp`;
      fs.writeFileSync(tmp, content, 'utf8');
      fs.renameSync(tmp, target);
      const after = fs.readFileSync(target);
      return finish({ data: { path: path.relative(root, target), size: after.length, sha256: sha256(after), created: !exists } });
    }

    case 'git.status': {
      const run = await runProcess(['git', 'status', '--short', '--branch'], cwd, timeoutMs, config.allowedCommands);
      return finish({ exit_code: run.exitCode, stdout: run.stdout, stderr: run.stderr });
    }

    case 'git.diff': {
      const argv = ['git', 'diff'];
      if (payload.staged === true) argv.push('--staged');
      if (payload.stat === true) argv.push('--stat');
      const file = String(payload.path || '').trim();
      if (file) {
        safeProjectPath(root, file);
        argv.push('--', file);
      }
      const run = await runProcess(argv, cwd, timeoutMs, config.allowedCommands);
      return finish({ exit_code: run.exitCode, stdout: run.stdout, stderr: run.stderr });
    }

    case 'npm.test': {
      requireCommands(config);
      const run = await runProcess(['npm', 'test'], cwd, timeoutMs, config.allowedCommands);
      return finish({ exit_code: run.exitCode, stdout: run.stdout, stderr: run.stderr });
    }

    case 'npm.build': {
      requireCommands(config);
      const run = await runProcess(['npm', 'run', 'build'], cwd, timeoutMs, config.allowedCommands);
      return finish({ exit_code: run.exitCode, stdout: run.stdout, stderr: run.stderr });
    }

    case 'command.run': {
      requireCommands(config);
      const argv = Array.isArray(payload.argv) ? payload.argv.map((item) => String(item)) : [];
      const run = await runProcess(argv, cwd, timeoutMs, config.allowedCommands);
      return finish({ exit_code: run.exitCode, stdout: run.stdout, stderr: run.stderr });
    }

    default:
      throw new Error(`Unsupported local executor action: ${action}`);
  }
}
