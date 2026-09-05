import { execFile, exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { getProject, logActivity } from './db.js';
import { AgentType, GitStatusResult, TestExecutionResult } from '../src/types.js';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

// Security: sensitive patterns to block from reading or searching
const SENSITIVE_PATTERNS = [
  /^\.env/i,
  /\.env\..+/i,
  /id_rsa/i,
  /id_ed25519/i,
  /\.pem$/i,
  /\.key$/i,
  /\.pfx$/i,
];

// Protected files that must not be overwritten or deleted via MCP tools
const PROTECTED_WRITE_PATTERNS = [
  /^\.env/i,
  /\.env\..+/i,
  /id_rsa/i,
  /id_ed25519/i,
  /\.pem$/i,
  /\.key$/i,
  /\.pfx$/i,
  /^\.git\//i,
  /^\.git$/i,
  /^data\/bridge\.sqlite/i,
];

// Critical core files protected from deletion
const PROTECTED_DELETE_FILES = [
  'package.json',
  'tsconfig.json',
  'server.ts',
  'vite.config.ts',
  'index.html',
  'server/db.ts',
  'server/mcp.ts',
];

export async function resolveProjectRoot(): Promise<string> {
  const project = await getProject();
  const root = project.project_root || '.';
  return path.resolve(process.cwd(), root);
}

export async function resolveSafePath(userPath: string): Promise<string> {
  if (!userPath || typeof userPath !== 'string') {
    throw new Error('Invalid path provided');
  }

  const projectRoot = await resolveProjectRoot();

  // If path has explicit traversal or absolute path, resolve and verify containment
  const resolved = path.isAbsolute(userPath)
    ? path.resolve(userPath)
    : path.resolve(projectRoot, userPath);

  // Sandboxing check: Ensure resolved path is contained within projectRoot
  const relative = path.relative(projectRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Access denied: Path "${userPath}" is outside project root sandbox.`);
  }

  // Check sensitive file names
  const basename = path.basename(resolved);
  if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(basename))) {
    throw new Error(`Access denied: Cannot access protected sensitive file "${basename}".`);
  }

  return resolved;
}

export async function resolveSafeWritePath(userPath: string): Promise<{ resolved: string; relative: string }> {
  if (!userPath || typeof userPath !== 'string') {
    throw new Error('Invalid file path provided');
  }

  const projectRoot = await resolveProjectRoot();
  const resolved = path.isAbsolute(userPath)
    ? path.resolve(userPath)
    : path.resolve(projectRoot, userPath);

  const relative = path.relative(projectRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Access denied: Write target "${userPath}" is outside project root sandbox.`);
  }

  const normalizedRelative = relative.replace(/\\/g, '/');
  const basename = path.basename(resolved);

  if (
    PROTECTED_WRITE_PATTERNS.some((p) => p.test(normalizedRelative) || p.test(basename))
  ) {
    throw new Error(`Access denied: Writing to protected file/path "${normalizedRelative}" is strictly prohibited.`);
  }

  return { resolved, relative: normalizedRelative };
}

// ---------------- 1. project_info ----------------
export async function toolProjectInfo() {
  const project = await getProject();
  const projectRoot = await resolveProjectRoot();

  // Check file counts
  let fileCount = 0;
  try {
    const countFiles = (dir: string): number => {
      let count = 0;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          count += countFiles(full);
        } else {
          count++;
        }
      }
      return count;
    };
    fileCount = countFiles(projectRoot);
  } catch (err) {
    fileCount = 0;
  }

  return {
    project_id: project.id,
    project_name: project.project_name,
    project_root: project.project_root,
    repository_url: project.repository_url,
    default_branch: project.default_branch,
    current_goal: project.current_goal,
    test_command: project.test_command,
    auto_review_enabled: project.auto_review,
    total_files_in_workspace: fileCount,
    last_updated: project.updated_at,
  };
}

// ---------------- 2. project_list_files ----------------
export async function toolProjectListFiles(params?: { directory?: string; recursive?: boolean; max_depth?: number }) {
  const projectRoot = await resolveProjectRoot();
  const targetDir = params?.directory ? await resolveSafePath(params.directory) : projectRoot;
  const recursive = params?.recursive !== false;
  const maxDepth = params?.max_depth || 8;

  const results: Array<{ name: string; path: string; is_directory: boolean; size?: number }> = [];

  const traverse = (currentDir: string, currentDepth: number) => {
    if (currentDepth > maxDepth) return;
    if (!fs.existsSync(currentDir)) return;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === 'dist' ||
        entry.name === '.vite'
      ) {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(projectRoot, fullPath);

      if (SENSITIVE_PATTERNS.some((p) => p.test(entry.name))) {
        continue; // skip sensitive files
      }

      if (entry.isDirectory()) {
        results.push({
          name: entry.name,
          path: relativePath,
          is_directory: true,
        });
        if (recursive) {
          traverse(fullPath, currentDepth + 1);
        }
      } else {
        let size = 0;
        try {
          size = fs.statSync(fullPath).size;
        } catch {}
        results.push({
          name: entry.name,
          path: relativePath,
          is_directory: false,
          size,
        });
      }
    }
  };

  traverse(targetDir, 1);
  return {
    root: path.relative(projectRoot, targetDir) || '.',
    total_items: results.length,
    files: results,
  };
}

// ---------------- 3. project_read_file ----------------
export async function toolProjectReadFile(params: { file_path: string; start_line?: number; end_line?: number }) {
  if (!params?.file_path) {
    throw new Error('file_path is required');
  }

  const safePath = await resolveSafePath(params.file_path);
  const projectRoot = await resolveProjectRoot();
  const relativePath = path.relative(projectRoot, safePath);

  if (!fs.existsSync(safePath)) {
    throw new Error(`File "${params.file_path}" does not exist`);
  }

  const stat = fs.statSync(safePath);
  if (stat.isDirectory()) {
    throw new Error(`"${params.file_path}" is a directory, not a file. Use project_list_files instead.`);
  }

  // Reject files over 2MB to prevent memory exhaustion
  if (stat.size > 2 * 1024 * 1024) {
    throw new Error(`File is too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Limit is 2MB.`);
  }

  const content = fs.readFileSync(safePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const totalLines = lines.length;

  let start = params.start_line ? Math.max(1, params.start_line) : 1;
  let end = params.end_line ? Math.min(totalLines, params.end_line) : totalLines;

  if (start > end) {
    start = 1;
    end = totalLines;
  }

  const slicedLines = lines.slice(start - 1, end);
  const numberedContent = slicedLines
    .map((line, idx) => `${start + idx}: ${line}`)
    .join('\n');

  return {
    file_path: relativePath,
    total_lines: totalLines,
    start_line: start,
    end_line: end,
    content: slicedLines.join('\n'),
    numbered_content: numberedContent,
  };
}

// ---------------- 4. project_search ----------------
export async function toolProjectSearch(params: { query: string; is_regex?: boolean; max_results?: number; file_extension?: string }) {
  if (!params?.query) {
    throw new Error('search query is required');
  }

  const projectRoot = await resolveProjectRoot();
  const maxResults = params.max_results || 40;
  const isRegex = Boolean(params.is_regex);
  let regex: RegExp;

  try {
    regex = isRegex ? new RegExp(params.query, 'gi') : new RegExp(params.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  } catch (err: any) {
    throw new Error(`Invalid search pattern: ${err.message}`);
  }

  const matches: Array<{
    file: string;
    line_number: number;
    line_content: string;
  }> = [];

  const searchDir = (dir: string) => {
    if (matches.length >= maxResults) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (matches.length >= maxResults) break;
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === 'dist' ||
        entry.name === '.vite'
      ) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      if (SENSITIVE_PATTERNS.some((p) => p.test(entry.name))) continue;

      if (entry.isDirectory()) {
        searchDir(fullPath);
      } else {
        if (params.file_extension && !entry.name.endsWith(params.file_extension)) {
          continue;
        }

        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > 1024 * 1024) continue; // skip files > 1MB

          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split(/\r?\n/);
          const relativePath = path.relative(projectRoot, fullPath);

          for (let i = 0; i < lines.length; i++) {
            if (matches.length >= maxResults) break;
            const line = lines[i];
            if (regex.test(line)) {
              matches.push({
                file: relativePath,
                line_number: i + 1,
                line_content: line.trim().slice(0, 300),
              });
              regex.lastIndex = 0; // reset for global regex
            }
          }
        } catch {
          // ignore unreadable/binary files
        }
      }
    }
  };

  searchDir(projectRoot);

  return {
    query: params.query,
    match_count: matches.length,
    matches,
  };
}

// ---------------- 5. project_git_status ----------------
export async function toolProjectGitStatus(): Promise<GitStatusResult> {
  const projectRoot = await resolveProjectRoot();

  try {
    const { stdout: branchOut } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: projectRoot,
    });
    const branch = branchOut.trim() || 'main';

    const { stdout: statusOut } = await execFileAsync('git', ['status', '--porcelain'], {
      cwd: projectRoot,
    });

    const lines = statusOut.split(/\r?\n/).filter(Boolean);
    const modified: string[] = [];
    const untracked: string[] = [];
    const staged: string[] = [];

    for (const line of lines) {
      const indexStatus = line[0];
      const workTreeStatus = line[1];
      const filePath = line.substring(3).trim();

      if (indexStatus !== ' ' && indexStatus !== '?') {
        staged.push(filePath);
      }
      if (workTreeStatus === 'M' || workTreeStatus === 'D') {
        modified.push(filePath);
      } else if (indexStatus === '?' && workTreeStatus === '?') {
        untracked.push(filePath);
      }
    }

    return {
      branch,
      clean: lines.length === 0,
      modified,
      untracked,
      staged,
      raw: statusOut || 'Working tree clean.',
    };
  } catch (err: any) {
    return {
      branch: 'main',
      clean: true,
      modified: [],
      untracked: [],
      staged: [],
      raw: `Git status unavailable: ${err.message}`,
    };
  }
}

// ---------------- 6. project_git_diff ----------------
export async function toolProjectGitDiff(params?: { staged?: boolean; file_path?: string; commit?: string }) {
  const projectRoot = await resolveProjectRoot();
  const args = ['diff'];

  if (params?.staged) {
    args.push('--staged');
  }
  if (params?.commit) {
    args.push(params.commit);
  }
  if (params?.file_path) {
    const safePath = await resolveSafePath(params.file_path);
    const rel = path.relative(projectRoot, safePath);
    args.push('--', rel);
  }

  try {
    const { stdout } = await execFileAsync('git', args, { cwd: projectRoot, maxBuffer: 10 * 1024 * 1024 });
    return {
      diff: stdout || 'No git diff detected.',
      has_changes: Boolean(stdout && stdout.trim().length > 0),
    };
  } catch (err: any) {
    return {
      diff: `Git diff error: ${err.message}`,
      has_changes: false,
    };
  }
}

// ---------------- 7. project_git_log ----------------
export async function toolProjectGitLog(params?: { limit?: number; file_path?: string }) {
  const projectRoot = await resolveProjectRoot();
  const limit = Math.min(params?.limit || 15, 50);
  const args = ['log', `-n`, String(limit), '--pretty=format:%h|%an|%ad|%s', '--date=short'];

  if (params?.file_path) {
    const safePath = await resolveSafePath(params.file_path);
    const rel = path.relative(projectRoot, safePath);
    args.push('--', rel);
  }

  try {
    const { stdout } = await execFileAsync('git', args, { cwd: projectRoot });
    const commits = stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, author, date, ...subjectParts] = line.split('|');
        return {
          hash,
          author,
          date,
          subject: subjectParts.join('|'),
        };
      });

    return {
      total: commits.length,
      commits,
    };
  } catch (err: any) {
    return {
      total: 0,
      commits: [],
      error: err.message,
    };
  }
}

// Allowlist for safe test and validation commands
const ALLOWED_TEST_COMMANDS = [
  /^npm\s+(run\s+)?(test|lint|build|preview|check|typecheck)(:\w+)?(\s+--\s+.*)?$/i,
  /^npm\s+test(\s+.*)?$/i,
  /^npx\s+(vitest|eslint|tsc)(\s+.*)?$/i,
  /^tsc(\s+.*)?$/i,
  /^node\s+--test(\s+.*)?$/i,
];

const FORBIDDEN_SHELL_PATTERNS = [
  /[;&|`$><]/,
  /\brm\b/i,
  /\bcurl\b/i,
  /\bwget\b/i,
  /\bsudo\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\beval\b/i,
  /\bbash\b/i,
  /\bsh\b/i,
];

// ---------------- 8. project_test ----------------
export async function toolProjectTest(params?: {
  command?: string;
  timeout_ms?: number;
  agent?: AgentType;
}): Promise<TestExecutionResult> {
  const project = await getProject();
  const projectRoot = await resolveProjectRoot();
  const cmd = (params?.command || project.test_command || 'npm run lint').trim();
  const timeoutMs = Math.min(params?.timeout_ms || 30000, 60000);
  const callerAgent = params?.agent || 'gemini';
  const startTime = Date.now();

  // Security Verification: validate command against allowlist
  const isAllowed = ALLOWED_TEST_COMMANDS.some((pattern) => pattern.test(cmd));
  const hasForbiddenTokens = FORBIDDEN_SHELL_PATTERNS.some((pattern) => pattern.test(cmd));

  if (!isAllowed || hasForbiddenTokens) {
    const errorMsg = `Command rejected: "${cmd}" is not in the authorized test command allowlist. Permitted commands: npm test, npm run test, npm run lint, npm run build, tsc, npx vitest.`;
    await logActivity({
      agent: callerAgent,
      action: 'Test command rejected',
      entity_type: 'test',
      details: errorMsg,
    });

    return {
      command: cmd,
      success: false,
      exitCode: 126,
      stdout: '',
      stderr: errorMsg,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    };
  }

  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: projectRoot,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024, // 1MB buffer
      env: { ...process.env, NODE_ENV: 'test', CI: 'true' },
    });

    const durationMs = Date.now() - startTime;
    const result: TestExecutionResult = {
      command: cmd,
      success: true,
      exitCode: 0,
      stdout: stdout || 'Tests passed with no output.',
      stderr: stderr || '',
      durationMs,
      timestamp: new Date().toISOString(),
    };

    await logActivity({
      agent: callerAgent,
      action: 'Ran project tests',
      entity_type: 'test',
      details: `Command: "${cmd}" -> PASSED in ${durationMs}ms`,
    });

    return result;
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    const result: TestExecutionResult = {
      command: cmd,
      success: false,
      exitCode: err.code || 1,
      stdout: err.stdout || '',
      stderr: err.stderr || err.message || 'Execution failed',
      durationMs,
      timestamp: new Date().toISOString(),
    };

    await logActivity({
      agent: callerAgent,
      action: 'Ran project tests',
      entity_type: 'test',
      details: `Command: "${cmd}" -> FAILED (exit code ${result.exitCode})`,
    });

    return result;
  }
}

// ---------------- 9. project_write_file ----------------
export async function toolProjectWriteFile(
  params: { file_path: string; content: string; create_if_missing?: boolean },
  callerAgent: AgentType = 'gemini'
) {
  if (!params?.file_path) {
    throw new Error('file_path is required');
  }
  if (params?.content === undefined || params?.content === null) {
    throw new Error('content is required');
  }

  const { resolved, relative } = await resolveSafeWritePath(params.file_path);
  const existedBefore = fs.existsSync(resolved);

  if (!existedBefore && params.create_if_missing === false) {
    throw new Error(`File "${relative}" does not exist and create_if_missing is false.`);
  }

  // Ensure parent directories exist
  const parentDir = path.dirname(resolved);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  fs.writeFileSync(resolved, params.content, 'utf8');

  const byteCount = Buffer.byteLength(params.content, 'utf8');
  const lineCount = params.content.split(/\r?\n/).length;

  await logActivity({
    agent: callerAgent,
    action: existedBefore ? `Edited ${relative}` : `Created ${relative}`,
    entity_type: 'project',
    entity_id: relative,
    details: `${byteCount} bytes written (${lineCount} lines)`,
  });

  return {
    file_path: relative,
    bytes_written: byteCount,
    total_lines: lineCount,
    is_created: !existedBefore,
    success: true,
    message: `Successfully wrote ${byteCount} bytes to ${relative}`,
  };
}

// ---------------- 10. project_patch_file ----------------
export async function toolProjectPatchFile(
  params: { file_path: string; target_content: string; replacement_content: string },
  callerAgent: AgentType = 'gemini'
) {
  if (!params?.file_path) {
    throw new Error('file_path is required');
  }
  if (!params?.target_content) {
    throw new Error('target_content is required');
  }
  if (params?.replacement_content === undefined || params?.replacement_content === null) {
    throw new Error('replacement_content is required');
  }

  const { resolved, relative } = await resolveSafeWritePath(params.file_path);

  if (!fs.existsSync(resolved)) {
    throw new Error(`File "${relative}" does not exist`);
  }

  const currentContent = fs.readFileSync(resolved, 'utf8');
  const occurrences = currentContent.split(params.target_content).length - 1;

  if (occurrences === 0) {
    throw new Error(
      `Target content not found in "${relative}". Please inspect the current file content to ensure exact whitespace and line match.`
    );
  }

  if (occurrences > 1) {
    throw new Error(
      `Target content occurs ${occurrences} times in "${relative}". Target content must match uniquely within the file.`
    );
  }

  const updatedContent = currentContent.replace(params.target_content, params.replacement_content);
  fs.writeFileSync(resolved, updatedContent, 'utf8');

  const byteCount = Buffer.byteLength(updatedContent, 'utf8');
  const lineCount = updatedContent.split(/\r?\n/).length;

  await logActivity({
    agent: callerAgent,
    action: `Patched ${relative}`,
    entity_type: 'project',
    entity_id: relative,
    details: `Replaced unique target content segment (${lineCount} total lines)`,
  });

  return {
    file_path: relative,
    success: true,
    total_lines: lineCount,
    bytes_written: byteCount,
    message: `Successfully patched ${relative}`,
  };
}

// ---------------- 11. project_create_file ----------------
export async function toolProjectCreateFile(
  params: { file_path: string; content?: string; overwrite?: boolean },
  callerAgent: AgentType = 'gemini'
) {
  if (!params?.file_path) {
    throw new Error('file_path is required');
  }

  const { resolved, relative } = await resolveSafeWritePath(params.file_path);
  const exists = fs.existsSync(resolved);

  if (exists && !params.overwrite) {
    throw new Error(`File "${relative}" already exists. Set overwrite: true to replace it.`);
  }

  const parentDir = path.dirname(resolved);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  const content = params.content || '';
  fs.writeFileSync(resolved, content, 'utf8');

  await logActivity({
    agent: callerAgent,
    action: exists ? `Overwrote ${relative}` : `Created ${relative}`,
    entity_type: 'project',
    entity_id: relative,
    details: `${Buffer.byteLength(content, 'utf8')} bytes written`,
  });

  return {
    file_path: relative,
    success: true,
    message: exists ? `Successfully overwrote ${relative}` : `Successfully created ${relative}`,
  };
}

// ---------------- 12. project_delete_file ----------------
export async function toolProjectDeleteFile(
  params: { file_path: string },
  callerAgent: AgentType = 'gemini'
) {
  if (!params?.file_path) {
    throw new Error('file_path is required');
  }

  const { resolved, relative } = await resolveSafeWritePath(params.file_path);

  if (PROTECTED_DELETE_FILES.includes(relative)) {
    throw new Error(`Cannot delete protected core project file "${relative}".`);
  }

  if (!fs.existsSync(resolved)) {
    throw new Error(`File "${relative}" does not exist`);
  }

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    throw new Error(`"${relative}" is a directory. Deleting directories is not supported.`);
  }

  fs.unlinkSync(resolved);

  await logActivity({
    agent: callerAgent,
    action: `Deleted ${relative}`,
    entity_type: 'project',
    entity_id: relative,
  });

  return {
    file_path: relative,
    success: true,
    message: `Successfully deleted ${relative}`,
  };
}
