# Bridge — Shared AI Workspace

> A production-oriented collaboration layer allowing **ChatGPT Web** (Reviewer & Architect) and **Gemini 3.7 Flash** (Coder & Executor) to inspect a project, share live context, manage tasks & findings, and collaborate without manual copy/pasting.

Repository: [https://github.com/machxanht/Bridge](https://github.com/machxanht/Bridge)

---

## 1. What Bridge Is

Bridge is a lightweight, remote-first shared workspace and MCP communication server. It connects two AI agents with distinct, specialized roles:

- **ChatGPT (Reviewer / Architect / Task Manager)**: Inspects project structure, searches code, analyzes Git diffs and test results, logs code review findings, and dispatches structured tasks.
- **Gemini 3.7 Flash (Coder / Executor / Tester)**: Receives assigned tasks from Bridge, edits workspace files directly, executes tests, fixes bugs, and reports results back to Bridge.
- **Bridge Core & UI**: Serves as the central source of truth, persistent SQLite collaboration store, remote Streamable HTTP MCP server, and real-time control panel for the human operator.

**Core Philosophy:** The human operator never needs to copy/paste code, prompts, error logs, or results between ChatGPT and Gemini.

---

## 2. Architecture

```
                 Shared Project (Filesystem + Git)
                                 │
                 Bridge Remote MCP (Streamable HTTP)
                                 │
          ┌──────────────────────┴──────────────────────┐
          │                                             │
      ChatGPT                                      Gemini 3.7 Flash
  Reviewer & Architect                            Coder & Executor
   • project_read_file                             • Direct file edits
   • project_git_diff                              • project_test
   • finding_create                                • task_update
   • task_create                                   • message_send
          │                                             │
          └──────────────────────┬──────────────────────┘
                                 │
                   Shared Task & Finding State
                 (Embedded SQLite Database - WAL)
                                 │
                     Interactive Workspace UI
```

### Key Technical Decisions
- **Streamable HTTP MCP Transport**: Standard JSON-RPC 2.0 / MCP 2024-11-05 over HTTP `POST /mcp` instead of SSE-only, supporting both remote agent frameworks and OpenAI Actions.
- **Sandboxed File Operations**: All filesystem reads, searches, and test executions are strictly contained inside the configured `project_root` with path traversal guards.
- **Local Embedded SQLite**: Zero external infrastructure dependencies (no Redis, Kafka, or Kubernetes). Fast, persistent, and easy to run anywhere.

---

## 3. Local Setup

### Prerequisites
- Node.js 18+ or 20+
- Git

### Installation
```bash
# Clone the repository
git clone https://github.com/machxanht/Bridge.git
cd Bridge

# Install dependencies
npm install

# Configure environment
cp .env.example .env
```

### Environment Configuration (`.env`)
```env
# Server Port (Default: 3000)
PORT=3000

# Secret token required for remote MCP clients (ChatGPT / Gemini)
BRIDGE_MCP_TOKEN=bridge-mcp-secret-token

# Active project configuration
PROJECT_NAME=Bridge
PROJECT_ROOT=.
DEFAULT_BRANCH=main
```

---

## 4. How to Configure a Project

Bridge supports one active project at a time as the source of truth. You can configure it via environment variables or directly in the **Settings** tab of the UI:

- **Project Name**: Display name for the workspace (e.g., `My Backend Service`).
- **Project Root**: Path to the repository on disk (e.g., `.` for the current directory or `/path/to/repo`).
- **Repository URL**: GitHub / remote repository URL.
- **Default Branch**: Branch to compare diffs and inspect status (e.g., `main`).
- **Test Command**: Command to run automated validation (e.g., `npm test` or `npm run lint` or `pytest`).

---

## 5. How to Start Bridge & MCP Server

### Development Mode (with Live UI & Hot Reload)
```bash
npm run dev
```

### Production Build & Start
```bash
npm run build
npm run start
```

Once running:
- **Web UI & Control Panel**: `http://localhost:3000`
- **Remote MCP Endpoint**: `http://localhost:3000/mcp` (or `https://your-domain.com/mcp`)
- **Health Check**: `http://localhost:3000/api/health`

---

## 6. How to Open the UI

Navigate to `http://localhost:3000` in your web browser.

The UI provides 5 dedicated views:
1. **Workspace**: Live real-time dashboard with agent status cards, active tasks, open findings, activity feed, auto-review toggle, and human command bar.
2. **Tasks**: Detailed task manager with priority filters, markdown description viewer, execution result log, and status lifecycle transitions.
3. **Findings**: Bug and architecture findings board categorized by severity (`CRITICAL`, `HIGH`, `MED`, `LOW`, `INFO`), with line numbers and 1-click "Create Task for Gemini" actions.
4. **Messages**: Structured agent-to-agent communication stream (handoffs, reviews, results, questions).
5. **Git & Code**: Integrated filesystem explorer, file viewer, real-time Git status, Git diff viewer, commit history, and interactive test runner.
6. **Settings**: MCP remote connection URLs, security status, copyable Gemini MCP config, ChatGPT Custom GPT Action instructions, and database management.

---

## 7. How to Connect Gemini's Remote MCP Tool

Google's managed Antigravity agent and Gemini 3.7 Flash can connect to Bridge using the remote MCP tool configuration.

### Gemini MCP Tool Configuration JSON
Add the following to your agent's MCP settings:

```json
{
  "mcpServers": {
    "bridge": {
      "url": "https://your-bridge-host.run.app/mcp",
      "headers": {
        "Authorization": "Bearer bridge-mcp-secret-token",
        "x-agent-name": "gemini"
      }
    }
  }
}
```

*Note: For local development behind a proxy or tunnel (like Cloudflare Tunnel or ngrok), use the public HTTPS URL.*

---

## 8. How to Configure ChatGPT's MCP Connection

ChatGPT Web can connect to Bridge via **Custom GPT Actions** or remote MCP connectors.

### ChatGPT Setup Steps
1. In ChatGPT, go to **Explore GPTs** -> **Create a GPT** -> **Configure**.
2. **Name**: `Bridge Workspace Reviewer`
3. **Instructions**:
   ```
   You are the Reviewer, Architect, and Task Manager for the Bridge Shared AI Workspace.
   You have access to the Bridge MCP tools.
   1. Use project_info, project_list_files, project_read_file, and project_search to inspect code.
   2. Use project_git_status and project_git_diff to review changes.
   3. When you find an issue, call finding_create and create a task for Gemini with task_create.
   4. Never assume you can modify files directly; Gemini is the coding agent.
   5. When Gemini reports completion, review the diff with project_git_diff and tests with project_test, then mark the finding verified or assign a follow-up task.
   ```
4. **Actions**: Add an Action and configure the endpoint URL `https://your-bridge-host.run.app/mcp`.
5. **Authentication**: Choose **Bearer** and enter your `BRIDGE_MCP_TOKEN`.

---

## 9. How Tasks, Findings, and Messages Work

### Task Model
```typescript
interface Task {
  id: string; // e.g. "TASK-21"
  title: string;
  description: string;
  priority: "urgent" | "high" | "medium" | "low";
  status: "pending" | "assigned" | "working" | "blocked" | "review" | "completed" | "cancelled";
  assignee: "gemini" | "chatgpt" | "human";
  created_by: "chatgpt" | "gemini" | "human";
  related_files: string[];
  related_finding?: string;
  result?: string; // Execution report from Gemini
}
```

### Finding Model
```typescript
interface Finding {
  id: string; // e.g. "BUG-21"
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  description: string;
  file: string;
  line: string | number;
  status: "open" | "assigned" | "fixed" | "rejected" | "verified";
  created_by: "chatgpt" | "gemini" | "human";
  assigned_to?: "gemini" | "chatgpt" | "human";
  resolution?: string;
}
```

### Message Model
```typescript
interface Message {
  id: string; // e.g. "MSG-1"
  from: "chatgpt" | "gemini" | "human" | "system";
  to: "chatgpt" | "gemini" | "human" | "all";
  type: "task" | "finding" | "review" | "status" | "question" | "result" | "handoff";
  content: string;
  task_id?: string;
  finding_id?: string;
}
```

---

## 10. Concrete End-to-End Workflow Example

### Scenario: Review and Fix Authentication

1. **Human Request**:
   - The Human enters into the Command Box: *"Review authentication implementation."*
2. **ChatGPT (Reviewer)**:
   - Inspects files using `project_search(query: "jwt")` and `project_read_file(file_path: "src/services/auth.ts")`.
   - Identifies a race condition during token refresh.
   - Calls `finding_create`: Logs `BUG-21` (*"Refresh token race condition in auth service"*).
   - Calls `task_create`: Dispatches `TASK-21` assigned to `gemini` with acceptance criteria and related files.
3. **Gemini 3.7 Flash (Coder)**:
   - Discovers `TASK-21` via `task_list`.
   - Inspects `BUG-21` context using `finding_get`.
   - Updates `task_update(id: "TASK-21", status: "working")`.
   - Edits `src/services/auth.ts` to add a mutex promise lock.
   - Runs `project_test` -> All tests pass.
   - Calls `task_update(id: "TASK-21", status: "review", result: "Added mutex lock in auth.ts. Added unit test. All tests pass.")`.
4. **ChatGPT (Reviewer)**:
   - Receives notification that `TASK-21` is in `review`.
   - Calls `project_git_diff` to review Gemini's changes.
   - Calls `project_test` to verify test results.
   - If tests pass: Calls `task_update(id: "TASK-21", status: "completed")` and `finding_update(id: "BUG-21", status: "verified")`.
   - If tests fail: Creates a follow-up task `TASK-22` with exact failure details for Gemini to fix.
5. **Human Observer**:
   - Watches the entire activity stream unfold live on the Bridge UI dashboard.

---

## 11. Security Considerations

- **Strict Sandbox Boundary**: File reads, searches, and test executions are validated against `project_root`. Path traversal (`../`) is blocked.
- **Sensitive File Protection**: Files matching `.env*`, `id_rsa`, `*.pem`, `*.key` are automatically hidden and forbidden from read or search tools.
- **Token Authentication**: MCP endpoints require a valid `BRIDGE_MCP_TOKEN` header or query param.
- **No Automatic Git Push**: Bridge does not push to GitHub or create unapproved commits automatically.
- **No Direct Write for ChatGPT**: ChatGPT is restricted to read, search, review, and task management tools. Only the coding agent (Gemini) or human modifies files.

---

## 12. Known Limitations & Roadmap

- **Single Active Project**: Bridge currently tracks one active project at a time per instance for MVP simplicity.
- **Local Process Execution**: `project_test` runs in the local container/host environment with a 30-second timeout.
- **Network Ingress**: Remote clients (ChatGPT Web and Gemini Cloud) require the MCP server to be hosted on an externally accessible HTTPS URL (or tunnel).

---

## License
MIT
