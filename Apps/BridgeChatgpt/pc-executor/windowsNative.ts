import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import type {ClaimedTurn} from '../server/chatRuntime.js';
import {cleanChildEnv} from '../server/runtimeAuth.js';
import {buildNativeLaunch, NativeTranscript} from './nativeAdapters.js';
import type {NativeExecution} from './runnerCore.js';

export interface WindowsLaunchPolicy {
  releaseRoot: string;
  controlRoot: string;
  taskRoot: string;
  containerName: string;
  containerSid: string;
  /** Must validate actual OS policy and pinned executable before returning. */
  authorize(turn: ClaimedTurn,signal?:AbortSignal): Promise<{cwd: string; executable: string}>;
  /** Grant only this attempt's output directory before the native child starts. */
  prepareTask(task: string): Promise<void>;
}
function readBounded(file: string, max: number) {
  if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > max) throw new Error('Native output is invalid or too large');
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
}
export async function launchWindowsNative(turn: ClaimedTurn, policy: WindowsLaunchPolicy,signal?:AbortSignal): Promise<NativeExecution> {
  if (process.platform !== 'win32') throw new Error('Windows launcher requires Windows');
  const approved = await policy.authorize(turn,signal);
  if(signal?.aborted)throw new Error('Cancelled before native launch');
  if(policy.containerName!=='BridgeNative.boundary-v1'||policy.containerSid!=='S-1-15-2-2031389295-489431135-2461900177-1913706768-3870177427-4052891927-2660065647')throw new Error('Unrecognized installed Windows confinement policy');
  for (const directory of [policy.releaseRoot, policy.controlRoot, policy.taskRoot, approved.cwd]) {
    if (!path.isAbsolute(directory) || fs.lstatSync(directory).isSymbolicLink()) throw new Error('Native root must be an absolute real directory');
  }
  const task = fs.mkdtempSync(path.join(policy.taskRoot, 'run-'));
  await policy.prepareTask(task);
  const finalFile = path.join(task, 'final.txt');
  const launch = buildNativeLaunch({agentId: turn.agent_id, content: turn.content, cwd: approved.cwd,
    executable: approved.executable, outputFile: finalFile, sessionId: turn.native_session_id});
  if(!/^ATT-[a-f0-9-]{36}$/.test(turn.attempt_id))throw new Error('Invalid native attempt identity');
  const requestFile = path.join(policy.releaseRoot, `${turn.attempt_id}.request.json`);
  // releaseRoot inherits only RX for BridgeAgent: the model cannot substitute
  // an executable/argument between validation and the trusted child reading it.
  const request = {...launch, attemptId: turn.attempt_id, containerName: policy.containerName, stdout: path.join(task,'stdout.ndjson'), stderr: path.join(task,'stderr.txt'),
    result: path.join(task,'result.json'), deadline: turn.deadline_at};
  const fd = fs.openSync(requestFile,'wx');
  try {fs.writeFileSync(fd,JSON.stringify(request));fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
  const shell = path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const child = spawn(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',
    path.join(policy.releaseRoot,'native-owned-launch.ps1'),'-RequestPath',requestFile,
    '-ControlRoot',policy.controlRoot,'-ReleaseRoot',policy.releaseRoot],
    {cwd: policy.controlRoot,env: cleanChildEnv(),windowsHide:true,stdio:['pipe','pipe','pipe']});
  let output='',diagnostic='',cleanup=false;
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',chunk=>{output=(output+chunk).slice(-16384);});
  child.stderr.on('data',chunk=>{diagnostic=(diagnostic+chunk).slice(-16384);});
  child.stdin.on('error',()=>{});
  const ended = new Promise<void>((resolve,reject)=>{
    child.once('error',reject);
    child.once('close',code=>{
      try {
        const envelope=JSON.parse(output.trim());cleanup=envelope.cleanup_confirmed===true;
        if(code!==0 || !cleanup || !envelope.finished || envelope.launcher_exit!==0) throw new Error('Owned native launcher did not finish cleanly');
        resolve();
      } catch {
        if(diagnostic)fs.writeFileSync(path.join(policy.controlRoot,`${turn.attempt_id}.launcher-error.txt`),diagnostic);
        reject(new Error(diagnostic ? 'Owned native launcher failed; inspect protected diagnostics' : 'Native cleanup/completion receipt missing'));
      }
    });
  });
  const result=ended.then(()=>{
    const terminal=JSON.parse(readBounded(request.result,4096));
    if(!/\\BridgeAgent$/i.test(terminal.identity||''))throw new Error('Native process used an unexpected identity');
    if(terminal.container_sid!==policy.containerSid)throw new Error('Native process confinement receipt mismatch');
    const transcript=new NativeTranscript(turn.agent_id,approved.cwd,turn.native_session_id);
    transcript.push(readBounded(request.stdout,8*1024*1024));
    return transcript.finish(terminal.exit_code,launch.outputFile ? readBounded(finalFile,2*1024*1024) : undefined);
  });
  // Prevent a transient rejected completion from becoming unhandled before the
  // coordinator installs its race. The caller still receives the rejection.
  void result.catch(()=>{});
  const watchdog=setTimeout(()=>child.kill(),Math.max(1,Date.parse(turn.deadline_at)-Date.now()+15000));
  void ended.finally(()=>clearTimeout(watchdog)).catch(()=>{});
  return {result,stop:async()=>{
    if(child.exitCode===null && !child.killed)child.stdin.end('stop\n');
    let timer:ReturnType<typeof setTimeout>;
    await Promise.race([ended.catch(()=>{}),new Promise<void>(resolve=>{
      timer=setTimeout(()=>{child.kill();resolve();},15000);
    })]);
    clearTimeout(timer!);
    return cleanup;
  }};
}

/** Reads the protected OS cleanup receipt; never starts or replays a process. */
export function recoverWindowsNative(turn:ClaimedTurn,policy:WindowsLaunchPolicy){
  if(!/^ATT-[a-f0-9-]{36}$/.test(turn.attempt_id))throw new Error('Invalid attempt identity');
  const requestFile=path.join(policy.releaseRoot,`${turn.attempt_id}.request.json`);
  if(fs.existsSync(path.join(policy.controlRoot,turn.attempt_id+'.workspace-started.json'))){
    const setup=JSON.parse(readBounded(path.join(policy.controlRoot,turn.attempt_id+'.workspace-cleanup.json'),4096));
    if(!setup.cleanup_confirmed)throw new Error('Workspace setup cleanup is not proven; keeping the writer fence');
  }
  if(!fs.existsSync(requestFile))return {stopped:true as const,final:null}; // Manifest publication precedes every native spawn.
  const receipt=JSON.parse(readBounded(path.join(policy.controlRoot,`${turn.attempt_id}.cleanup.json`),4096));
  if(receipt.attempt_id!==turn.attempt_id||receipt.cleanup_confirmed!==true)throw new Error('OS cleanup is not proven; keeping the writer fence');
  if(!receipt.finished||receipt.launcher_exit!==0)return {stopped:true as const,final:null};
  const request=JSON.parse(readBounded(requestFile,1024*1024));
  if(request.attemptId!==turn.attempt_id||request.containerName!==policy.containerName)throw new Error('Native recovery manifest mismatch');
  for(const file of [request.stdout,request.result,request.outputFile].filter(Boolean)){
    const relative=path.relative(policy.taskRoot,path.resolve(file));
    if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Native recovery output escaped task root');
  }
  const result=JSON.parse(readBounded(request.result,4096));
  if(result.container_sid!==policy.containerSid||!/\\BridgeAgent$/i.test(result.identity||''))throw new Error('Recovered native confinement receipt mismatch');
  try{
    const transcript=new NativeTranscript(turn.agent_id,request.cwd,turn.native_session_id);
    transcript.push(readBounded(request.stdout,8*1024*1024));
    return {stopped:true as const,final:transcript.finish(result.exit_code,request.outputFile?readBounded(request.outputFile,2*1024*1024):undefined)};
  }catch{return {stopped:true as const,final:null};}
}
