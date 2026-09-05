import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface PairedExecutorAuth {
  node_id: string;
  workspace_id: string;
  project_id: string;
}

interface PairingRecord {
  pairing_id: string;
  code_hash: string;
  workspace_id: string;
  project_id: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
}

interface TokenRecord extends PairedExecutorAuth {
  token_hash: string;
  created_at: string;
  revoked_at: string | null;
}

interface PairingStore {
  version: 1;
  pairings: PairingRecord[];
  tokens: TokenRecord[];
}

const ID_RE = /^[a-zA-Z0-9._:-]{3,160}$/;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let writeTail: Promise<void> = Promise.resolve();

function storePath() {
  return path.resolve(process.cwd(), process.env.BRIDGE_EXECUTOR_AUTH_STORE_PATH || 'data/executor-auth.json');
}

function emptyStore(): PairingStore {
  return { version: 1, pairings: [], tokens: [] };
}

function readStore(): PairingStore {
  const file = storePath();
  if (!fs.existsSync(file)) return emptyStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as PairingStore;
    if (parsed?.version !== 1 || !Array.isArray(parsed.pairings) || !Array.isArray(parsed.tokens)) return emptyStore();
    return parsed;
  } catch {
    return emptyStore();
  }
}

function writeStore(store: PairingStore) {
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

async function withWriteLock<T>(fn: () => Promise<T> | T): Promise<T> {
  let release!: () => void;
  const previous = writeTail;
  writeTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

function safeId(value: unknown, label: string) {
  const id = String(value || '').trim();
  if (!ID_RE.test(id)) throw new Error(`${label} is invalid`);
  return id;
}

function normalizeCode(value: unknown) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hash(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function generateCode() {
  const bytes = crypto.randomBytes(8);
  let raw = '';
  for (let i = 0; i < 8; i += 1) raw += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function cleanup(store: PairingStore, now = Date.now()) {
  store.pairings = store.pairings.filter((item) => {
    const expires = Date.parse(item.expires_at);
    const used = item.used_at ? Date.parse(item.used_at) : NaN;
    if (item.used_at && Number.isFinite(used) && now - used > 24 * 60 * 60_000) return false;
    if (!item.used_at && Number.isFinite(expires) && now - expires > 24 * 60 * 60_000) return false;
    return true;
  });
}

export async function issueExecutorPairing(input: {
  workspace_id: string;
  project_id: string;
  ttl_ms?: number;
}) {
  return withWriteLock(async () => {
    const store = readStore();
    cleanup(store);
    const workspaceId = safeId(input.workspace_id, 'workspace_id');
    const projectId = safeId(input.project_id, 'project_id');
    const ttl = Math.max(60_000, Math.min(Number(input.ttl_ms || 10 * 60_000), 30 * 60_000));
    let code = generateCode();
    while (store.pairings.some((item) => item.code_hash === hash(normalizeCode(code)) && !item.used_at)) code = generateCode();
    const now = new Date();
    const record: PairingRecord = {
      pairing_id: `PAIR-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`,
      code_hash: hash(normalizeCode(code)),
      workspace_id: workspaceId,
      project_id: projectId,
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + ttl).toISOString(),
      used_at: null,
    };
    store.pairings.push(record);
    writeStore(store);
    return {
      pairing_id: record.pairing_id,
      code,
      workspace_id: workspaceId,
      project_id: projectId,
      expires_at: record.expires_at,
    };
  });
}

export async function redeemExecutorPairing(input: { code: string; node_id: string }) {
  return withWriteLock(async () => {
    const store = readStore();
    cleanup(store);
    const normalized = normalizeCode(input.code);
    if (normalized.length !== 8) throw new Error('Pairing code is invalid');
    const nodeId = safeId(input.node_id, 'node_id');
    const codeHash = hash(normalized);
    const record = store.pairings.find((item) => item.code_hash === codeHash && !item.used_at);
    if (!record) throw new Error('Pairing code is invalid or already used');
    if (Date.parse(record.expires_at) <= Date.now()) throw new Error('Pairing code expired');

    record.used_at = new Date().toISOString();
    for (const token of store.tokens) {
      if (token.node_id === nodeId && !token.revoked_at) token.revoked_at = record.used_at;
    }
    const rawToken = `bex_${crypto.randomBytes(32).toString('base64url')}`;
    store.tokens.push({
      token_hash: hash(rawToken),
      node_id: nodeId,
      workspace_id: record.workspace_id,
      project_id: record.project_id,
      created_at: record.used_at,
      revoked_at: null,
    });
    writeStore(store);
    return {
      token: rawToken,
      node_id: nodeId,
      workspace_id: record.workspace_id,
      project_id: record.project_id,
    };
  });
}

export function verifyPairedExecutorToken(rawToken: string): PairedExecutorAuth | null {
  const token = String(rawToken || '').trim();
  if (!token.startsWith('bex_') || token.length < 24) return null;
  const store = readStore();
  const tokenHash = hash(token);
  const found = store.tokens.find((item) => item.token_hash === tokenHash && !item.revoked_at);
  if (!found) return null;
  return { node_id: found.node_id, workspace_id: found.workspace_id, project_id: found.project_id };
}

export async function resetExecutorPairingStoreForTests() {
  await withWriteLock(async () => {
    const file = storePath();
    try { fs.unlinkSync(file); } catch { /* ignore */ }
  });
}
