import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { Request, Response } from 'express';
import { requireAuth } from './auth.js';

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;
const DATA_DIR = path.resolve(process.cwd(), 'data', 'attachments');
const ALLOWED_MIME = /^(image\/|video\/|text\/|application\/(pdf|json|zip|msword|vnd\.openxmlformats-officedocument|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet))/i;

export type AttachmentMeta = {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  created_at: string;
};

export function isAllowedAttachment(type: string, size: number) {
  return size > 0 && size <= MAX_ATTACHMENT_BYTES && ALLOWED_MIME.test(type || 'application/octet-stream');
}

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
function cleanName(raw: string) {
  const decoded = (() => { try { return decodeURIComponent(raw); } catch { return raw; } })();
  return decoded.replace(/[\\/:*?"<>|\r\n]/g, '_').trim().slice(0, 180) || 'attachment';
}

function metaPath(id: string) { return path.join(DATA_DIR, `${id}.json`); }
function blobPath(id: string) { return path.join(DATA_DIR, `${id}.bin`); }

export const attachmentRouter = express.Router();

attachmentRouter.post('/', requireAuth, express.raw({ type: 'application/octet-stream', limit: `${MAX_ATTACHMENT_BYTES}b` }), (req: Request, res: Response) => {
  try {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const type = String(req.headers['x-file-type'] || 'application/octet-stream').trim();
    if (!isAllowedAttachment(type, body.length)) {
      res.status(400).json({ ok: false, error: `Unsupported attachment or file exceeds ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.` });
      return;
    }
    ensureDir();
    const id = crypto.randomUUID();
    const name = cleanName(String(req.headers['x-file-name'] || 'attachment'));
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    const meta: AttachmentMeta = {
      id,
      name,
      type,
      size: body.length,
      url: `${proto}://${host}/api/attachments/public/${id}`,
      created_at: new Date().toISOString(),
    };
    fs.writeFileSync(blobPath(id), body);
    fs.writeFileSync(metaPath(id), JSON.stringify(meta, null, 2), 'utf8');
    res.status(201).json({ ok: true, attachment: meta });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

attachmentRouter.get('/public/:id', (req: Request, res: Response) => {
  const id = String(req.params.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) { res.status(404).end(); return; }
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath(id), 'utf8')) as AttachmentMeta;
    res.setHeader('Content-Type', meta.type);
    res.setHeader('Content-Length', String(meta.size));
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(meta.name)}`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    fs.createReadStream(blobPath(id)).pipe(res);
  } catch {
    res.status(404).json({ ok: false, error: 'Attachment not found' });
  }
});
