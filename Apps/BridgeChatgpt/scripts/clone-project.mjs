import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
}

function fail(message) {
  console.error(`[Bridge Project Bootstrap] ${message}`);
  process.exit(1);
}

function normalizeAppsTarget(raw) {
  const value = String(raw || '').trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  if (!value || value === 'Apps' || !value.startsWith('Apps/')) fail(`Target must be Apps/<ProjectName>: ${value || '(empty)'}`);
  const segments = value.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) fail(`Unsafe target path: ${value}`);
  return value;
}

function copyMissingTree(sourceDir, targetDir, copied = []) {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      copyMissingTree(source, target, copied);
      continue;
    }
    if (!entry.isFile() || fs.existsSync(target)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
    copied.push(path.relative(targetDir, target).replace(/\\/g, '/'));
  }
  return copied;
}

const repositoryUrl = arg('repo');
const branch = arg('branch') || 'main';
const targetRelative = normalizeAppsTarget(arg('target'));
if (!repositoryUrl) fail('--repo is required');

let parsed;
try { parsed = new URL(repositoryUrl); } catch { fail('--repo must be an absolute URL'); }
if (!['https:', 'http:'].includes(parsed.protocol)) fail('--repo must use http or https');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const bridgeRoot = path.resolve(scriptDir, '../../..');
const target = path.resolve(bridgeRoot, targetRelative);
const appsRoot = path.resolve(bridgeRoot, 'Apps');
if (target === appsRoot || !target.startsWith(appsRoot + path.sep)) fail(`Target escapes Apps/: ${targetRelative}`);
if (fs.existsSync(target)) fail(`Target already exists: ${targetRelative}`);

console.log(`[Bridge Project Bootstrap] Cloning ${repositoryUrl}#${branch} -> ${targetRelative}`);
const clone = spawnSync('git', ['clone', '--branch', branch, '--single-branch', repositoryUrl, targetRelative], {
  cwd: bridgeRoot,
  shell: false,
  windowsHide: true,
  stdio: 'inherit',
});
if (clone.error) fail(clone.error.message);
if (clone.status !== 0) fail(`git clone failed with exit code ${clone.status}`);

const template = path.join(bridgeRoot, 'Apps', '_TEMPLATE');
if (!fs.existsSync(template) || !fs.statSync(template).isDirectory()) fail('Apps/_TEMPLATE is missing');

const copied = copyMissingTree(template, target);
console.log(`[Bridge Project Bootstrap] Seeded ${copied.length} missing handoff file(s).`);
for (const file of copied) console.log(`[Bridge Project Bootstrap] + ${file}`);
console.log('[Bridge Project Bootstrap] Existing project files were not overwritten. No commit or push was performed.');
