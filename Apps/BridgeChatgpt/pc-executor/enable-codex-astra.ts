/** One-time upgrade of the installed default workspace; no model calls or elevation. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {loadInstalledConfig} from './runnerEntry.js';

const exec=promisify(execFile);
const shell=path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^PSModulePath$/i.test(key)));
const configFile='E:\\AI\\Bridge\\runtime\\runner-control\\runner-config.json';
const config=loadInstalledConfig(configFile);
assert(fs.readFileSync(path.join(config.releaseRoot,'runner-entry.mjs'),'utf8').includes('--skip-git-repo-check'),'Install the corrected runner before advertising Codex/Astra');
assert.equal(config.workspace.cwd,'E:\\AI\\Bridge\\Apps\\BridgeChatgpt');
const read=(file:string)=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const ps=(args:string[])=>exec(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass',...args],{env,windowsHide:true,timeout:45000,maxBuffer:32768});
const status=read(path.join(config.controlRoot,'runner-status.json'));
assert.equal(status.state,'waiting','Do not stop a working runner');
assert(Date.now()-Date.parse(status.time)<30000,'Runner status must be fresh');
assert(!read(path.join(config.controlRoot,'runner-journal.json')).turn,'An owned turn must finish first');
const original=fs.readFileSync(configFile);
const stamp=randomUUID();
fs.writeFileSync(path.join(config.controlRoot,`codex-enable-${stamp}.config-before.json`),original,{flag:'wx'});
let configChanged=false;
await ps(['-Command',"Stop-ScheduledTask -TaskName 'Bridge Native Runner v2'"]);
try {
  // Do not run parallel native writers or replace a live proxy.
  await ps(['-Command',"Start-Sleep -Seconds 2; if(Get-NetTCPConnection -LocalPort 43892,43893 -State Listen -ErrorAction SilentlyContinue){throw 'Runner has not stopped; no native probe started'}"]);
  const probe=async(executable:string,args:string[])=>{
    const task=fs.mkdtempSync(path.join(config.taskRoot,'run-'));
    await ps(['-File',path.join(config.releaseRoot,'runner-access.ps1'),'-ConfigPath',configFile,'-Mode','PrepareTask','-Task',task]);
    const attemptId='ATT-'+randomUUID();
    const request={attemptId,executable,args,cwd:config.workspace.cwd,stdin:'',containerName:'BridgeNative.boundary-v1',stdout:path.join(task,'stdout.txt'),stderr:path.join(task,'stderr.txt'),result:path.join(task,'result.json'),deadline:new Date(Date.now()+30000).toISOString()};
    const requestFile=path.join(config.releaseRoot,attemptId+'.request.json');
    fs.writeFileSync(requestFile,JSON.stringify(request),{flag:'wx'});
    const child=spawn(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(config.releaseRoot,'native-owned-launch.ps1'),'-RequestPath',requestFile,'-ControlRoot',config.controlRoot,'-ReleaseRoot',config.releaseRoot],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='',error='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>error+=c);
    const exit=await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
    assert.equal(exit,0,error.slice(-1000));
    const cleanup=JSON.parse(output.trim());assert(cleanup.finished&&cleanup.cleanup_confirmed&&cleanup.launcher_exit===0,'Offline job cleanup failed');
    const native=read(request.result);assert.equal(native.container_sid,'S-1-15-2-2031389295-489431135-2461900177-1913706768-3870177427-4052891927-2660065647');assert(/\\BridgeAgent$/i.test(native.identity));
    return {attemptId,native,stdout:fs.readFileSync(request.stdout,'utf8').replace(/^\uFEFF/,''),stderr:fs.readFileSync(request.stderr,'utf8'),cleanup};
  };
  const cmd=path.join(process.env.SystemRoot||'C:\\Windows','System32/cmd.exe');
  const sandbox=['-c','windows.sandbox="unelevated"','-c','windows.sandbox_private_desktop=false','sandbox','-P',':workspace','-C',config.workspace.cwd,cmd,'/d','/c'];
  // Initialize this exact workspace's native capability without contacting a provider.
  const initialized=await probe(config.executables.codex.path,[...sandbox,'echo BRIDGE_SANDBOX_INIT']);
  assert.equal(initialized.native.exit_code,0,initialized.stderr.slice(-1500));
  const metadata=await probe(path.join(process.env.SystemRoot||'C:\\Windows','System32/findstr.exe'),['^','C:\\Users\\BridgeAgent\\.codex\\cap_sid']);
  assert.equal(metadata.native.exit_code,0,'Cannot read native capability metadata');
  const caps=JSON.parse(metadata.stdout);
  const key=config.workspace.cwd.replaceAll('\\','/').toLowerCase();
  // Codex uses a random synthetic SID, not an AppContainer capability SID.
  // Its cwd root is indexed in workspace_by_cwd (additional roots use writable_root_by_path).
  const capability=caps.workspace_by_cwd?.[key];
  assert(typeof capability==='string'&&/^S-1-5-21-\d+-\d+-\d+-\d+$/.test(capability)&&!capability.startsWith('S-1-5-21-2299166317-3866393011-3260234217-'),'No synthetic capability for the exact installed workspace');
  await ps(['-File',path.join(import.meta.dirname,'provision-codex-workspace.ps1'),'-Workspace',config.workspace.cwd,'-CapabilitySid',capability,'-Backup',path.join(config.controlRoot,`codex-enable-${stamp}.acl-before.txt`)]);
  const filename='.bridge-codex-check-'+stamp+'.txt';
  const proof=await probe(config.executables.codex.path,[...sandbox,`echo BRIDGE_CODEX_IO_OK>${filename} && type ${filename}`]);
  assert.equal(proof.native.exit_code,0,proof.stderr.slice(-1500));
  assert.equal(fs.readFileSync(path.join(config.workspace.cwd,filename),'utf8').trim(),'BRIDGE_CODEX_IO_OK');
  fs.unlinkSync(path.join(config.workspace.cwd,filename));
  const rows=read(config.qualificationFile).filter((r:any)=>!['codex','astra'].includes(r.agentId));
  for(const [agentId,model] of [['codex','gpt-5.6-sol'],['astra','gpt-6-astra']]){
    const previous=read(path.join(config.controlRoot,agentId+'-tools-probe-report.json'));
    assert.equal(previous.native.exit_code,0);assert.equal(previous.final.model,model);assert(previous.final.sessionId&&previous.final.answer);assert(JSON.parse(previous.launcher).cleanup_confirmed);
    rows.push({...previous,agentId});
  }
  const qualificationFile=path.join(config.controlRoot,`native-five-models-${stamp}.json`);
  fs.writeFileSync(qualificationFile,JSON.stringify(rows,null,2),{flag:'wx'});
  fs.writeFileSync(path.join(config.controlRoot,'codex-workspace-proof.json'),JSON.stringify({time:new Date().toISOString(),workspace:config.workspace,capability,initialized,proof,modelCalls:0},null,2));
  fs.writeFileSync(configFile,JSON.stringify({...config,qualificationFile},null,2));configChanged=true;
  console.log('Offline workspace read/write and cleanup passed; enabling existing Codex/Astra qualification receipts. Live service E2E is still required.');
}catch(error){
  if(configChanged)fs.writeFileSync(configFile,original);
  throw error;
}finally{
  await ps(['-Command',"Start-ScheduledTask -TaskName 'Bridge Native Runner v2'"]);
}
