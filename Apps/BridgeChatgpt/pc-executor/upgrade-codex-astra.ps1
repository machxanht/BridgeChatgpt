# User-run Administrator entrypoint. No self-elevation and no alternative scheduled-task trampoline.
$ErrorActionPreference='Stop'
$env:PSModulePath="$env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules"
$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Open PowerShell as Administrator and run this same script'}
$root='E:\AI\Bridge';$control=Join-Path $root 'runtime\runner-control'
$configPath=Join-Path $control 'runner-config.json'
$status=Get-Content (Join-Path $control 'runner-status.json') -Raw|ConvertFrom-Json
if($status.state -ne 'waiting' -or ([DateTime]::UtcNow-[DateTime]::Parse($status.time).ToUniversalTime()).TotalSeconds -gt 30){throw 'Runner must be freshly idle before upgrade'}
$journal=Get-Content (Join-Path $control 'runner-journal.json') -Raw|ConvertFrom-Json
if($journal.turn){throw 'Finish the current owned turn first'}
$head=(& git.exe -C $root rev-parse HEAD).Trim()
if($LASTEXITCODE -ne 0 -or (& git.exe -C $root diff HEAD --name-only)){throw 'Committed source required'}
$oldConfig=[IO.File]::ReadAllBytes($configPath)
$taskName='Bridge Native Runner v2'
$oldTask=Export-ScheduledTask -TaskName $taskName
$backup=Join-Path $control ('codex-upgrade-'+[guid]::NewGuid().ToString('N'))
[IO.File]::WriteAllBytes($backup+'.config.json',$oldConfig)
[IO.File]::WriteAllText($backup+'.task.xml',$oldTask)
$draft=Get-Content -LiteralPath $configPath -Raw|ConvertFrom-Json
$draft.sourceSha=$head
$draft.qualificationFile=Join-Path $control 'agy-auth-model-matrix.json'
$draftPath=Join-Path $control 'codex-astra-upgrade-draft.json'
$draft|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $draftPath -Encoding UTF8
Stop-ScheduledTask -TaskName $taskName
try{
 Start-Sleep -Seconds 2
 if(Get-NetTCPConnection -LocalPort 43892,43893 -State Listen -ErrorAction SilentlyContinue){throw 'Old runner has not stopped'}
 Push-Location $root
 try{
  & npm.cmd run build:runner
  if($LASTEXITCODE -ne 0){throw 'Runner build failed'}
  & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'install-runner.ps1') -ConfigDraft $draftPath
  if($LASTEXITCODE -ne 0){throw 'Runner installation failed'}
  Start-ScheduledTask -TaskName $taskName
  $ready=$false
  for($i=0;$i -lt 20;$i++){
   Start-Sleep -Seconds 1
   $current=Get-Content (Join-Path $control 'runner-status.json') -Raw|ConvertFrom-Json
   if($current.sourceSha -eq $head -and $current.state -eq 'waiting'){$ready=$true;break}
  }
  if(!$ready){throw 'New runner did not become ready'}
  & node.exe --import tsx (Join-Path $PSScriptRoot 'enable-codex-astra.ts')
  if($LASTEXITCODE -ne 0){throw 'Offline Codex workspace provisioning failed'}
  Start-Sleep -Seconds 8
  & node.exe (Join-Path $PSScriptRoot 'verify-codex-astra-service.mjs')
  if($LASTEXITCODE -ne 0){throw 'Live verification failed; retained evidence, no automatic retry'}
  Write-Output 'PASS: Codex and Astra completed through Bridge; fresh-login history verified.'
 }finally{Pop-Location}
}catch{
 Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
 [IO.File]::WriteAllBytes($configPath,$oldConfig)
 Register-ScheduledTask -TaskName $taskName -Xml $oldTask -Force|Out-Null
 Start-ScheduledTask -TaskName $taskName
 throw
}
