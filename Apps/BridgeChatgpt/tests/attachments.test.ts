import assert from 'node:assert';
import { isAllowedAttachment, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_MESSAGE } from '../server/attachments.js';

assert.strictEqual(MAX_ATTACHMENTS_PER_MESSAGE, 5);
assert.strictEqual(isAllowedAttachment('image/png', 1024), true);
assert.strictEqual(isAllowedAttachment('video/mp4', 1024 * 1024), true);
assert.strictEqual(isAllowedAttachment('application/pdf', 2048), true);
assert.strictEqual(isAllowedAttachment('text/plain', 20), true);
assert.strictEqual(isAllowedAttachment('application/x-msdownload', 20), false);
assert.strictEqual(isAllowedAttachment('image/jpeg', 0), false);
assert.strictEqual(isAllowedAttachment('video/mp4', MAX_ATTACHMENT_BYTES + 1), false);

console.log('attachments.test.ts: all assertions passed');
