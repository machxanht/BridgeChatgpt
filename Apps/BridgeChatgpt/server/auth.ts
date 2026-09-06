import { timingSafeEqual } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';

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

  const queryToken = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token;
  return typeof queryToken === 'string' ? queryToken.trim() : '';
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
  if (!configuredToken) return true; // open/dev mode only
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
  if (!masterToken && !studioToken) return true; // open/dev mode only
  const token = presentedToken(req);
  return tokenEquals(token, studioToken) || tokenEquals(token, masterToken);
}

/**
 * Browser convenience path for the same-origin Bridge dashboard.
 * This is not used by Studio Relay. Only browser-generated Fetch Metadata is
 * accepted; Origin/Referer/custom-header fallbacks were removed because an
 * arbitrary HTTP client can trivially forge those headers.
 */
export function isSameOriginBrowserRequest(req: Request): boolean {
  const secFetchSite = cleanHeader(req.headers['sec-fetch-site']);
  const secFetchMode = cleanHeader(req.headers['sec-fetch-mode']);
  const userAgent = cleanHeader(req.headers['user-agent']);
  const isBrowser = /Mozilla|Chrome|Safari|Firefox/i.test(userAgent);
  return isBrowser
    && secFetchSite === 'same-origin'
    && (secFetchMode === 'cors' || secFetchMode === 'same-origin');
}

function unauthorized(res: Response, scope: 'bridge' | 'studio'): void {
  const studio = scope === 'studio';
  res.status(401).json({
    error: studio
      ? 'Unauthorized: valid Studio or Bridge token required.'
      : 'Unauthorized: Invalid or missing BRIDGE_MCP_TOKEN.',
    message: studio
      ? 'Provide Authorization: Bearer <BRIDGE_STUDIO_TOKEN> (preferred) or the master BRIDGE_MCP_TOKEN.'
      : 'Provide header "Authorization: Bearer <BRIDGE_MCP_TOKEN>", "x-bridge-token", or query "?token=<token>".',
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
