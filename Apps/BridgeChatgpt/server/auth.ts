import { timingSafeEqual } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { verifyBrowserSession } from './browserSession.js';

export interface AuthContext {
  authenticated: boolean;
  callerType: 'agent' | 'browser' | 'local' | 'unauthenticated';
  agentName?: string;
}

function cleanHeader(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();
}

function presentedToken(req: Request): string {
  const authHeader = cleanHeader(req.headers.authorization);
  if (authHeader) {
    const parts = authHeader.split(/\s+/, 2);
    if (parts.length === 2 && (parts[0] === 'Bearer' || parts[0] === 'Token')) return parts[1];
  }

  const headerToken = cleanHeader(req.headers['x-bridge-token'] || req.headers['x-mcp-token']);
  if (headerToken) return headerToken;

  return ''; // Credentials in URLs leak through history, logs and referrers.
}

function tokenEquals(presented: string, configured: string | undefined): boolean {
  if (!presented || !configured) return false;
  const left = Buffer.from(presented);
  const right = Buffer.from(configured);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Master Bridge token accepted across privileged REST/MCP APIs. */
export function verifyToken(req: Request): boolean {
  const configuredToken = process.env.BRIDGE_MCP_TOKEN;
  if (!configuredToken) return false;
  return tokenEquals(presentedToken(req), configuredToken);
}

/**
 * Studio Relay accepts either the master token or BRIDGE_STUDIO_TOKEN.
 * BRIDGE_STUDIO_TOKEN is intentionally scoped: requireAuth does not accept it,
 * so a Studio credential cannot open project/admin APIs outside /api/studio-relay.
 */
export function verifyStudioToken(req: Request): boolean {
  const masterToken = process.env.BRIDGE_MCP_TOKEN;
  const studioToken = process.env.BRIDGE_STUDIO_TOKEN;
  if (!masterToken && !studioToken) return false;
  const token = presentedToken(req);
  return tokenEquals(token, studioToken) || tokenEquals(token, masterToken);
}

/** Compatibility export: request metadata is never an identity credential. */
export function isSameOriginBrowserRequest(req: Request): boolean {
  return verifyBrowserSession(req);
}

function unauthorized(res: Response, scope: 'bridge' | 'studio'): void {
  const studio = scope === 'studio';
  res.status(401).json({
    error: studio
      ? 'Unauthorized: valid Studio or Bridge token required.'
      : 'Unauthorized: Invalid or missing BRIDGE_MCP_TOKEN.',
    message: studio
      ? 'Provide Authorization: Bearer <BRIDGE_STUDIO_TOKEN> (preferred) or the master BRIDGE_MCP_TOKEN.'
      : 'Provide header "Authorization: Bearer <BRIDGE_MCP_TOKEN>", "x-bridge-token", or an authenticated browser session with CSRF protection.',
    documentation: 'https://github.com/machxanht/BridgeChatgpt#authentication',
  });
}

/** Privileged REST auth while preserving the same-origin interactive dashboard. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (verifyToken(req)) {
    (req as any).auth = {
      authenticated: true,
      callerType: process.env.BRIDGE_MCP_TOKEN ? 'agent' : 'local',
      agentName: cleanHeader(req.headers['x-agent-name']) || undefined,
    };
    return next();
  }

  if (isSameOriginBrowserRequest(req)) {
    (req as any).auth = {
      authenticated: true,
      callerType: 'browser',
      agentName: 'human',
    };
    return next();
  }

  unauthorized(res, 'bridge');
}

/** Studio Relay is token-only. Browser same-origin heuristics never bypass it. */
export function requireStudioAuth(req: Request, res: Response, next: NextFunction): void {
  if (verifyStudioToken(req)) {
    (req as any).auth = {
      authenticated: true,
      callerType: process.env.BRIDGE_MCP_TOKEN || process.env.BRIDGE_STUDIO_TOKEN ? 'agent' : 'local',
      agentName: cleanHeader(req.headers['x-agent-name']) || 'google-ai-studio',
    };
    return next();
  }

  unauthorized(res, 'studio');
}
