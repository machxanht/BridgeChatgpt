import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

// Never run DB-writing regression suites against an operator's data directory.
const root = process.cwd();
fs.mkdirSync(path.join(root, 'runtime'), { recursive: true });
const target = fs.mkdtempSync(path.join(root, 'runtime/completion-validation-suite-'));
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
for (const file of new Set(files)) {
  if (/^(runtime|data|artifacts|node_modules|dist)\//.test(file)) continue;
  if (!fs.statSync(path.join(root, file)).isFile()) continue;
  const dest = path.join(target, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(root, file), dest);
}
fs.mkdirSync(path.join(target, 'tests'), { recursive: true });
fs.mkdirSync(path.join(target, 'runtime/temp'), { recursive: true });
execFileSync('git', ['init', '--quiet'], { cwd: target });
const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
const env = { ...process.env, TEMP: path.join(target, 'runtime/temp'), TMP: path.join(target, 'runtime/temp'), GITHUB_COMMAND_BUS_ENABLED: 'false', GEMINI_WORKER_ENABLED: 'false' };
for (const name of Object.keys(env)) if (/^(BRIDGE_|RAILWAY_|GH_|GITHUB_TOKEN|OPENAI_API_KEY|GEMINI_API_KEY)/.test(name)) delete env[name];
let failed = 0;
for (const step of pkg.scripts.test.split(' && ')) {
  const [command, ...args] = step.split(' ');
  if (command !== 'node') throw new Error(`Unsupported validation command: ${command}`);
  const result = spawnSync(process.execPath, args, { cwd: target, env, encoding: 'utf8', timeout: 120000, windowsHide: true });
  fs.appendFileSync(path.join(target, 'validation.log'), `\n${step}\n${result.stdout || ''}${result.stderr || ''}`);
  console.log(`${result.status === 0 ? 'PASS' : 'FAIL'} ${args.at(-1)}`);
  if (result.status !== 0) { failed++; console.log(((result.stdout || '') + (result.stderr || '')).split('\n').slice(-22).join('\n')); }
}
console.log(`Evidence: ${target}; failed suites: ${failed}`);
process.exitCode = failed ? 1 : 0;
