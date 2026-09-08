import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
if(process.platform!=='win32'){
  console.log('nativeWindowsIO.test.mjs: Windows-only native IO test skipped on this platform');
}else{
  fs.mkdirSync('runtime',{recursive:true});
  const folder=fs.mkdtempSync(path.resolve('runtime/completion-validation-windows-io-'));
  const fixture=path.join(folder,'echo.ps1');
  fs.writeFileSync(fixture,'param([string]$First,[string]$Second)\n[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)\n[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)\n[ordered]@{first=$First;second=$Second;stdin=[Console]::In.ReadToEnd()}|ConvertTo-Json -Compress\n');
  const first='space "quoted" trailing\\',second='$(Write-Output SHOULD_NOT_RUN) & | ; Xin chào';
  const input='Tiếng Việt\nnot a shell command $(echo no)';
  const shell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
  const request={executable:shell,args:['-NoProfile','-NonInteractive','-File',fixture,first,second],
    cwd:folder,stdin:input,stdout:path.join(folder,'stdout.json'),stderr:path.join(folder,'stderr.txt'),result:path.join(folder,'result.json')};
  const requestFile=path.join(folder,'request.json');
  fs.writeFileSync(requestFile,JSON.stringify(request)); // UTF-8 without BOM, as the Node coordinator writes it.
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^PSModulePath$/i.test(key)));
  execFileSync(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',
    path.resolve('Apps/BridgeChatgpt/pc-executor/native-child.ps1'),'-RequestPath',requestFile],{env,timeout:30000,windowsHide:true});
  const observed=JSON.parse(fs.readFileSync(request.stdout,'utf8').replace(/^\uFEFF/,''));
  assert.equal(observed.first,first);assert.equal(observed.second,second);assert.equal(observed.stdin,input);
  assert.equal(JSON.parse(fs.readFileSync(request.result,'utf8').replace(/^\uFEFF/,'')).exit_code,0);
  console.log('nativeWindowsIO.test.mjs: real Windows argv quoting and UTF-8 stdin/stdout PASS');
}
