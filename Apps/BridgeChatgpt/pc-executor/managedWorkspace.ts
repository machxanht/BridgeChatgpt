import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {validateProjectBinding} from '../server/projectBinding.js';
import type {ClaimedTurn} from '../server/chatRuntime.js';
import type {InstalledRunnerConfig} from './runnerEntry.js';

export async function prepareManagedWorkspace(config:InstalledRunnerConfig,configFile:string,turn:ClaimedTurn,signal?:AbortSignal){
  if(!turn.workspace)throw new Error('Server must supply the bound project directory');
  const binding=validateProjectBinding(turn.workspace);
  const cwd=path.resolve('E:/AI/Bridge',binding.local_path);
  const requestFile=path.join(config.controlRoot,'workspace-'+randomUUID()+'.json');
  fs.writeFileSync(requestFile,JSON.stringify({attemptId:turn.attempt_id,workspaceId:turn.workspace_id,projectId:turn.project_id,...binding,cwd}),{flag:'wx'});
  fs.writeFileSync(path.join(config.controlRoot,turn.attempt_id+'.workspace-started.json'),JSON.stringify({requestFile}),{flag:'wx'});
  const shell=path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
  const child=spawn(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(config.releaseRoot,'workspace-owned-launch.ps1'),'-RequestPath',requestFile,'-ConfigPath',configFile],{windowsHide:true,env:Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^PSModulePath$/i.test(key))),stdio:['pipe','pipe','pipe']});
  let output='',diagnostic='';child.stdout.on('data',c=>output=(output+c).slice(-16384));child.stderr.on('data',c=>diagnostic=(diagnostic+c).slice(-16384));child.stdin.on('error',()=>{});
  const stop=()=>child.stdin.end('stop\n');signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
  try{
    const code=await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
    let receipt:any;try{receipt=JSON.parse(output.trim());}catch{throw Object.assign(new Error('Workspace setup cleanup is unproven; runner remains fenced'),{cleanupUnconfirmed:true});}
    if(!receipt.cleanup_confirmed)throw Object.assign(new Error('Workspace setup still owns processes'),{cleanupUnconfirmed:true});
    if(code!==0||!receipt.finished||receipt.exit_code!==0){
      let detail='Workspace setup failed';try{detail=JSON.parse(fs.readFileSync(requestFile+'.result.json','utf8').replace(/^\uFEFF/,'' )).error||detail;}catch{}
      throw new Error(detail);
    }
    if(signal?.aborted)throw new Error('Workspace setup cancelled before model launch');
    const result=JSON.parse(fs.readFileSync(requestFile+'.result.json','utf8').replace(/^\uFEFF/,''));
    if(result.cwd.toLowerCase()!==cwd.toLowerCase())throw new Error('Prepared workspace mismatch');
    return cwd;
  }finally{
    signal?.removeEventListener('abort',stop);
    if(diagnostic)fs.writeFileSync(requestFile+'.stderr.txt',diagnostic);
  }
}
