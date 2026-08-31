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
    const projectName = process.env.PROJECT_NAME || 'Bridge';
    const projectRoot = process.env.PROJECT_ROOT || '.';
    const defaultBranch = process.env.DEFAULT_BRANCH || 'main';

    db.run(
      `INSERT INTO projects (id, project_name, project_root, repository_url, default_branch, current_goal, test_command, auto_review, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'proj-default',
        projectName,
        projectRoot,
        'https://github.com/machxanht/Bridge',
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
       ('gemini', 'idle', NULL, ?, 'Ready to receive tasks, edit files, and execute project tests.'),
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
  const d = await getDb();
  const now = new Date().toISOString();

  // Generate sequence id TASK-1, TASK-2...
  const countStmt = d.prepare('SELECT COUNT(*) as count FROM tasks');
  countStmt.step();
  const count = (countStmt.getAsObject().count as number) + 1;
  countStmt.free();

  const id = `TASK-${count}`;
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

  const updated: Task = {
    ...current,
    ...updates,
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
      updated.title,
      updated.description,
      updated.priority,
      updated.status,
      updated.assignee,
      updated.updated_at,
      JSON.stringify(updated.related_files || []),
      updated.related_finding || null,
      updated.result || null,
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

  // Generate sequence id BUG-1 or FIND-1
  const countStmt = d.prepare('SELECT COUNT(*) as count FROM findings');
  countStmt.step();
  const count = (countStmt.getAsObject().count as number) + 1;
  countStmt.free();

  const id = `BUG-${count}`;
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

  const updated: Finding = {
    ...current,
    ...updates,
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
      updated.title,
      updated.severity,
      updated.description,
      updated.file,
      String(updated.line),
      updated.status,
      updated.assigned_to || null,
      updated.resolution || null,
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

  const countStmt = d.prepare('SELECT COUNT(*) as count FROM messages');
  countStmt.step();
  const count = (countStmt.getAsObject().count as number) + 1;
  countStmt.free();

  const id = `MSG-${count}`;
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

export async function getAgentStatuses(): Promise<Record<'chatgpt' | 'gemini' | 'human', AgentStatus>> {
  const d = await getDb();
  const stmt = d.prepare('SELECT * FROM agent_status');
  const result: any = {
    chatgpt: { agent: 'chatgpt', status: 'idle', last_active_at: new Date().toISOString() },
    gemini: { agent: 'gemini', status: 'idle', last_active_at: new Date().toISOString() },
    human: { agent: 'human', status: 'idle', last_active_at: new Date().toISOString() },
  };

  while (stmt.step()) {
    const row = stmt.getAsObject();
    const agent = row.agent as 'chatgpt' | 'gemini' | 'human';
    result[agent] = {
      agent,
      status: row.status as AgentOperationalStatus,
      current_task_id: (row.current_task_id as string) || null,
      last_active_at: row.last_active_at as string,
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
    message: input.message || null,
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
