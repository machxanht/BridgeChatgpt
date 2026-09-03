import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { getProject } from './db.js';
import { isSameOriginBrowserRequest } from './auth.js';
import { buildWakeQueue } from './wakeQueue.js';

export const androidWakeRouter = Router();

const TOKEN_PREFIX = 'bridgewake';
const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
// Production deployments created from AI Studio do not always expose a place to
// inject BRIDGE_ANDROID_WAKE_SECRET/BRIDGE_MCP_TOKEN. Keep a process-local random
// signing key as a safe fallback rather than hard-coding a public repo secret.
// A new revision gets a new key; Bridge Android already auto-pairs again when its
// previous token is rejected, so rotation on restart is expected and harmless.
const PROCESS_WAKE_SECRET = crypto.randomBytes(32).toString('base64url');

interface WakeTokenPayload {
  v: 1;
  aud: 'bridge-wake-android';
  iat: number;
  exp: number;
}

function wakeSecret(): string {
  return process.env.BRIDGE_ANDROID_WAKE_SECRET || process.env.BRIDGE_MCP_TOKEN || PROCESS_WAKE_SECRET;
}

function signBody(body: string) {
  return crypto.createHmac('sha256', wakeSecret()).update(body).digest('base64url');
}

function issueWakeToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload: WakeTokenPayload = {
    v: 1,
    aud: 'bridge-wake-android',
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${TOKEN_PREFIX}.${body}.${signBody(body)}`;
}

function readBearer(req: Request) {
  const header = String(req.headers.authorization || '');
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || '';
}

function verifyWakeToken(token: string): WakeTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;
  const [, body, signature] = parts;
  const expected = signBody(body);
  const actualBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as WakeTokenPayload;
    const now = Math.floor(Date.now() / 1000);
    if (payload?.v !== 1 || payload.aud !== 'bridge-wake-android' || !payload.exp || payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

androidWakeRouter.get('/pair-token', (req: Request, res: Response) => {
  try {
    if (!isSameOriginBrowserRequest(req)) {
      res.status(403).json({ ok: false, error: 'Pairing must be initiated from the same-origin Bridge dashboard.' });
      return;
    }
    const token = issueWakeToken();
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      token,
      expires_in_seconds: TOKEN_TTL_SECONDS,
      scope: 'android-wake-readonly',
    });
  } catch (error: any) {
    res.status(503).json({ ok: false, error: error?.message || String(error) });
  }
});

androidWakeRouter.get('/queue', async (req: Request, res: Response) => {
  try {
    const token = readBearer(req);
    const payload = token ? verifyWakeToken(token) : null;
    if (!payload) {
      res.status(401).json({ ok: false, error: 'Invalid or expired Android wake token.' });
      return;
    }
    const project = await getProject();
    const events = await buildWakeQueue(project);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, events, server_time: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || String(error) });
  }
});
