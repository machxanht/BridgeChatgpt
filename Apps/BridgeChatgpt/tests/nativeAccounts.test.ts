import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { listNativeAccounts, registerNativeAccount, updateNativeAccount, removeNativeAccount } from '../server/nativeAccounts.js';

const file = path.join(process.cwd(), 'runtime', `native-accounts-test-${process.pid}.json`);
process.env.BRIDGE_NATIVE_ACCOUNTS_PATH = file;
try {
  const created = await registerNativeAccount({ provider: 'google', label: 'Work Google', profile_label: 'BridgeAgent' });
  assert.equal(created.status, 'unverified');
  assert.equal((await listNativeAccounts())[0].credentials_in_bridge, false);
  const active = await updateNativeAccount(created.account_id, { status: 'active' });
  assert.equal(active.status, 'active');
  await removeNativeAccount(created.account_id);
  assert.equal((await listNativeAccounts()).length, 0);
  console.log('Native account metadata lifecycle PASS; no credentials or provider requests used');
} finally { if (fs.existsSync(file)) fs.unlinkSync(file); }
