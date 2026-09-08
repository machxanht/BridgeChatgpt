trap { [IO.File]::WriteAllText('E:\AI\Bridge\runtime\agent-tasks\native-auth\helper-error.txt',$_.Exception.Message); break }
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'native-environment.ps1')
Add-Type -Path (Join-Path $PSScriptRoot 'WindowsAppContainer.cs')
$root='E:\AI\Bridge\runtime\agent-tasks\native-auth'
$env:HTTP_PROXY='http://127.0.0.1:43892';$env:HTTPS_PROXY=$env:HTTP_PROXY;$env:http_proxy=$env:HTTP_PROXY;$env:https_proxy=$env:HTTP_PROXY;$env:NO_PROXY='';$env:no_proxy=''
$name='LOCAL\BridgeNativeAuth-'+[Guid]::NewGuid().ToString('N')
$security=[IO.Pipes.PipeSecurity]::new()
$security.AddAccessRule([IO.Pipes.PipeAccessRule]::new([Security.Principal.WindowsIdentity]::GetCurrent().User,[IO.Pipes.PipeAccessRights]::FullControl,[Security.AccessControl.AccessControlType]::Allow))
$security.AddAccessRule([IO.Pipes.PipeAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-15-2-2031389295-489431135-2461900177-1913706768-3870177427-4052891927-2660065647'),[IO.Pipes.PipeAccessRights]::Read,[Security.AccessControl.AccessControlType]::Allow))
$pipe=[IO.Pipes.NamedPipeServerStream]::new($name,[IO.Pipes.PipeDirection]::Out,1,[IO.Pipes.PipeTransmissionMode]::Byte,[IO.Pipes.PipeOptions]::Asynchronous,4096,4096,$security)
$pending=$pipe.BeginWaitForConnection($null,$null)
$child=$null;$writer=$null
try {
 $child=[Bridge.Native.ContainerProcess]::Start('BridgeNative.boundary-v1','E:\AI\Bridge\runtime\runner-releases\agy-1.1.27\agy.exe',@('--sandbox','--model','gemini-3.8-flash-high','--print','Reply with exactly BRIDGE_AUTH_OK. Do not use tools or modify files.','--output-format','json'),$root,('\\.\pipe\'+$name),(Join-Path $root 'stdout.txt'),(Join-Path $root 'stderr.txt'))
 $pipe.EndWaitForConnection($pending)
 $writer=[IO.StreamWriter]::new($pipe,[Text.UTF8Encoding]::new($false));$writer.AutoFlush=$true
 $until=[DateTime]::UtcNow.AddMinutes(10);$sent=$false
 while(!$child.Wait(200) -and [DateTime]::UtcNow -lt $until){
  if(!$sent -and (Test-Path -LiteralPath (Join-Path $root 'code.txt'))){$code=[IO.File]::ReadAllText((Join-Path $root 'code.txt')).Trim();if($code){$writer.WriteLine($code);$sent=$true;Remove-Variable code}}
 }
 if(!$child.Wait(0)){throw 'Native authentication timeout'}
 [ordered]@{exit_code=$child.ExitCode;completed=$true}|ConvertTo-Json|Set-Content (Join-Path $root 'result.json')
} catch {[ordered]@{completed=$false;error=$_.Exception.Message}|ConvertTo-Json|Set-Content (Join-Path $root 'result.json')}finally{if($writer){$writer.Dispose()}else{$pipe.Dispose()};if($child){$child.Dispose()}}
