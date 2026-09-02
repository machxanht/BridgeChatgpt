import fs from 'fs';
import path from 'path';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import {
  Activity,
  AgentOperationalStatus,
  AgentStatus,
  AgentType,
  Finding,
  Message,
  ProjectConfig,
  TargetAgentType,
  Task,
  TaskPriority,
  TaskReviewPayload,
  WorkflowStateResponse,
  WorkspaceState,
} from '../src/types.js';

let SQL: SqlJsStatic | null = null;
let db: Database | null = null;
const DB_PATH = path.resolve(process.cwd(), 'data', 'bridge.sqlite');

async function getSQL(): Promise<SqlJsStatic> {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

function ensureDataDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function persistToDisk() {
  if (!db) return;
  try {
    ensureDataDir();
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('[DB] Failed to persist database to disk:', err);
  }
}

export async function initDatabase(): Promise<Database> {
  if (db) return db;

  const sql = await getSQL();
  ensureDataDir();

  if (fs.existsSync(DB_PATH)) {
    try {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new sql.Database(fileBuffer);
      console.log('[DB] Loaded existing SQLite database from', DB_PATH);
    } catch (err) {
      console.warn('[DB] Could not load existing DB, creating fresh DB:', err);
      db = new sql.Database();
    }
  } else {
    db = new sql.Database();
    console.log('[DB] Initialized new SQLite database in memory & disk');
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      project_name TEXT NOT NULL,
      project_root TEXT NOT NULL,
      repository_url TEXT NOT NULL,
      default_branch TEXT NOT NULL,
      current_goal TEXT NOT NULL,
      test_command TEXT NOT NULL,
      auto_review INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL,
      assignee TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      related_files TEXT NOT NULL DEFAULT '[]',
      related_finding TEXT,
      result TEXT
    );

    CREATE TABLE IF NOT EXISTS findings (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      severity TEXT NOT NULL,
      description TEXT NOT NULL,
      file TEXT NOT NULL,
      line TEXT NOT NULL,
      status TEXT NOT NULL,
      created_by TEXT NOT NULL,
      assigned_to TEXT,
      resolution TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      task_id TEXT,
      finding_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_status (
      agent TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      current_task_id TEXT,
      last_active_at TEXT NOT NULL,
      message TEXT
    );

    CREATE TABLE IF NOT EXISTS activity (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS command_receipts (
      command_id TEXT PRIMARY KEY,
      command_type TEXT NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS counters (
      name TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    );
  `);

  // Seed default project if empty
  const projectCountStmt = db.prepare('SELECT COUNT(*) as count FROM projects');
  let count = 0;
  if (projectCountStmt.step()) {
    count = projectCountStmt.getAsObject().count as number;
  }
  projectCountStmt.free();

  if (count === 0) {
    const now = new Date().toISOString();
    const projectName = process.env.PROJECT_NAME || 'BridgeChatgpt';
    const projectRoot = process.env.PROJECT_ROOT || '.';
    const defaultBranch = process.env.DEFAULT_BRANCH || 'main';
    const repositoryUrl = process.env.REPOSITORY_URL || 'https://github.com/machxanht/BridgeChatgpt';

    db.run(
      `INSERT INTO projects (id, project_name, project_root, repository_url, default_branch, current_goal, test_command, auto_review, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'proj-default',
        projectName,
        projectRoot,
        repositoryUrl,
        defaultBranch,
        'Establish seamless collaboration between ChatGPT (Reviewer) and Gemini (Coder)',
        'npm run lint',
        1,
        now,
        now,
      ]
    );

    // Seed agent statuses
    db.run(
      `INSERT OR REPLACE INTO agent_status (agent, status, current_task_id, last_active_at, message) VALUES
       ('chatgpt', 'idle', NULL, ?, 'Ready to review code, search repository, and create structured tasks.'),
       ('gemini', 'idle', NULL, ?, 'Ready to claim tasks, edit files, and execute project tests.'),
       ('human', 'idle', NULL, ?, 'Observing workspace.')`,
      [now, now, now]
    );

    // Seed initial activity
    const actId = 'ACT-' + Date.now().toString(36).toUpperCase();
    db.run(
      `INSERT INTO activity (id, agent, action, entity_type, entity_id, details, created_at)
       VALUES (?, 'system', 'Initialized Bridge shared workspace', 'project', 'proj-default', 'Database and MCP tools ready for ChatGPT & Gemini.', ?)`,
      [actId, now]
    );

    persistToDisk();
  }

  return db;
}

// Ensure database is initialized before any query
async function getDb(): Promise<Database> {
  if (!db) {
    await initDatabase();
  }
  return db!;
}

class AsyncMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const release = () => {
        if (this.queue.length > 0) {
          const next = this.queue.shift()!;
          next();
        } else {
          this.locked = false;
        }
      };

      if (!this.locked) {
        this.locked = true;
        resolve(release);
      } else {
        this.queue.push(() => resolve(release));
      }
    });
  }

  async runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export const dbMutex = new AsyncMutex();

async function getNextId(counterName: string, prefix: string, tableName: string): Promise<string> {
  const d = await getDb();

  const stmt = d.prepare('SELECT value FROM counters WHERE name = ?');
  stmt.bind([counterName]);
  let currentValue: number | null = null;
  if (stmt.step()) {
    currentValue = stmt.getAsObject().value as number;
  }
  stmt.free();

  if (currentValue === null) {
    let maxId = 0;
    try {
      const allRowsStmt = d.prepare(`SELECT id FROM ${tableName}`);
      while (allRowsStmt.step()) {
        const rowId = allRowsStmt.getAsObject().id as string;
        const match = rowId?.match(/^([A-Z]+)-(\d+)$/);
        if (match) {
          const num = parseInt(match[2], 10);
          if (!isNaN(num) && num > maxId) {
            maxId = num;
          }
        }
      }
      allRowsStmt.free();
    } catch {
      maxId = 0;
    }
    currentValue = maxId;
    d.run('INSERT OR REPLACE INTO counters (name, value) VALUES (?, ?)', [counterName, currentValue]);
  }

  let nextValue = currentValue + 1;
  let candidateId = `${prefix}-${nextValue}`;

  while (true) {
    const checkStmt = d.prepare(`SELECT 1 FROM ${tableName} WHERE id = ?`);
    checkStmt.bind([candidateId]);
    const exists = checkStmt.step();
    checkStmt.free();
    if (!exists) {
      break;
    }
    nextValue++;
    candidateId = `${prefix}-${nextValue}`;
  }

  d.run('UPDATE counters SET value = ? WHERE name = ?', [nextValue, counterName]);
  persistToDisk();
  return candidateId;
}

// ---------------- PROJECTS ----------------

export async function getProject(): Promise<ProjectConfig> {
  const d = await getDb();
  const stmt = d.prepare('SELECT * FROM projects LIMIT 1');
  let project: ProjectConfig | null = null;
  if (stmt.step()) {
    const row = stmt.getAsObject();
    project = {
      id: row.id as string,
      project_name: row.project_name as string,
      project_root: row.project_root as string,
      repository_url: row.repository_url as string,
      default_branch: row.default_branch as string,
      current_goal: row.current_goal as string,
      test_command: row.test_command as string,
      auto_review: Boolean(row.auto_review),
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }
  stmt.free();

  if (!project) {
    throw new Error('Project not found in database');
  }
  return project;
}

export async function updateProject(updates: Partial<ProjectConfig>): Promise<ProjectConfig> {
  const current = await getProject();
  const d = await getDb();
  const now = new Date().toISOString();

  const updated: ProjectConfig = {
    ...current,
    ...updates,
    updated_at: now,
  };

  d.run(
    `UPDATE projects SET 
      project_name = ?,
      project_root = ?,
      repository_url = ?,
      default_branch = ?,
      current_goal = ?,
      test_command = ?,
      auto_review = ?,
      updated_at = ?
     WHERE id = ?`,
    [
      updated.project_name,
      updated.project_root,
      updated.repository_url,
      updated.default_branch,
      updated.current_goal,
      updated.test_command,
      updated.auto_review ? 1 : 0,
      updated.updated_at,
      current.id,
    ]
  );

  persistToDisk();
  await logActivity({
    agent: 'human',
    action: 'Updated project configuration',
    entity_type: 'project',
    entity_id: current.id,
    details: `Goal: "${updated.current_goal}" | Auto-Review: ${updated.auto_review ? 'Enabled' : 'Disabled'}`,
  });

  return updated;
}

// ---------------- TASKS ----------------

export async function getTasks(filter?: { status?: string; assignee?: string; priority?: string; limit?: number }): Promise<Task[]> {
  const d = await getDb();
  let query = 'SELECT * FROM tasks WHERE 1=1';
  const params: any[] = [];

  if (filter?.status) {
    query += ' AND status = ?';
    params.push(filter.status);
  }
  if (filter?.assignee) {
    query += ' AND assignee = ?';
    params.push(filter.assignee);
  }
  if (filter?.priority) {
    query += ' AND priority = ?';
    params.push(filter.priority);
  }
  query += ' ORDER BY created_at DESC';
  if (filter?.limit) {
    query += ' LIMIT ?';
    params.push(filter.limit);
  }

  const stmt = d.prepare(query);
  if (params.length > 0) {
    stmt.bind(params);
  }

  const tasks: Task[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    let related_files: string[] = [];
    try {
      related_files = JSON.parse((row.related_files as string) || '[]');
    } catch {
      related_files = [];
    }
    tasks.push({
      id: row.id as string,
      title: row.title as string,
      description: row.description as string,
      priority: row.priority as any,
      status: row.status as any,
      assignee: row.assignee as any,
      created_by: row.created_by as any,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      related_files,
      related_finding: (row.related_finding as string) || null,
      result: (row.result as string) || null,
    });
  }
  stmt.free();
  return tasks;
}

export async function getTask(id: string): Promise<Task | null> {
  const d = await getDb();
  const stmt = d.prepare('SELECT * FROM tasks WHERE id = ?');
  stmt.bind([id]);
  let task: Task | null = null;
  if (stmt.step()) {
    const row = stmt.getAsObject();
    let related_files: string[] = [];
    try {
      related_files = JSON.parse((row.related_files as string) || '[]');
    } catch {
      related_files = [];
    }
    task = {
      id: row.id as string,
      title: row.title as string,
      description: row.description as string,
      priority: row.priority as any,
      status: row.status as any,
      assignee: row.assignee as any,
      created_by: row.created_by as any,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      related_files,
      related_finding: (row.related_finding as string) || null,
      result: (row.result as string) || null,
    };
  }
  stmt.free();
  return task;
}

export async function createTask(input: {
  title: string;
  description: string;
  priority?: string;
  assignee?: AgentType;
  created_by?: AgentType;
  related_files?: string[];
  related_finding?: string | null;
  status?: string;
}): Promise<Task> {
  return await dbMutex.runExclusive(async () => {
    const d = await getDb();
    const now = new Date().toISOString();

    const id = await getNextId('tasks', 'TASK', 'tasks');
    const priority = input.priority || 'medium';
    const assignee = input.assignee || 'gemini';
    const created_by = input.created_by || 'chatgpt';
    const status = input.status || (assignee === 'gemini' ? 'assigned' : 'pending');
    const relatedFiles = JSON.stringify(input.related_files || []);
    const relatedFinding = input.related_finding || null;

    d.run(
      `INSERT INTO tasks (id, title, description, priority, status, assignee, created_by, created_at, updated_at, related_files, related_finding, result)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.title,
        input.description,
        priority,
        status,
        assignee,
        created_by,
        now,
        now,
        relatedFiles,
        relatedFinding,
        null,
      ]
    );

    persistToDisk();

    await logActivity({
      agent: created_by,
      action: `Created task ${id}`,
      entity_type: 'task',
      entity_id: id,
      details: `"${input.title}" assigned to ${assignee} (Priority: ${priority})`,
    });

    // Also create structured notification message
    await createMessage({
      from: created_by,
      to: assignee,
      type: 'task',
      content: `New task ${id} assigned: "${input.title}". Description: ${input.description}`,
      task_id: id,
      finding_id: relatedFinding,
    });

    return (await getTask(id))!;
  });
}

export async function updateTask(
  id: string,
  updates: Partial<Omit<Task, 'id' | 'created_at'>>,
  agent: AgentType = 'gemini'
): Promise<Task> {
  const current = await getTask(id);
  if (!current) {
    throw new Error(`Task ${id} not found`);
  }

  const d = await getDb();
  const now = new Date().toISOString();

  // Strip undefined values so they do not overwrite current values
  const cleanUpdates: Partial<Task> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      (cleanUpdates as any)[key] = value;
    }
  }

  const updated: Task = {
    ...current,
    ...cleanUpdates,
    updated_at: now,
  };

  d.run(
    `UPDATE tasks SET
      title = ?,
      description = ?,
      priority = ?,
      status = ?,
      assignee = ?,
      updated_at = ?,
      related_files = ?,
      related_finding = ?,
      result = ?
     WHERE id = ?`,
    [
      updated.title ?? current.title,
      updated.description ?? current.description,
      updated.priority ?? current.priority,
      updated.status ?? current.status,
      updated.assignee ?? current.assignee,
      updated.updated_at,
      JSON.stringify(updated.related_files || current.related_files || []),
      updated.related_finding !== undefined ? updated.related_finding : (current.related_finding || null),
      updated.result !== undefined ? updated.result : (current.result || null),
      id,
    ]
  );

  persistToDisk();

  const statusChanged = current.status !== updated.status;
  const resultAdded = !current.result && Boolean(updated.result);

  let details = `Status: ${updated.status}`;
  if (resultAdded) {
    details += ` | Result reported by ${agent}`;
  }

  await logActivity({
    agent,
    action: `Updated task ${id}`,
    entity_type: 'task',
    entity_id: id,
    details,
  });

  // If status moved to review or completed, send message to reviewer (ChatGPT)
  if (statusChanged && (updated.status === 'review' || updated.status === 'completed')) {
    await createMessage({
      from: agent,
      to: 'chatgpt',
      type: updated.status === 'review' ? 'review' : 'result',
      content: `Task ${id} "${updated.title}" marked as ${updated.status}. Result: ${updated.result || 'Changes made.'}`,
      task_id: id,
      finding_id: updated.related_finding,
    });
  }

  return updated;
}

export async function deleteTask(id: string): Promise<boolean> {
  const d = await getDb();
  d.run('DELETE FROM tasks WHERE id = ?', [id]);
  persistToDisk();
  return true;
}

const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  urgent: 1,
  high: 2,
  medium: 3,
  low: 4,
};

// Atomic Task Claiming for Execution Agents (e.g. Gemini)
export async function claimNextTask(agent: AgentType = 'gemini'): Promise<{
  claimed: boolean;
  message?: string;
  task: Task | null;
}> {
  return await dbMutex.runExclusive(async () => {
    const d = await getDb();
    const allTasks = await getTasks({ assignee: agent });
    const eligible = allTasks.filter((t) => t.status === 'assigned' || t.status === 'pending');

    if (eligible.length === 0) {
      return {
        claimed: false,
        message: `No pending or assigned tasks available for agent "${agent}".`,
        task: null,
      };
    }

    // Sort by priority (urgent -> high -> medium -> low), then oldest created_at
    eligible.sort((a, b) => {
      const weightA = PRIORITY_WEIGHTS[a.priority] || 3;
      const weightB = PRIORITY_WEIGHTS[b.priority] || 3;
      if (weightA !== weightB) {
        return weightA - weightB;
      }
      return a.created_at.localeCompare(b.created_at);
    });

    const selected = eligible[0];

    // Atomically claim the selected task using SQL conditional update
    const now = new Date().toISOString();
    d.run(
      `UPDATE tasks SET status = 'working', updated_at = ? WHERE id = ? AND (status = 'assigned' OR status = 'pending')`,
      [now, selected.id]
    );

    const rowsModified = d.getRowsModified();
    if (rowsModified !== 1) {
      return {
        claimed: false,
        message: `Task ${selected.id} was claimed or modified concurrently by another worker.`,
        task: null,
      };
    }

    persistToDisk();

    const refreshed = await getTask(selected.id);
    if (!refreshed || refreshed.status !== 'working') {
      return {
        claimed: false,
        message: `Task ${selected.id} status verification failed after claim.`,
        task: null,
      };
    }

    // Update agent status to working
    await setAgentStatus({
      agent: agent as any,
      status: 'working',
      current_task_id: selected.id,
      message: `Actively executing "${selected.title}"`,
    });

    await logActivity({
      agent,
      action: `Claimed task ${selected.id}`,
      entity_type: 'task',
      entity_id: selected.id,
      details: `Priority: ${selected.priority} | "${selected.title}"`,
    });

    await createMessage({
      from: agent,
      to: 'chatgpt',
      type: 'task_claimed',
      content: `${agent.toUpperCase()} claimed ${selected.id}: "${selected.title}". Implementation started.`,
      task_id: selected.id,
      finding_id: selected.related_finding,
    });

    return {
      claimed: true,
      message: `Successfully claimed task ${selected.id}`,
      task: refreshed,
    };
  });
}

// Explicit Review Submission (ChatGPT or Human Reviewer)
export async function reviewTask(payload: TaskReviewPayload): Promise<Task> {
  const task = await getTask(payload.id);
  if (!task) {
    throw new Error(`Task ${payload.id} not found`);
  }

  if (task.status !== 'review') {
    // Allow reviewing if in working or blocked, but log notice
    console.warn(`[Review] Task ${payload.id} is in status "${task.status}" rather than "review".`);
  }

  const reviewer = payload.reviewer || 'chatgpt';
  const now = new Date().toISOString();

  if (payload.decision === 'approve') {
    // 1. Approve transition: review -> completed
    const existingResult = task.result || '';
    const reviewNote = `\n\n[Review APPROVED by ${reviewer} at ${now}]: ${payload.summary} (Automated tests verified: ${payload.tests_verified ? 'Yes' : 'No'})`;
    const updated = await updateTask(
      task.id,
      {
        status: 'completed',
        result: existingResult + reviewNote,
      },
      reviewer
    );

    // If related finding exists, mark as verified
    if (task.related_finding) {
      await updateFinding(
        task.related_finding,
        {
          status: 'verified',
          resolution: `Verified resolved by ${reviewer}: ${payload.summary}`,
        },
        reviewer
      );
    }

    await setAgentStatus({
      agent: reviewer,
      status: 'idle',
      current_task_id: null,
      message: `Approved ${task.id}. Ready for next task.`,
    });

    await setAgentStatus({
      agent: task.assignee as any,
      status: 'idle',
      current_task_id: null,
      message: `Task ${task.id} completed. Standing by.`,
    });

    await createMessage({
      from: reviewer,
      to: task.assignee,
      type: 'review_approved',
      content: `Review APPROVED for ${task.id} ("${task.title}"): ${payload.summary}`,
      task_id: task.id,
      finding_id: task.related_finding,
    });

    return updated;
  } else {
    // 2. Request Changes transition: review -> assigned (or pending)
    const existingResult = task.result || '';
    const reviewNote = `\n\n[Review CHANGES REQUESTED by ${reviewer} at ${now}]: ${payload.summary}`;
    const updated = await updateTask(
      task.id,
      {
        status: 'assigned',
        result: existingResult + reviewNote,
      },
      reviewer
    );

    if (task.related_finding) {
      await updateFinding(
        task.related_finding,
        {
          status: 'assigned',
          resolution: `Follow-up needed: ${payload.summary}`,
        },
        reviewer
      );
    }

    await setAgentStatus({
      agent: reviewer,
      status: 'idle',
      current_task_id: null,
      message: `Requested changes on ${task.id}. Dispatched back to ${task.assignee}.`,
    });

    await setAgentStatus({
      agent: task.assignee as any,
      status: 'idle',
      current_task_id: null,
      message: `Changes requested on ${task.id}. Standing by to claim.`,
    });

    await createMessage({
      from: reviewer,
      to: task.assignee,
      type: 'review_changes_requested',
      content: `Review CHANGES REQUESTED for ${task.id} ("${task.title}"): ${payload.summary}. Please address feedback and resubmit.`,
      task_id: task.id,
      finding_id: task.related_finding,
    });

    return updated;
  }
}


// ---------------- FINDINGS ----------------

export async function getFindings(filter?: { status?: string; severity?: string; assigned_to?: string; limit?: number }): Promise<Finding[]> {
  const d = await getDb();
  let query = 'SELECT * FROM findings WHERE 1=1';
  const params: any[] = [];

  if (filter?.status) {
    query += ' AND status = ?';
    params.push(filter.status);
  }
  if (filter?.severity) {
    query += ' AND severity = ?';
    params.push(filter.severity);
  }
  if (filter?.assigned_to) {
    query += ' AND assigned_to = ?';
    params.push(filter.assigned_to);
  }
  query += ' ORDER BY created_at DESC';
  if (filter?.limit) {
    query += ' LIMIT ?';
    params.push(filter.limit);
  }

  const stmt = d.prepare(query);
  if (params.length > 0) {
    stmt.bind(params);
  }

  const findings: Finding[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    findings.push({
      id: row.id as string,
      title: row.title as string,
      severity: row.severity as any,
      description: row.description as string,
      file: row.file as string,
      line: row.line as string,
      status: row.status as any,
      created_by: row.created_by as any,
      assigned_to: (row.assigned_to as any) || null,
      resolution: (row.resolution as string) || null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    });
  }
  stmt.free();
  return findings;
}

export async function getFinding(id: string): Promise<Finding | null> {
  const d = await getDb();
  const stmt = d.prepare('SELECT * FROM findings WHERE id = ?');
  stmt.bind([id]);
  let finding: Finding | null = null;
  if (stmt.step()) {
    const row = stmt.getAsObject();
    finding = {
      id: row.id as string,
      title: row.title as string,
      severity: row.severity as any,
      description: row.description as string,
      file: row.file as string,
      line: row.line as string,
      status: row.status as any,
      created_by: row.created_by as any,
      assigned_to: (row.assigned_to as any) || null,
      resolution: (row.resolution as string) || null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }
  stmt.free();
  return finding;
}

export async function createFinding(input: {
  title: string;
  severity: string;
  description: string;
  file: string;
  line?: string | number;
  created_by?: AgentType;
  assigned_to?: AgentType | null;
  status?: string;
}): Promise<Finding> {
  const d = await getDb();
  const now = new Date().toISOString();

  const id = await getNextId('findings', 'BUG', 'findings');
  const severity = input.severity || 'medium';
  const created_by = input.created_by || 'chatgpt';
  const assigned_to = input.assigned_to !== undefined ? input.assigned_to : 'gemini';
  const status = input.status || (assigned_to ? 'assigned' : 'open');
  const line = input.line ? String(input.line) : '1';

  d.run(
    `INSERT INTO findings (id, title, severity, description, file, line, status, created_by, assigned_to, resolution, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.title,
      severity,
      input.description,
      input.file,
      line,
      status,
      created_by,
      assigned_to,
      null,
      now,
      now,
    ]
  );

  persistToDisk();

  await logActivity({
    agent: created_by,
    action: `Identified finding ${id}`,
    entity_type: 'finding',
    entity_id: id,
    details: `[${severity.toUpperCase()}] "${input.title}" at ${input.file}:${line}`,
  });

  await createMessage({
    from: created_by,
    to: assigned_to || 'gemini',
    type: 'finding',
    content: `Finding ${id} reported [${severity.toUpperCase()}]: "${input.title}" in ${input.file}:${line}. Details: ${input.description}`,
    finding_id: id,
  });

  return (await getFinding(id))!;
}

export async function updateFinding(
  id: string,
  updates: Partial<Omit<Finding, 'id' | 'created_at'>>,
  agent: AgentType = 'chatgpt'
): Promise<Finding> {
  const current = await getFinding(id);
  if (!current) {
    throw new Error(`Finding ${id} not found`);
  }

  const d = await getDb();
  const now = new Date().toISOString();

  const cleanUpdates: Partial<Finding> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      (cleanUpdates as any)[key] = value;
    }
  }

  const updated: Finding = {
    ...current,
    ...cleanUpdates,
    updated_at: now,
  };

  d.run(
    `UPDATE findings SET
      title = ?,
      severity = ?,
      description = ?,
      file = ?,
      line = ?,
      status = ?,
      assigned_to = ?,
      resolution = ?,
      updated_at = ?
     WHERE id = ?`,
    [
      updated.title ?? current.title,
      updated.severity ?? current.severity,
      updated.description ?? current.description,
      updated.file ?? current.file,
      String(updated.line ?? current.line),
      updated.status ?? current.status,
      updated.assigned_to !== undefined ? updated.assigned_to : (current.assigned_to || null),
      updated.resolution !== undefined ? updated.resolution : (current.resolution || null),
      updated.updated_at,
      id,
    ]
  );

  persistToDisk();

  await logActivity({
    agent,
    action: `Updated finding ${id}`,
    entity_type: 'finding',
    entity_id: id,
    details: `Status: ${updated.status} ${updated.resolution ? `| Resolution: ${updated.resolution}` : ''}`,
  });

  return updated;
}

// ---------------- MESSAGES ----------------

export async function getMessages(filter?: { task_id?: string; finding_id?: string; from?: string; to?: string; limit?: number }): Promise<Message[]> {
  const d = await getDb();
  let query = 'SELECT * FROM messages WHERE 1=1';
  const params: any[] = [];

  if (filter?.task_id) {
    query += ' AND task_id = ?';
    params.push(filter.task_id);
  }
  if (filter?.finding_id) {
    query += ' AND finding_id = ?';
    params.push(filter.finding_id);
  }
  if (filter?.from) {
    query += ' AND from_agent = ?';
    params.push(filter.from);
  }
  if (filter?.to) {
    query += ' AND to_agent = ?';
    params.push(filter.to);
  }
  query += ' ORDER BY created_at DESC';
  if (filter?.limit) {
    query += ' LIMIT ?';
    params.push(filter.limit);
  } else {
    query += ' LIMIT 100';
  }

  const stmt = d.prepare(query);
  if (params.length > 0) {
    stmt.bind(params);
  }

  const messages: Message[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    messages.push({
      id: row.id as string,
      from: row.from_agent as any,
      to: row.to_agent as any,
      type: row.type as any,
      content: row.content as string,
      task_id: (row.task_id as string) || null,
      finding_id: (row.finding_id as string) || null,
      created_at: row.created_at as string,
    });
  }
  stmt.free();
  return messages;
}

export async function createMessage(input: {
  from: AgentType;
  to?: TargetAgentType;
  type: string;
  content: string;
  task_id?: string | null;
  finding_id?: string | null;
}): Promise<Message> {
  const d = await getDb();
  const now = new Date().toISOString();

  const id = await getNextId('messages', 'MSG', 'messages');
  const toAgent = input.to || 'all';

  d.run(
    `INSERT INTO messages (id, from_agent, to_agent, type, content, task_id, finding_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.from,
      toAgent,
      input.type,
      input.content,
      input.task_id || null,
      input.finding_id || null,
      now,
    ]
  );

  persistToDisk();

  return {
    id,
    from: input.from,
    to: toAgent,
    type: input.type as any,
    content: input.content,
    task_id: input.task_id || null,
    finding_id: input.finding_id || null,
    created_at: now,
  };
}

// ---------------- AGENT STATUS ----------------

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export async function getAgentStatuses(): Promise<Record<'chatgpt' | 'gemini' | 'human', AgentStatus>> {
  const d = await getDb();
  const stmt = d.prepare('SELECT * FROM agent_status');
  const nowMs = Date.now();
  const result: Record<'chatgpt' | 'gemini' | 'human', AgentStatus> = {
    chatgpt: { agent: 'chatgpt', status: 'idle', last_active_at: new Date().toISOString() },
    gemini: { agent: 'gemini', status: 'idle', last_active_at: new Date().toISOString() },
    human: { agent: 'human', status: 'idle', last_active_at: new Date().toISOString() },
  };

  while (stmt.step()) {
    const row = stmt.getAsObject();
    const agent = row.agent as 'chatgpt' | 'gemini' | 'human';
    const lastActiveAt = row.last_active_at as string;
    const lastActiveMs = Date.parse(lastActiveAt) || 0;
    const isWorkingOrReviewing = row.status === 'working' || row.status === 'reviewing';
    const isStale = isWorkingOrReviewing && (nowMs - lastActiveMs > STALE_THRESHOLD_MS);

    result[agent] = {
      agent,
      status: row.status as AgentOperationalStatus,
      current_task_id: (row.current_task_id as string) || null,
      last_active_at: lastActiveAt,
      last_heartbeat_at: lastActiveAt,
      is_stale: isStale,
      message: (row.message as string) || null,
    };
  }
  stmt.free();
  return result;
}

export async function setAgentStatus(input: {
  agent: 'chatgpt' | 'gemini' | 'human';
  status: AgentOperationalStatus;
  current_task_id?: string | null;
  message?: string | null;
}): Promise<AgentStatus> {
  const d = await getDb();
  const now = new Date().toISOString();

  d.run(
    `INSERT OR REPLACE INTO agent_status (agent, status, current_task_id, last_active_at, message)
     VALUES (?, ?, ?, ?, ?)`,
    [
      input.agent,
      input.status,
      input.current_task_id || null,
      now,
      input.message || null,
    ]
  );

  persistToDisk();

  await logActivity({
    agent: input.agent,
    action: `Agent status: ${input.status}`,
    entity_type: 'system',
    entity_id: input.agent,
    details: input.message || (input.current_task_id ? `Task ${input.current_task_id}` : undefined),
  });

  return {
    agent: input.agent,
    status: input.status,
    current_task_id: input.current_task_id || null,
    last_active_at: now,
    last_heartbeat_at: now,
    is_stale: false,
    message: input.message || null,
  };
}

export async function recordHeartbeat(input: 'chatgpt' | 'gemini' | 'human' | {
  agent: 'chatgpt' | 'gemini' | 'human';
  task_id?: string | null;
  status?: AgentOperationalStatus;
  message?: string | null;
}): Promise<AgentStatus> {
  const agentName = typeof input === 'string' ? input : input.agent;
  const currentStatuses = await getAgentStatuses();
  const current = currentStatuses[agentName];
  const newStatus = (typeof input === 'object' && input.status) || current?.status || 'idle';
  const newTaskId = (typeof input === 'object' && input.task_id !== undefined) ? input.task_id : (current?.current_task_id || null);
  const newMessage = (typeof input === 'object' && input.message !== undefined) ? input.message : (current?.message || null);

  return await setAgentStatus({
    agent: agentName,
    status: newStatus,
    current_task_id: newTaskId,
    message: newMessage,
  });
}

// Concise workflow state tailored for quick AI decision making
export async function getWorkflowStateForAgent(agentName: string = 'gemini'): Promise<WorkflowStateResponse> {
  const normalizedAgent = (agentName || 'gemini').toLowerCase() as 'chatgpt' | 'gemini' | 'human';
  const project = await getProject();
  const agents = await getAgentStatuses();
  const myAgent = agents[normalizedAgent] || {
    agent: normalizedAgent,
    status: 'idle',
    last_active_at: new Date().toISOString(),
  };

  const tasks = await getTasks({ limit: 50 });
  const openFindings = (await getFindings({ limit: 50 })).filter((f) => f.status === 'open' || f.status === 'assigned');
  const recentMessages = await getMessages({ limit: 15 });

  const pendingForMe = tasks.filter((t) => t.assignee === normalizedAgent && (t.status === 'assigned' || t.status === 'pending'));
  const tasksInReview = tasks.filter((t) => t.status === 'review');
  const activeTask = myAgent.current_task_id ? tasks.find((t) => t.id === myAgent.current_task_id) || null : null;

  let actionRequired = false;
  let nextAction: 'claim_task' | 'continue_task' | 'review_task' | 'standby' = 'standby';

  if (normalizedAgent === 'gemini') {
    if (activeTask && (activeTask.status === 'working' || activeTask.status === 'assigned')) {
      actionRequired = true;
      nextAction = 'continue_task';
    } else if (pendingForMe.length > 0) {
      actionRequired = true;
      nextAction = 'claim_task';
    } else {
      actionRequired = false;
      nextAction = 'standby';
    }
  } else if (normalizedAgent === 'chatgpt') {
    if (tasksInReview.length > 0) {
      actionRequired = true;
      nextAction = 'review_task';
    } else {
      actionRequired = false;
      nextAction = 'standby';
    }
  }

  return {
    project: {
      project_name: project.project_name,
      project_root: project.project_root,
      repository_url: project.repository_url,
      default_branch: project.default_branch,
      current_goal: project.current_goal,
      test_command: project.test_command,
    },
    my_agent: myAgent,
    action_required: actionRequired,
    next_action: nextAction,
    active_task: activeTask,
    pending_tasks_for_me: pendingForMe,
    tasks_needing_review: tasksInReview,
    open_findings: openFindings,
    recent_messages: recentMessages,
    agents,
    server_time: new Date().toISOString(),
  };
}

// ---------------- ACTIVITY ----------------

export async function logActivity(input: {
  agent: AgentType;
  action: string;
  entity_type: 'task' | 'finding' | 'message' | 'project' | 'test' | 'git' | 'system';
  entity_id?: string | null;
  details?: string | null;
}): Promise<Activity> {
  const d = await getDb();
  const now = new Date().toISOString();

  const countStmt = d.prepare('SELECT COUNT(*) as count FROM activity');
  countStmt.step();
  const count = (countStmt.getAsObject().count as number) + 1;
  countStmt.free();

  const id = `ACT-${count}`;

  d.run(
    `INSERT INTO activity (id, agent, action, entity_type, entity_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.agent,
      input.action,
      input.entity_type,
      input.entity_id || null,
      input.details || null,
      now,
    ]
  );

  persistToDisk();

  return {
    id,
    agent: input.agent,
    action: input.action,
    entity_type: input.entity_type,
    entity_id: input.entity_id || null,
    details: input.details || null,
    created_at: now,
  };
}

export async function getActivities(limit = 50): Promise<Activity[]> {
  const d = await getDb();
  const stmt = d.prepare('SELECT * FROM activity ORDER BY created_at DESC LIMIT ?');
  stmt.bind([limit]);
  const list: Activity[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    list.push({
      id: row.id as string,
      agent: row.agent as any,
      action: row.action as string,
      entity_type: row.entity_type as any,
      entity_id: (row.entity_id as string) || null,
      details: (row.details as string) || null,
      created_at: row.created_at as string,
    });
  }
  stmt.free();
  return list;
}

// ---------------- WORKSPACE STATE ----------------

export async function getWorkspaceState(): Promise<WorkspaceState> {
  const project = await getProject();
  const agents = await getAgentStatuses();
  const tasks = await getTasks({ limit: 100 });
  const findings = await getFindings({ limit: 100 });
  const recent_messages = await getMessages({ limit: 25 });
  const recent_activity = await getActivities(30);

  const stats = {
    total_tasks: tasks.length,
    pending_tasks: tasks.filter((t) => t.status === 'pending' || t.status === 'assigned').length,
    working_tasks: tasks.filter((t) => t.status === 'working').length,
    review_tasks: tasks.filter((t) => t.status === 'review').length,
    completed_tasks: tasks.filter((t) => t.status === 'completed').length,
    open_findings: findings.filter((f) => f.status === 'open' || f.status === 'assigned').length,
    verified_findings: findings.filter((f) => f.status === 'verified' || f.status === 'fixed').length,
  };

  return {
    project,
    agents,
    tasks,
    findings,
    recent_messages,
    recent_activity,
    stats,
  };
}

// ---------------- COMMAND RECEIPTS ----------------

export interface CommandReceipt {
  command_id: string;
  command_type: string;
  status: string;
  result: string | null;
  created_at: string;
}

export async function isCommandProcessed(commandId: string): Promise<boolean> {
  const receipt = await getCommandReceipt(commandId);
  return receipt !== null && receipt.status === 'success';
}

export async function getCommandReceipt(commandId: string): Promise<CommandReceipt | null> {
  const d = await getDb();
  const stmt = d.prepare('SELECT * FROM command_receipts WHERE command_id = ?');
  stmt.bind([commandId]);
  let receipt: CommandReceipt | null = null;
  if (stmt.step()) {
    const row = stmt.getAsObject();
    receipt = {
      command_id: row.command_id as string,
      command_type: row.command_type as string,
      status: row.status as string,
      result: (row.result as string) || null,
      created_at: row.created_at as string,
    };
  }
  stmt.free();
  return receipt;
}

export async function recordCommandReceipt(input: {
  command_id: string;
  command_type: string;
  status?: string;
  result?: string | null;
}): Promise<CommandReceipt> {
  const d = await getDb();
  const now = new Date().toISOString();
  const status = input.status || 'success';
  const result = typeof input.result === 'string' ? input.result : (input.result ? JSON.stringify(input.result) : null);

  d.run(
    `INSERT OR REPLACE INTO command_receipts (command_id, command_type, status, result, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [input.command_id, input.command_type, status, result, now]
  );
  persistToDisk();

  return {
    command_id: input.command_id,
    command_type: input.command_type,
    status,
    result,
    created_at: now,
  };
}
