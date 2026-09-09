# One user-run Administrator installation. No model calls, no test suite, no self-elevation.
$ErrorActionPreference='Stop'
$env:PSModulePath="$env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules"
$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Run this script in Administrator PowerShell'}
$root='E:\AI\Bridge';$control=Join-Path $root 'runtime\runner-control';$configPath=Join-Path $control 'runner-config.json'
$head=(& git.exe -C $root rev-parse HEAD).Trim()
if($LASTEXITCODE -ne 0 -or (& git.exe -C $root diff HEAD --name-only -- Apps/BridgeChatgpt/pc-executor Apps/BridgeChatgpt/server package.json package-lock.json)){throw 'Commit runner/server sources before installation'}
$config=Get-Content -LiteralPath $configPath -Raw|ConvertFrom-Json
if($config.sourceSha -eq $head -and $config.managedProjects){Write-Output 'Managed-project runner is already installed; no reinstall needed.';exit}
$status=Get-Content (Join-Path $control 'runner-status.json') -Raw|ConvertFrom-Json
$journal=Get-Content (Join-Path $control 'runner-journal.json') -Raw|ConvertFrom-Json
if($journal.turn -or $status.state -ne 'waiting' -or ([DateTime]::UtcNow-[DateTime]::Parse($status.time).ToUniversalTime()).TotalSeconds -gt 30){throw 'Wait for the current runner job to finish before installing'}
$old=[IO.File]::ReadAllBytes($configPath);$taskName='Bridge Native Runner v2';$xml=Export-ScheduledTask -TaskName $taskName
$backup=Join-Path $control ('multi-project-upgrade-'+[guid]::NewGuid().ToString('N'))
[IO.File]::WriteAllBytes($backup+'.config.json',$old);[IO.File]::WriteAllText($backup+'.task.xml',$xml)
$config.sourceSha=$head;$config|Add-Member -NotePropertyName managedProjects -NotePropertyValue $true -Force
$draft=Join-Path $control 'multi-project-config-draft.json';$config|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $draft -Encoding UTF8
Stop-ScheduledTask -TaskName $taskName
try{
 Start-Sleep -Seconds 2
 if(Get-NetTCPConnection -LocalPort 43892,43893 -State Listen -ErrorAction SilentlyContinue){throw 'Old runner is still stopping'}
 Push-Location $root
 try{
  & npm.cmd run build:runner;if($LASTEXITCODE -ne 0){throw 'Runner compilation failed'}
  & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'install-runner.ps1') -ConfigDraft $draft
  if($LASTEXITCODE -ne 0){throw 'Runner installation failed'}
 }finally{Pop-Location}
 Start-ScheduledTask -TaskName $taskName
 $ready=$false
 for($i=0;$i -lt 25;$i++){
  Start-Sleep -Seconds 1;$current=Get-Content (Join-Path $control 'runner-status.json') -Raw|ConvertFrom-Json
  if($current.sourceSha -eq $head -and $current.state -eq 'waiting'){$ready=$true;break}
 }
 if(!$ready){throw 'New runner did not reach waiting state'}
 Write-Output 'INSTALLED: multiple projects and sequential model handoff. No model request or test suite was run.'
}catch{
 Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
 [IO.File]::WriteAllBytes($configPath,$old);Register-ScheduledTask -TaskName $taskName -Xml $xml -Force|Out-Null;Start-ScheduledTask -TaskName $taskName
 throw
}
