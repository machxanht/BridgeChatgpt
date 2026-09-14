$ErrorActionPreference='Stop'
$env:PSModulePath="$env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules"
Add-Type -Path 'E:\AI\Bridge\runtime\runner-releases\runner-v2-development\WindowsJob.cs'
$password=(Get-Content -LiteralPath 'E:\AI\Bridge\runtime\runner-control\restricted-user.dpapi' -Raw).Trim()|ConvertTo-SecureString
$job=$null
try {
 $job=[Bridge.Native.OwnedJob]::Start('BridgeAgent',$env:COMPUTERNAME,$password,"$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe",'-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "E:\AI\Bridge\runtime\runner-releases\container-probe-v1\ipc-native-child.ps1"','E:\AI\Bridge\runtime\agent-tasks\container-probe-v1')
 if(!$job.Wait(30000)){throw 'IPC owned probe timed out'}
 if($job.ExitCode -ne 0){throw 'IPC owned probe failed'}
} finally {
 if($job){$stopped=$job.StopAndConfirm(10000);$job.Dispose();[ordered]@{cleanup_confirmed=$stopped;identity='BridgeAgent';time=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json|Set-Content 'E:\AI\Bridge\runtime\runner-control\ipc-owned-cleanup.json';if(!$stopped){throw 'IPC cleanup unproven'}}
 Remove-Variable password -ErrorAction SilentlyContinue
}
