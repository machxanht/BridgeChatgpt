import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { NativeFinal } from './nativeAdapters.js';

export interface ResultReceipt { version: 1; attemptId: string; turnId: string; conversationId: string; final: NativeFinal; hash: string; createdAt: string }
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
/** Must live inside the coordinator-only ACL root, never the model's task cwd. */
export class ResultOutbox {
  constructor(private root: string) {
    if (!path.isAbsolute(root)) throw new Error('Outbox root must be absolute');
    fs.mkdirSync(root, { recursive: true });
    if (fs.lstatSync(root).isSymbolicLink()) throw new Error('Outbox root must not be a link');
  }
  private location(attemptId: string) {
    if (!/^ATT-[a-f0-9-]{36}$/.test(attemptId)) throw new Error('Invalid outbox attempt identity');
    return path.join(this.root, `${attemptId}.json`);
  }
  store(input: Omit<ResultReceipt, 'version' | 'hash' | 'createdAt'>): ResultReceipt {
    const file = this.location(input.attemptId);
    if (!input.final.answer.trim()) throw new Error('Cannot persist an empty final');
    const record: ResultReceipt = { ...input, version: 1, hash: digest(input.final.answer), createdAt: new Date().toISOString() };
    if (fs.existsSync(file)) {
      const current = this.read(input.attemptId);
      if (current.hash !== record.hash || current.turnId !== record.turnId || current.conversationId !== record.conversationId || current.final.sessionId !== record.final.sessionId || current.final.model !== record.final.model) throw new Error('Outbox final conflict');
      return current;
    }
    const tmp = `${file}.${randomUUID()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(record), { flag: 'wx' });
    const fd = fs.openSync(tmp, 'r+'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    // Publish without overwriting an existing final if another coordinator raced.
    try { fs.linkSync(tmp, file); } finally { fs.unlinkSync(tmp); }
    return record;
  }
  read(attemptId: string): ResultReceipt {
    const file = this.location(attemptId);
    if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 3 * 1024 * 1024) throw new Error('Invalid outbox file');
    const record = JSON.parse(fs.readFileSync(file, 'utf8')) as ResultReceipt;
    if (record.version !== 1 || record.attemptId !== attemptId || typeof record.final?.answer !== 'string' || digest(record.final.answer) !== record.hash) throw new Error('Outbox integrity failure');
    return record;
  }
  pending(): ResultReceipt[] {
    return fs.readdirSync(this.root).filter(name => /^ATT-[a-f0-9-]{36}\.json$/.test(name)).map(name => this.read(name.slice(0, -5))).filter(record => {
      const ack = `${this.location(record.attemptId)}.ack`;
      return !fs.existsSync(ack) || fs.statSync(ack).size !== 64 || fs.readFileSync(ack, 'utf8') !== record.hash;
    });
  }
  acknowledge(attemptId: string, serverHash: string) {
    if (this.read(attemptId).hash !== serverHash) throw new Error('Completion acknowledgement hash mismatch');
    const ack = `${this.location(attemptId)}.ack`;
    const tmp = `${ack}.${randomUUID()}.tmp`;
    const fd = fs.openSync(tmp, 'wx'); try { fs.writeFileSync(fd, serverHash); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, ack);
  }
}
