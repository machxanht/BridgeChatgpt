import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { executeExecutorAction, safeProjectPath } from '../pc-executor/core.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-executor-core-'));
fs.writeFileSync(path.join(root, 'hello.txt'), 'hello bridge', 'utf8');

const read = await executeExecutorAction('fs.read', { path: 'hello.txt' }, {
  projectRoot: root,
  allowWrites: false,
  allowCommands: false,
});
assert.equal((read.data as any).content, 'hello bridge');

assert.throws(() => safeProjectPath(root, '../outside.txt'), /escapes project root/);

await assert.rejects(
  executeExecutorAction('fs.write', { path: 'new.txt', content: 'nope' }, {
    projectRoot: root,
    allowWrites: false,
    allowCommands: false,
  }),
  /File writes are disabled/
);

const write = await executeExecutorAction('fs.write', { path: 'new.txt', content: 'created' }, {
  projectRoot: root,
  allowWrites: true,
  allowCommands: false,
});
assert.equal((write.data as any).created, true);
assert.equal(fs.readFileSync(path.join(root, 'new.txt'), 'utf8'), 'created');

await assert.rejects(
  executeExecutorAction('command.run', { argv: ['sh', '-c', 'echo unsafe'] }, {
    projectRoot: root,
    allowWrites: true,
    allowCommands: true,
  }),
  /not allowlisted/
);

fs.rmSync(root, { recursive: true, force: true });
console.log('executorCore.test.ts passed');
