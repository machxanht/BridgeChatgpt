import type { NextFunction, Request, Response } from 'express';
import { getProject } from './db.js';
import { getResourceRegistry } from './resourceRegistry.js';
import {
  getWorkspaceRegistry,
  type AgentInstanceRecord,
  type WorkspaceRegistrySnapshot,
} from './workspaceRegistry.js';

export type StudioSessionSelection =
  | { mode: 'legacy'; workspace_id: string; instance: null; candidates: [] }
  | { mode: 'resolved'; workspace_id: string; instance: AgentInstanceRecord; candidates: AgentInstanceRecord[] }
  | { mode: 'explicit-new'; workspace_id: string; instance: null; candidates: AgentInstanceRecord[]; agent_instance_id: string }
  | { mode: 'ambiguous'; workspace_id: string; instance: null; candidates: AgentInstanceRecord[] };

function clean(value: unknown) {
  return String(value || '').trim();
}

export function resolveStudioSessionSelection(
  snapshot: WorkspaceRegistrySnapshot,
  input: { workspace_id?: string; agent_instance_id?: string },
): StudioSessionSelection {
  const fallback = snapshot.workspaces[0];
  if (!fallback) throw new Error('workspace registry has no workspace');

  const explicitInstanceId = clean(input.agent_instance_id);
  const requestedWorkspaceId = clean(input.workspace_id);
  const allStudios = snapshot.workspaces.flatMap(workspace => workspace.studio_instances);

  if (explicitInstanceId) {
    const existing = allStudios.find(instance => instance.agent_instance_id === explicitInstanceId);
    if (existing) {
      if (requestedWorkspaceId && requestedWorkspaceId !== existing.workspace_id) {
        throw new Error(
          `Studio instance ${explicitInstanceId} belongs to ${existing.workspace_id}/${existing.project_id}, not ${requestedWorkspaceId}. Rebind it through the registry before using it there.`,
        );
      }
      return {
        mode: 'resolved',
        workspace_id: existing.workspace_id,
        instance: existing,
        candidates: [existing],
      };
    }

    const workspaceId = requestedWorkspaceId || fallback.workspace_id;
    const workspace = snapshot.workspaces.find(item => item.workspace_id === workspaceId);
    if (!workspace) throw new Error(`workspace ${workspaceId} not found`);
    return {
      mode: 'explicit-new',
      workspace_id: workspaceId,
      instance: null,
      candidates: workspace.studio_instances,
      agent_instance_id: explicitInstanceId,
    };
  }

  const workspaceId = requestedWorkspaceId || fallback.workspace_id;
  const workspace = snapshot.workspaces.find(item => item.workspace_id === workspaceId);
  if (!workspace) throw new Error(`workspace ${workspaceId} not found`);

  if (workspace.studio_instances.length === 0) {
    return { mode: 'legacy', workspace_id: workspaceId, instance: null, candidates: [] };
  }
  if (workspace.studio_instances.length === 1) {
    return {
      mode: 'resolved',
      workspace_id: workspaceId,
      instance: workspace.studio_instances[0],
      candidates: workspace.studio_instances,
    };
  }
  return {
    mode: 'ambiguous',
    workspace_id: workspaceId,
    instance: null,
    candidates: workspace.studio_instances,
  };
}

function requestValue(req: Request, key: string) {
  return clean((req.body && req.body[key]) || req.query?.[key]);
}

function inject(req: Request, key: string, value: string) {
  if (!value) return;
  if (req.method === 'GET') {
    try { (req.query as Record<string, unknown>)[key] = value; } catch { /* Express query can be immutable in some adapters. */ }
  }
  if (!req.body || typeof req.body !== 'object') req.body = {};
  if (!req.body[key]) req.body[key] = value;
}

function isIdentitySensitivePath(path: string) {
  return path === '/state'
    || path === '/heartbeat'
    || path === '/claim'
    || path === '/progress'
    || path === '/result'
    || path.startsWith('/input/');
}

/**
 * Resolve a Studio tab/session before studioRelay touches the registry.
 * Primary identity: AI Studio app URL id (studio_app_id/resource_id) when supplied.
 * This lets the user configure only repo URL + Studio URL in Bridge; internal
 * workspace/agent ids remain an implementation detail.
 *
 * Backward compatible fallback:
 * - 0 Studio sessions in a workspace: preserve the legacy fallback.
 * - 1 Studio session: inject that exact registered identity automatically.
 * - >1 Studio sessions: reject ambiguous identity-sensitive requests unless
 *   agent_instance_id is explicit, preventing one tab from claiming another tab's task.
 */
export async function studioSessionPairingGuard(req: Request, res: Response, next: NextFunction) {
  if (!isIdentitySensitivePath(req.path)) {
    next();
    return;
  }

  try {
    const project = await getProject();
    const snapshot = await getWorkspaceRegistry(project);

    let requestedWorkspaceId = requestValue(req, 'workspace_id');
    let requestedInstanceId = requestValue(req, 'agent_instance_id');
    const studioAppId = requestValue(req, 'studio_app_id') || requestValue(req, 'resource_id');

    if (studioAppId) {
      const resources = await getResourceRegistry(project);
      const matches = resources.workspaces.flatMap(workspace => workspace.studio_targets).filter(target => target.resource_id === studioAppId);
      if (matches.length === 0) {
        res.status(404).json({
          ok: false,
          error: `AI Studio app id ${studioAppId} is not registered in Bridge. Add its AI Studio URL to Project Router first.`,
          code: 'STUDIO_APP_NOT_REGISTERED',
          studio_app_id: studioAppId,
        });
        return;
      }
      if (matches.length > 1) {
        res.status(409).json({
          ok: false,
          error: `AI Studio app id ${studioAppId} is mapped more than once. Keep one project mapping per app URL.`,
          code: 'STUDIO_APP_MAPPING_AMBIGUOUS',
          studio_app_id: studioAppId,
        });
        return;
      }

      const target = matches[0];
      if (requestedWorkspaceId && requestedWorkspaceId !== target.workspace_id) {
        res.status(409).json({
          ok: false,
          error: `AI Studio app ${studioAppId} belongs to ${target.workspace_id}/${target.project_id}, not ${requestedWorkspaceId}.`,
          code: 'STUDIO_APP_WRONG_PROJECT',
        });
        return;
      }
      if (requestedInstanceId && requestedInstanceId !== target.agent_instance_id) {
        res.status(409).json({
          ok: false,
          error: `AI Studio app ${studioAppId} maps to a different internal Bridge identity.`,
          code: 'STUDIO_APP_IDENTITY_CONFLICT',
        });
        return;
      }

      requestedWorkspaceId = target.workspace_id;
      requestedInstanceId = target.agent_instance_id;
      inject(req, 'workspace_id', target.workspace_id);
      inject(req, 'project_id', target.project_id);
      inject(req, 'agent_instance_id', target.agent_instance_id);
      inject(req, 'session_label', target.label);
    }

    const selection = resolveStudioSessionSelection(snapshot, {
      workspace_id: requestedWorkspaceId,
      agent_instance_id: requestedInstanceId,
    });

    if (selection.mode === 'ambiguous') {
      res.status(409).json({
        ok: false,
        error: `Workspace ${selection.workspace_id} has multiple Google AI Studio sessions. Send studio_app_id (preferred) or an explicit agent_instance_id.`,
        code: 'STUDIO_SESSION_AMBIGUOUS',
        workspace_id: selection.workspace_id,
        candidates: selection.candidates.map(instance => ({
          agent_instance_id: instance.agent_instance_id,
          session_label: instance.session_label,
          account_label: instance.account_label,
          status: instance.status,
        })),
      });
      return;
    }

    if (selection.mode === 'resolved' && selection.instance) {
      inject(req, 'workspace_id', selection.instance.workspace_id);
      inject(req, 'agent_instance_id', selection.instance.agent_instance_id);
      inject(req, 'account_label', selection.instance.account_label);
      inject(req, 'session_label', selection.instance.session_label);
    } else if (selection.mode === 'explicit-new') {
      inject(req, 'workspace_id', selection.workspace_id);
      inject(req, 'agent_instance_id', selection.agent_instance_id);
    } else {
      inject(req, 'workspace_id', selection.workspace_id);
    }

    next();
  } catch (error: any) {
    res.status(400).json({ ok: false, error: error?.message || String(error) });
  }
}
