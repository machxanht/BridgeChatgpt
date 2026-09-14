trap { [IO.File]::WriteAllText('E:\AI\Bridge\runtime\agent-tasks\native-auth\helper-error.txt',$_.Exception.Message); break }
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'native-environment.ps1')
Add-Type -Path (Join-Path $PSScriptRoot 'WindowsAppContainer.cs')
Add-Type -Path (Join-Path $PSScriptRoot 'NativeAuthConsole.cs')
$root='E:\AI\Bridge\runtime\agent-tasks\native-auth'
$env:HTTP_PROXY='http://127.0.0.1:43892';$env:HTTPS_PROXY=$env:HTTP_PROXY;$env:http_proxy=$env:HTTP_PROXY;$env:https_proxy=$env:HTTP_PROXY;$env:NO_PROXY='';$env:no_proxy=''
$child=$null;$console=$null;$sent=$false
try {
 $console=[Bridge.Native.AuthConsole]::new((Join-Path $root 'stderr.txt'))
 $child=[Bridge.Native.ContainerProcess]::StartAuthConsole('BridgeNative.boundary-v1','E:\AI\Bridge\runtime\runner-releases\agy-1.1.27\agy.exe',@('--sandbox','--model','gemini-3.8-flash-high','--print','Reply with exactly BRIDGE_AUTH_OK. Do not use tools or modify files.','--output-format','json'),$root,(Join-Path $root 'stdout.txt'),(Join-Path $root 'stderr.txt'),$console.Handle)
 $until=[DateTime]::UtcNow.AddMinutes(10)
 while(!$child.Wait(100) -and [DateTime]::UtcNow -lt $until){
  if(!$sent -and (Test-Path -LiteralPath (Join-Path $root 'code.txt'))){
   $code=[IO.File]::ReadAllText((Join-Path $root 'code.txt')).Trim()
   if($code){$console.SendLine($code);$sent=$true;Remove-Variable code;Remove-Item -LiteralPath (Join-Path $root 'code.txt');[ordered]@{channel='ConPTY';time=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json|Set-Content (Join-Path $root 'input-delivered.json')}
  }
 }
 if(!$child.Wait(0)){throw 'Native authentication timeout'}
 [ordered]@{exit_code=$child.ExitCode;completed=$true;input_delivered=$sent}|ConvertTo-Json|Set-Content (Join-Path $root 'result.json')
} catch {[ordered]@{completed=$false;input_delivered=$sent;error=$_.Exception.Message}|ConvertTo-Json|Set-Content (Join-Path $root 'result.json')}finally{if($child){$child.Dispose()};if($console){$console.Dispose()}}
