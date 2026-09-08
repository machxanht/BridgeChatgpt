import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {runNativeService} from './runnerService.js';
import {getAgentRoute,type BridgeAgentId} from '../server/agentRegistry.js';

const exec=promisify(execFile);
export interface InstalledRunnerConfig {
  version:1;origin:string;subject:string;sourceSha:string;
  releaseRoot:string;controlRoot:string;taskRoot:string;
  workspace:{workspaceId:string;projectId:string;cwd:string};
  executables:Record<'agy'|'codex',{path:string;sha256:string}>;
  files:Record<string,string>;
  qualificationFile:string;
}
const packageName='BridgeNative.boundary-v1';
const packageSid='S-1-15-2-2031389295-489431135-2461900177-1913706768-3870177427-4052891927-2660065647';
const shell=path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
const environment=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^PSModulePath$/i.test(key)));
const digest=(file:string)=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function real(file:string){
  if(!path.isAbsolute(file)||fs.lstatSync(file).isSymbolicLink()||path.resolve(fs.realpathSync.native(file)).toLowerCase()!==path.resolve(file).toLowerCase())throw new Error('Installed path is not a canonical absolute path');
  return file;
}
export function loadInstalledConfig(file:string):InstalledRunnerConfig {
  real(file);if(fs.statSync(file).size>1024*1024)throw new Error('Runner config exceeds limit');
  const config=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')) as InstalledRunnerConfig;
  if(config.version!==1||!/^\w[\w.-]{2,119}$/.test(config.subject)||! /^[a-f0-9]{40}$/.test(config.sourceSha))throw new Error('Invalid installed runner identity');
  const origin=new URL(config.origin);if(origin.protocol!=='https:'||origin.origin!==config.origin||origin.username||origin.password)throw new Error('Exact HTTPS origin required');
  for(const folder of [config.releaseRoot,config.controlRoot,config.taskRoot,config.workspace.cwd])real(folder);
  if(path.dirname(file).toLowerCase()!==config.controlRoot.toLowerCase())throw new Error('Config must be inside protected control root');
  for(const executable of Object.values(config.executables))if(!/^[a-f0-9]{64}$/i.test(executable.sha256)||digest(real(executable.path))!==executable.sha256.toLowerCase())throw new Error('Native executable changed');
  for(const required of ['native-owned-launch.ps1','native-child.ps1','native-environment.ps1','WindowsJob.cs','WindowsAppContainer.cs','runner-access.ps1','WindowsNetworkPolicyIpc.cs'])if(!config.files[required])throw new Error('Incomplete installed release manifest');
  for(const [name,hash] of Object.entries(config.files)){
    if(name!==path.basename(name)||! /^[a-f0-9]{64}$/.test(hash)||digest(real(path.join(config.releaseRoot,name)))!==hash)throw new Error('Installed release integrity failure');
  }
  return config;
}
export async function startInstalledRunner(configFile:string,signal:AbortSignal){
  if(process.platform!=='win32')throw new Error('Installed runner requires Windows');
  const config=loadInstalledConfig(configFile);
  const access=async(mode:string,task?:string)=>{
    const result=await exec(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(config.releaseRoot,'runner-access.ps1'),'-ConfigPath',configFile,'-Mode',mode,...(task?['-Task',task]:[])],{env:environment,windowsHide:true,timeout:30000,maxBuffer:16384});
    return result.stdout.trim();
  };
  await access('Verify');
  const qualification=JSON.parse(fs.readFileSync(real(config.qualificationFile),'utf8').replace(/^\uFEFF/,''));
  const agents:BridgeAgentId[]=qualification.filter((row:any)=>row.native?.exit_code===0&&row.final?.answer&&row.final?.sessionId&&JSON.parse(row.launcher||'{}').cleanup_confirmed===true).map((row:any)=>{
    const route=getAgentRoute(row.agentId);if(route.transport!=='cli'||route.native_model!==row.final.model)throw new Error('Native qualification model mismatch');return route.id;
  });
  if(!agents.length)throw new Error('No successful native qualification receipts');
  await runNativeService({origin:config.origin,subject:config.subject,sourceSha:config.sourceSha,
    providerHosts:['chatgpt.com','auth.openai.com','api.openai.com','oauth2.googleapis.com','accounts.google.com','www.googleapis.com','cloudcode-pa.googleapis.com','daily-cloudcode-pa.googleapis.com','daily-cloudcode-pa.sandbox.googleapis.com','lh3.googleusercontent.com','antigravity.google','antigravity-unleash.goog'],
    controllerCredential:()=>access('Credential'),readyAgents:async()=>agents,
    policy:{releaseRoot:config.releaseRoot,controlRoot:config.controlRoot,taskRoot:config.taskRoot,containerName:packageName,containerSid:packageSid,
      prepareTask:task=>access('PrepareTask',task).then(()=>{}),
      authorize:async turn=>{
        if(turn.workspace_id!==config.workspace.workspaceId||turn.project_id!==config.workspace.projectId)throw new Error('Workspace is not provisioned on this runner');
        const route=getAgentRoute(turn.agent_id);if(route.transport!=='cli'||turn.native_model!==route.native_model)throw new Error('Claimed model mismatch');
        const executable=config.executables[route.runner as 'agy'|'codex'];
        if(digest(real(executable.path))!==executable.sha256.toLowerCase())throw new Error('Native executable integrity failure');
        await access('Verify');return {cwd:real(config.workspace.cwd),executable:executable.path};
      }},
    report:status=>fs.writeFileSync(path.join(config.controlRoot,'runner-status.json'),JSON.stringify({...status,time:new Date().toISOString(),sourceSha:config.sourceSha}))},signal);
}
if(process.argv[1]&&/runner-entry\.mjs$/i.test(process.argv[1])){
  const configFile=process.argv[2];if(!configFile)throw new Error('Protected config path required');
  const controller=new AbortController();process.once('SIGINT',()=>controller.abort());process.once('SIGTERM',()=>controller.abort());
  startInstalledRunner(configFile,controller.signal).catch(error=>{console.error(error instanceof Error?error.message:'Runner startup failed');process.exitCode=1;});
}
