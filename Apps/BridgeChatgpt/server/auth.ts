import { Request, Response, NextFunction } from 'express';

export interface AuthContext {
  authenticated: boolean;
  callerType: 'agent' | 'browser' | 'local' | 'unauthenticated';
  agentName?: string;
}

/**
 * Centralized verification of Authorization tokens across MCP and REST API.
 * Supports:
 *  - Header "Authorization: Bearer <token>"
 *  - Header "Authorization: Token <token>"
 *  - Header "x-bridge-token: <token>"
 *  - Header "x-mcp-token: <token>"
 *  - Query parameter "?token=<token>"
 */
export function verifyToken(req: Request): boolean {
  const configuredToken = process.env.BRIDGE_MCP_TOKEN;
  if (!configuredToken) {
    // If no token is configured in environment, allow access in open/dev mode
    return true;
  }

  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && (parts[0] === 'Bearer' || parts[0] === 'Token')) {
      if (parts[1] === configuredToken) return true;
    }
  }

  const headerToken = req.headers['x-bridge-token'] || req.headers['x-mcp-token'];
  if (headerToken === configuredToken) return true;

  const queryToken = req.query.token as string;
  if (queryToken === configuredToken) return true;

  return false;
}

/**
 * Checks if the request originates from the same-origin interactive Browser UI
 * without exposing BRIDGE_MCP_TOKEN to the client-side JavaScript bundle.
 */
export function isSameOriginBrowserRequest(req: Request): boolean {
  // Check Sec-Fetch-Site header (standard in modern browsers)
  const secFetchSite = req.headers['sec-fetch-site'];
  const secFetchMode = req.headers['sec-fetch-mode'];
  const userAgent = req.headers['user-agent'] || '';
  const isBrowser = userAgent.includes('Mozilla') || userAgent.includes('Chrome') || userAgent.includes('Safari');

  if (secFetchSite === 'same-origin') {
    return true;
  }

  // Fallback check: Compare Host with Origin or Referer header
  const host = req.headers.host;
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  if (host && origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host === host) {
        return true;
      }
    } catch {
      // Invalid origin URL
    }
  }

  if (host && referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.host === host) {
        return true;
      }
    } catch {
      // Invalid referer URL
    }
  }

  // Check custom UI session header if established
  if (req.headers['x-bridge-ui'] === 'browser-dashboard' && isBrowser) {
    return true;
  }

  return false;
}

/**
 * Centralized authentication middleware for REST API endpoints.
 * Protects privileged endpoints from unauthorized remote access while
 * allowing legitimate same-origin browser interactions and authenticated MCP clients.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // 1. Check Bearer / Token Authentication (Primary for AI Agents & Remote MCP)
  if (verifyToken(req)) {
    (req as any).auth = {
      authenticated: true,
      callerType: process.env.BRIDGE_MCP_TOKEN ? 'agent' : 'local',
      agentName: (req.headers['x-agent-name'] as string) || undefined,
    };
    return next();
  }

  // 2. Check Same-Origin Browser UI Access
  // This allows the React dashboard to function seamlessly without embedding secrets in Vite JS
  if (isSameOriginBrowserRequest(req)) {
    (req as any).auth = {
      authenticated: true,
      callerType: 'browser',
      agentName: 'human',
    };
    return next();
  }

  // 3. Unauthorized
  res.status(401).json({
    error: 'Unauthorized: Invalid or missing BRIDGE_MCP_TOKEN.',
    message: 'Provide header "Authorization: Bearer <BRIDGE_MCP_TOKEN>", "x-bridge-token", or query "?token=<token>".',
    documentation: 'https://github.com/machxanht/BridgeChatgpt#authentication',
  });
}
