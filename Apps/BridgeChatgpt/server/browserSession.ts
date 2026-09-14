import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Router, type Request } from 'express';

const COOKIE = '__Host-bridge-session';
const TTL = 8 * 60 * 60 * 1000;
const MAX_SESSIONS = 256;
type Session = { csrf: string; expires: number; generation: string };
const sessions = new Map<string, Session>();
let loginWindow = { started: 0, attempts: 0 };

function equal(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function configuration() {
  const password = process.env.BRIDGE_BROWSER_PASSWORD || '';
  const origin = process.env.BRIDGE_PUBLIC_ORIGIN || '';
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin || password.length < 32) return null;
    return { password, origin, generation: createHash('sha256').update(password).update(origin).digest('hex') };
  } catch { return null; }
}

function sessionId(req: Request): string {
  const values = String(req.headers.cookie || '').split(';').map(value => value.trim())
    .filter(value => value.startsWith(`${COOKIE}=`));
  if (values.length !== 1) return '';
  const id = values[0].slice(COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(id) ? id : '';
}

function lookup(req: Request): Session | null {
  const config = configuration();
  const id = sessionId(req);
  const session = sessions.get(id);
  if (!config || !session || session.expires <= Date.now() || session.generation !== config.generation) {
    sessions.delete(id);
    return null;
  }
  return session;
}

/** Cookies prove identity; Origin and CSRF protect mutations, never establish identity. */
export function verifyBrowserSession(req: Request): boolean {
  const session = lookup(req);
  if (!session) return false;
  if (['GET', 'HEAD'].includes(req.method)) return true;
  return req.headers.origin === configuration()?.origin
    && equal(String(req.headers['x-bridge-csrf'] || ''), session.csrf);
}

export const browserSessionRouter = Router();
browserSessionRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

browserSessionRouter.post('/login', (req, res) => {
  const config = configuration();
  if (!config) { res.status(503).json({ error: 'Browser sign-in is not configured.' }); return; }
  if (req.headers.origin !== config.origin || !req.is('application/json')) {
    res.status(403).json({ error: 'Invalid sign-in origin or content type.' }); return;
  }
  // A bounded, global budget avoids trusting spoofable client/proxy IP headers.
  const now = Date.now();
  if (now - loginWindow.started >= 60_000) loginWindow = { started: now, attempts: 0 };
  if (++loginWindow.attempts > 20) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'Too many sign-in attempts. Try again in a minute.' }); return;
  }
  if (typeof req.body?.password !== 'string' || !equal(req.body.password, config.password)) {
    res.status(401).json({ error: 'Invalid sign-in credential.' }); return;
  }
  for (const [id, session] of sessions) {
    if (session.expires <= now || session.generation !== config.generation) sessions.delete(id);
  }
  sessions.delete(sessionId(req));
  if (sessions.size >= MAX_SESSIONS) {
    res.status(503).json({ error: 'Session capacity reached.' }); return;
  }
  const id = randomBytes(32).toString('hex');
  const session = { csrf: randomBytes(32).toString('hex'), expires: now + TTL, generation: config.generation };
  sessions.set(id, session);
  res.cookie(COOKIE, id, { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: TTL });
  res.json({ authenticated: true, csrf: session.csrf, expires_at: session.expires });
});

browserSessionRouter.get('/session', (req, res) => {
  const session = lookup(req);
  if (!session) { res.status(401).json({ error: 'Sign-in required.' }); return; }
  res.json({ authenticated: true, csrf: session.csrf, expires_at: session.expires });
});

browserSessionRouter.post('/logout', (req, res) => {
  if (!verifyBrowserSession(req)) { res.status(403).json({ error: 'Invalid session or CSRF token.' }); return; }
  sessions.delete(sessionId(req));
  res.clearCookie(COOKIE, { httpOnly: true, secure: true, sameSite: 'strict', path: '/' });
  res.status(204).end();
});
