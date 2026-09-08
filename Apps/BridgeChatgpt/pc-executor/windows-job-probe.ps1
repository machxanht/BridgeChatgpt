param([string]$Root='E:\AI\Bridge')
$ErrorActionPreference='Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'WindowsJob.cs')
$probeRoot=Join-Path $Root ('runtime\agent-tasks\job-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $probeRoot | Out-Null
$script=Join-Path $probeRoot 'fixture.ps1'
$fixture=@'
$child=Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList @('-NoProfile','-NonInteractive','-Command','Start-Sleep -Seconds 120') -WindowStyle Hidden -PassThru
[ordered]@{identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name;child_pid=$child.Id;parent_pid=$PID}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'started.json')
Start-Sleep -Seconds 120
'@
Set-Content -LiteralPath $script -Value $fixture -Encoding UTF8
$secret=(Get-Content -LiteralPath (Join-Path $Root 'runtime\runner-control\restricted-user.dpapi') -Raw).Trim() | ConvertTo-SecureString
$owned=$null
try {
  $owned=[Bridge.Native.OwnedJob]::Start('BridgeAgent',$env:COMPUTERNAME,$secret,"$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe","-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$script`"",$probeRoot)
  $deadline=(Get-Date).AddSeconds(15)
  while(!(Test-Path -LiteralPath (Join-Path $probeRoot 'started.json')) -and (Get-Date)-lt $deadline){Start-Sleep -Milliseconds 100}
  $started=Get-Content -LiteralPath (Join-Path $probeRoot 'started.json') -Raw | ConvertFrom-Json
  $before=$owned.ActiveProcesses
  $clean=$owned.StopAndConfirm(10000)
  $result=[ordered]@{identity=$started.identity;process_id=$owned.ProcessId;child_pid=$started.child_pid;active_before=$before;active_after=$owned.ActiveProcesses;cleanup_confirmed=$clean}
  $result|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $probeRoot 'result.json')
  $result|ConvertTo-Json
  if(!$clean -or $before-lt 2){throw 'Owned process-tree cleanup proof failed'}
} finally {if($owned){$owned.Dispose()};Remove-Variable secret -ErrorAction SilentlyContinue}
