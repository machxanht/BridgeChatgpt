import { createExecutorJob, getExecutorSnapshot } from './executorStore.js';

export type ProjectSetupStatus = 'ready' | 'queued' | 'waiting_for_pc' | 'failed' | 'not_required';

export interface ProjectSetupWorkspace {
  workspace_id: string;
  project_id: string;
  repository_url: string;
  branch: string;
  local_path: string;
  setup_required?: boolean;
}

export interface ProjectSetupView {
  status: ProjectSetupStatus;
  job_id: string | null;
  error: string | null;
}

function latestSetupJob(jobs: any[], workspace: ProjectSetupWorkspace) {
  return jobs
    .filter(job => job.workspace_id === workspace.workspace_id && job.project_id === workspace.project_id && job.created_by === 'bridge-project-create')
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] || null;
}

function viewFromJob(job: any): ProjectSetupView {
  if (!job) return { status: 'waiting_for_pc', job_id: null, error: null };
  if (job.status === 'completed') return { status: 'ready', job_id: job.job_id, error: null };
  if (job.status === 'pending' || job.status === 'running') return { status: 'queued', job_id: job.job_id, error: null };
  return { status: 'failed', job_id: job.job_id, error: job.error || String(job.result?.stderr || job.result?.stdout || 'Project setup failed').trim().slice(-1000) };
}

export async function getProjectSetupView(workspace: ProjectSetupWorkspace): Promise<ProjectSetupView> {
  if (!workspace.setup_required) return { status: 'not_required', job_id: null, error: null };
  const snapshot = await getExecutorSnapshot({ limit: 200 });
  return viewFromJob(latestSetupJob(snapshot.jobs, workspace));
}

export async function queueProjectSetup(
  workspace: ProjectSetupWorkspace,
  options: { retryFailed?: boolean } = {},
): Promise<ProjectSetupView> {
  if (!workspace.setup_required) return { status: 'not_required', job_id: null, error: null };

  const snapshot = await getExecutorSnapshot({ limit: 200 });
  const existing = latestSetupJob(snapshot.jobs, workspace);
  const existingView = viewFromJob(existing);
  if (existing && existingView.status !== 'failed') return existingView;
  if (existing && existingView.status === 'failed' && !options.retryFailed) return existingView;

  const node = snapshot.nodes.find(item => item.connection_status === 'online' && item.capabilities.includes('command.run'));
  if (!node) return { status: 'waiting_for_pc', job_id: null, error: null };

  const job = await createExecutorJob({
    workspace_id: workspace.workspace_id,
    project_id: workspace.project_id,
    node_id: node.node_id,
    action: 'command.run',
    payload: {
      argv: [
        'node',
        'Apps/BridgeChatgpt/scripts/clone-project.mjs',
        '--repo', workspace.repository_url,
        '--branch', workspace.branch || 'main',
        '--target', workspace.local_path,
      ],
      cwd: '.',
      timeout_ms: 10 * 60_000,
    },
    created_by: 'bridge-project-create',
  });

  return { status: 'queued', job_id: job.job_id, error: null };
}

export async function ensureProjectSetup(workspace: ProjectSetupWorkspace): Promise<ProjectSetupView> {
  return queueProjectSetup(workspace, { retryFailed: false });
}
