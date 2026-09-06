import assert from 'node:assert';
import { isSameOriginBrowserRequest, requireStudioAuth, verifyStudioToken, verifyToken } from '../server/auth.js';

function req(headers: Record<string, string> = {}, query: Record<string, string> = {}) {
  return { headers, query } as any;
}

function responseRecorder() {
  const state = { statusCode: 200, body: null as any };
  const res = {
    status(code: number) { state.statusCode = code; return res; },
    json(body: any) { state.body = body; return res; },
  } as any;
  return { res, state };
}

const previousMaster = process.env.BRIDGE_MCP_TOKEN;
const previousStudio = process.env.BRIDGE_STUDIO_TOKEN;
process.env.BRIDGE_MCP_TOKEN = 'master-test-token';
process.env.BRIDGE_STUDIO_TOKEN = 'studio-test-token';

try {
  assert.strictEqual(isSameOriginBrowserRequest(req({
    host: 'bridge.example',
    origin: 'https://bridge.example',
    'user-agent': 'Mozilla/5.0',
  })), false, 'Origin alone must not bypass REST auth');

  assert.strictEqual(isSameOriginBrowserRequest(req({
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'cors',
    'user-agent': 'Mozilla/5.0 Chrome/140 Safari/537.36',
  })), true, 'real same-origin browser fetch metadata should preserve dashboard access');

  assert.strictEqual(verifyToken(req({ authorization: 'Bearer studio-test-token' })), false,
    'Studio token must not open general privileged APIs');
  assert.strictEqual(verifyStudioToken(req({ authorization: 'Bearer studio-test-token' })), true,
    'Studio token should open Studio Relay');
  assert.strictEqual(verifyStudioToken(req({ authorization: 'Bearer master-test-token' })), true,
    'Master token should remain valid for Studio Relay');

  {
    let called = false;
    const { res, state } = responseRecorder();
    requireStudioAuth(req({
      host: 'bridge.example',
      origin: 'https://bridge.example',
      'user-agent': 'Mozilla/5.0',
    }), res, (() => { called = true; }) as any);
    assert.strictEqual(called, false);
    assert.strictEqual(state.statusCode, 401, 'Studio Relay must reject same-origin header spoof without token');
  }

  {
    let called = false;
    const { res } = responseRecorder();
    requireStudioAuth(req({ authorization: 'Bearer studio-test-token' }), res, (() => { called = true; }) as any);
    assert.strictEqual(called, true, 'Studio Relay should accept scoped Studio token');
  }

  console.log('Auth security tests passed');
} finally {
  if (previousMaster === undefined) delete process.env.BRIDGE_MCP_TOKEN;
  else process.env.BRIDGE_MCP_TOKEN = previousMaster;
  if (previousStudio === undefined) delete process.env.BRIDGE_STUDIO_TOKEN;
  else process.env.BRIDGE_STUDIO_TOKEN = previousStudio;
}
