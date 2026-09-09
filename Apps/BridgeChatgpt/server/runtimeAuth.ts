import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';

export type RuntimeScope = 'runner' | 'browser' | 'attempt';
export interface RuntimeClaims {
  scope: RuntimeScope;
  sub: string;
  iat: number;
  exp: number;
  jti: string;
  attempt_id?: string;
  turn_id?: string;
  epoch?: number;
  transport?: string;
  parent_jti?: string;
}

const revoked = new Map<string, number>();
let revocationsLoaded=false;
function revocationPath(){return path.resolve(process.cwd(),'data/runtime-revocations.json');}
function loadRevocations(){
  if(revocationsLoaded)return;
  const file=revocationPath();
  if(fs.existsSync(file)){
    const records=JSON.parse(fs.readFileSync(file,'utf8'));
    if(!Array.isArray(records))throw new Error('Invalid runtime revocation store');
    for(const [jti,exp] of records)if(typeof jti==='string'&&Number.isFinite(exp))revoked.set(jti,exp);
  }
  revocationsLoaded=true;
}
function persistRevocations(){
  const file=revocationPath(),tmp=`${file}.${randomUUID()}.tmp`;
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(tmp,JSON.stringify([...revoked]),{flag:'wx'});
  const fd=fs.openSync(tmp,'r+');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(tmp,file);
}
const SECRET_KEYS = /^(BRIDGE_|RAILWAY_|GITHUB_|GH_|DATABASE_|SESSION_|COOKIE_)/i;

function secret(): string {
  const value = String(process.env.BRIDGE_MCP_TOKEN || '');
  if (value.length < 24) throw new Error('BRIDGE_MCP_TOKEN must be configured before runtime dispatch');
  return value;
}
function b64(value: string | Buffer) { return Buffer.from(value).toString('base64url'); }
function sign(body: string) { return createHmac('sha256', secret()).update(`bridge-runtime-v2.${body}`).digest('base64url'); }
function same(a: string, b: string) { const x=Buffer.from(a),y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); }
export function issueRuntimeToken(scope: RuntimeScope, sub: string, ttlMs: number, extra: Partial<RuntimeClaims> = {}): string {
  const now = Date.now();
  if(!['runner','browser','attempt'].includes(scope)||!sub||!Number.isFinite(ttlMs)||ttlMs<=0||ttlMs>8*60*60*1000)throw new Error('Invalid runtime grant');
  const claims: RuntimeClaims = { ...extra, scope, sub, iat: now, exp: now + ttlMs, jti: randomUUID() };
  const body = b64(JSON.stringify(claims));
  return `${body}.${sign(body)}`;
}

export function verifyRuntimeToken(token: string, scope?: RuntimeScope): RuntimeClaims | null {
  try {
  loadRevocations();
  if(typeof token!=='string'||token.length>4096)return null;
  const [body, signature, trailing] = String(token || '').split('.');
  if (!body || !signature || trailing || !same(signature, sign(body))) return null;
  let claims: RuntimeClaims;
  try { claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!claims.jti || typeof claims.sub!=='string' || !['runner','browser','attempt'].includes(claims.scope) || !Number.isFinite(claims.exp)||!Number.isFinite(claims.iat)||claims.iat>Date.now()+5000||claims.exp <= Date.now()) return null;
  if (scope && claims.scope !== scope) return null;
  if (revoked.has(claims.jti) || (claims.parent_jti && revoked.has(claims.parent_jti))) return null;
  return claims;
  } catch { return null; }
}

export function revokeRuntimeToken(token: string): boolean {
  const claims = verifyRuntimeToken(token);
  if (!claims) return false;
  revoked.set(claims.jti, claims.exp);
  persistRevocations();
  return true;
}

function bearer(req: Request): string {
  const auth = String(req.headers.authorization || '');
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : String(req.headers['x-bridge-runtime-token'] || '').trim();
}

export function runtimeAuth(scope: RuntimeScope) {
  return (req: Request, res: Response, next: NextFunction) => {
    const claims = verifyRuntimeToken(bearer(req), scope);
    if (!claims) { res.status(401).json({ error: `Unauthorized ${scope} runtime` }); return; }
    (req as any).runtimeAuth = claims;
    next();
  };
}
export function cleanChildEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const safe: NodeJS.ProcessEnv = {};
  const allow = new Set(['PATH','Path','SystemRoot','WINDIR','COMSPEC','ComSpec','PATHEXT','TEMP','TMP','LANG','LC_ALL','TERM','NO_COLOR','USERPROFILE','LOCALAPPDATA','APPDATA','HOMEDRIVE','HOMEPATH']);
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || SECRET_KEYS.test(key)) continue;
    if (allow.has(key) || key==='CODEX_HOME') safe[key] = value;
  }
  delete safe.BRIDGE_MCP_TOKEN;
  delete safe.BRIDGE_EXECUTOR_TOKEN;
  delete safe.RAILWAY_TOKEN;
  delete safe.GITHUB_TOKEN;
  delete safe.GH_TOKEN;
  return safe;
}

export function runtimeBearer(req: Request): string { return bearer(req); }
export function sweepRevocations(now = Date.now()) {
  for (const [jti, exp] of revoked) if (exp <= now) revoked.delete(jti);
}
