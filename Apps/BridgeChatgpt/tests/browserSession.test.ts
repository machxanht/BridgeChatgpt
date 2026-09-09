import assert from 'node:assert/strict';
import express from 'express';
import { browserSessionRouter } from '../server/browserSession.js';
import { requireAuth } from '../server/auth.js';
import { executorRouter } from '../server/executorRoutes.js';
import { handleExecutorMcpRequest } from '../server/executorMcp.js';

const keys = ['BRIDGE_BROWSER_PASSWORD', 'BRIDGE_PUBLIC_ORIGIN', 'BRIDGE_MCP_TOKEN', 'BRIDGE_EXECUTOR_TOKEN'];
const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
process.env.BRIDGE_BROWSER_PASSWORD = 'test-only-browser-password-32-characters';
process.env.BRIDGE_PUBLIC_ORIGIN = 'https://bridge.example';
process.env.BRIDGE_MCP_TOKEN = 'test-only-controller-token';
const app = express();
app.use(express.json());
app.use('/api/auth', browserSessionRouter);
app.use('/api/executors', executorRouter);
app.all('/mcp-executor', handleExecutorMcpRequest);
let mutations = 0;
app.post('/api/turn', requireAuth, (_req, res) => { mutations++; res.json({ accepted: true }); });
app.get('/api/private', requireAuth, (_req, res) => { res.json({ private: true }); });
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
const origin = 'https://bridge.example';
const post = (path: string, headers = {}, body = {}) => fetch(base + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});
const login = () => post('/api/auth/login', { origin }, { password: process.env.BRIDGE_BROWSER_PASSWORD });

try {
  assert.equal((await post('/api/turn', { 'user-agent': 'Mozilla/5.0', 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors' })).status, 401);
  assert.equal((await post('/api/turn?token=test-only-controller-token')).status, 401);
  assert.equal((await post('/api/auth/login', { origin: 'https://evil.example' }, { password: process.env.BRIDGE_BROWSER_PASSWORD })).status, 403);
  assert.equal((await post('/api/auth/login', { origin }, { password: 'incorrect' })).status, 401);
  const response = await login();
  assert.equal(response.status, 200);
  const setCookie = response.headers.get('set-cookie')!;
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert(setCookie.includes(flag));
  assert(!setCookie.includes('Domain='));
  const cookie = setCookie.split(';')[0];
  const { csrf } = await response.json();
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(base + '/api/private', { headers: { cookie } })).status, 200);
  assert.equal((await post('/api/turn', { cookie, origin })).status, 401);
  assert.equal((await post('/api/turn', { cookie, origin, 'x-bridge-csrf': 'wrong' })).status, 401);
  assert.equal((await post('/api/turn', { cookie, origin: 'https://evil.example', 'x-bridge-csrf': csrf })).status, 401);
  assert.equal((await post('/api/turn', { cookie, origin, 'x-bridge-csrf': csrf })).status, 200);
  assert.equal(mutations, 1, 'only an authenticated, CSRF-protected turn reaches the consumer');
  assert.equal((await post('/api/auth/logout', { cookie, origin, 'x-bridge-csrf': csrf })).status, 204);
  assert.equal((await fetch(base + '/api/private', { headers: { cookie } })).status, 401, 'revoked cookie is rejected');
  const second = await login();
  const rotatedCookie = second.headers.get('set-cookie')!.split(';')[0];
  process.env.BRIDGE_BROWSER_PASSWORD = 'rotated-password-with-at-least-32-characters';
  assert.equal((await fetch(base + '/api/private', { headers: { cookie: rotatedCookie } })).status, 401, 'password rotation revokes previous generation');
  delete process.env.BRIDGE_MCP_TOKEN;
  delete process.env.BRIDGE_EXECUTOR_TOKEN;
  delete process.env.BRIDGE_BROWSER_PASSWORD;
  assert.equal((await post('/api/turn')).status, 401);
  assert.equal((await fetch(base + '/api/executors/snapshot')).status, 401);
  assert.equal((await post('/mcp-executor', {}, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).status, 401);
  assert.equal((await login()).status, 503);
  console.log('Browser session HTTP tests passed (local consumer, not native E2E)');
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  for (const key of keys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
}
