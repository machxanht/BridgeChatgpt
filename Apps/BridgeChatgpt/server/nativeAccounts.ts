import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type NativeAccountProvider = 'openai' | 'google' | 'anthropic';
export type NativeAccountStatus = 'unverified' | 'active' | 'disabled';
export interface NativeAccount {
  account_id: string;
  provider: NativeAccountProvider;
  label: string;
  profile_label: string;
  status: NativeAccountStatus;
  last_authenticated_at: string | null;
  created_at: string;
  updated_at: string;
}
interface Store { version: 1; accounts: NativeAccount[] }
const idPattern = /^acct-[a-f0-9-]{36}$/;
const filePath = () => path.resolve(process.cwd(), process.env.BRIDGE_NATIVE_ACCOUNTS_PATH || 'data/native-accounts.json');
const read = (): Store => {
  const file = filePath(); if (!fs.existsSync(file)) return { version: 1, accounts: [] };
  try { const value = JSON.parse(fs.readFileSync(file, 'utf8')) as Store; return value?.version === 1 && Array.isArray(value.accounts) ? value : { version: 1, accounts: [] }; } catch { return { version: 1, accounts: [] }; }
};
const write = (store: Store) => { const file = filePath(); fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.${Date.now()}.tmp`; fs.writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, 'utf8'); fs.renameSync(tmp, file); };
let tail: Promise<void> = Promise.resolve();
async function locked<T>(fn: () => T | Promise<T>): Promise<T> { let release!: () => void; const prev = tail; tail = new Promise(resolve => { release = resolve; }); await prev; try { return await fn(); } finally { release(); } }
const clean = (value: unknown, fallback: string) => String(value || fallback).trim().slice(0, 120) || fallback;
function validateProvider(value: unknown): NativeAccountProvider { if (value === 'openai' || value === 'google' || value === 'anthropic') return value; throw new Error('provider must be openai, google, or anthropic'); }
export async function listNativeAccounts() { return locked(() => read().accounts.map(account => ({ ...account, credential_storage: 'local-cli-profile' as const, credentials_in_bridge: false }))); }
export async function registerNativeAccount(input: { provider: unknown; label?: unknown; profile_label?: unknown; status?: unknown }) {
  return locked(() => { const store = read(); const provider = validateProvider(input.provider); const now = new Date().toISOString(); const account: NativeAccount = { account_id: `acct-${randomUUID()}`, provider, label: clean(input.label, `${provider} account`), profile_label: clean(input.profile_label, 'default'), status: input.status === 'active' ? 'active' : 'unverified', last_authenticated_at: input.status === 'active' ? now : null, created_at: now, updated_at: now }; store.accounts.push(account); write(store); return account; });
}
export async function updateNativeAccount(accountId: string, input: { label?: unknown; profile_label?: unknown; status?: unknown }) {
  return locked(() => { if (!idPattern.test(accountId)) throw Object.assign(new Error('Invalid account id'), { statusCode: 400 }); const store = read(); const account = store.accounts.find(item => item.account_id === accountId); if (!account) throw Object.assign(new Error('Account not found'), { statusCode: 404 }); if (input.label !== undefined) account.label = clean(input.label, account.label); if (input.profile_label !== undefined) account.profile_label = clean(input.profile_label, account.profile_label); if (input.status !== undefined) { if (!['unverified', 'active', 'disabled'].includes(String(input.status))) throw new Error('Invalid account status'); account.status = String(input.status) as NativeAccountStatus; account.last_authenticated_at = account.status === 'active' ? new Date().toISOString() : account.last_authenticated_at; } account.updated_at = new Date().toISOString(); write(store); return account; });
}
export async function removeNativeAccount(accountId: string) { return locked(() => { const store = read(); const before = store.accounts.length; store.accounts = store.accounts.filter(item => item.account_id !== accountId); if (before === store.accounts.length) throw Object.assign(new Error('Account not found'), { statusCode: 404 }); write(store); return { account_id: accountId, removed: true }; }); }
