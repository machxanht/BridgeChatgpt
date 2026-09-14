. 'E:\AI\Bridge\runtime\runner-releases\runner-v2-development\native-environment.ps1'
$ErrorActionPreference='Stop'
Add-Type -Path 'E:\AI\Bridge\runtime\runner-releases\container-probe-v1\WindowsAppContainer.cs'
$root='E:\AI\Bridge\runtime\agent-tasks\container-probe-v1'
$env:PSModulePath="$env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules"
$p=[Bridge.Native.ContainerProcess]::Start('BridgeNative.boundary-v1',"$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe",@('-NoProfile','-NonInteractive','-File','E:\AI\Bridge\runtime\runner-releases\container-probe-v1\ipc-probe.ps1'),$root,(Join-Path $root 'stdin.txt'),(Join-Path $root 'ipc-stdout.txt'),(Join-Path $root 'ipc-stderr.txt'))
try{if(!$p.Wait(20000)){throw 'IPC probe timed out'};if($p.ExitCode -ne 0){throw 'IPC probe failed'}}finally{$p.Dispose()}
