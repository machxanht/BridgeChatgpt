param([string]$Root='E:\AI\Bridge')
$ErrorActionPreference='Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'WindowsJob.cs')
$probeRoot=Join-Path $Root ('runtime\agent-tasks\native-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $probeRoot | Out-Null
$secret=(Get-Content -LiteralPath (Join-Path $Root 'runtime\runner-control\restricted-user.dpapi') -Raw).Trim() | ConvertTo-SecureString
$script=Join-Path $probeRoot 'probe.ps1'
$probe=@'
$ErrorActionPreference='Continue'
$env:AGY_API_KEY=$null
$env:OPENAI_API_KEY=$null
$env:GEMINI_API_KEY=$null
Set-Location -LiteralPath $PSScriptRoot
& 'E:\AI\Bridge\runtime\runner-releases\agy-1.1.27\agy.exe' --sandbox --add-dir $PSScriptRoot --print-timeout 20s --output-format stream-json -p 'Reply only BRIDGE_NATIVE_PROBE. Do not use tools or modify files.' 1> (Join-Path $PSScriptRoot 'stdout.txt') 2> (Join-Path $PSScriptRoot 'stderr.txt')
[ordered]@{identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name;exit_code=$LASTEXITCODE}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'result.json') -Encoding UTF8
'@
Set-Content -LiteralPath $script -Value $probe -Encoding UTF8
try {
  $owned=[Bridge.Native.OwnedJob]::Start('BridgeAgent',$env:COMPUTERNAME,$secret,"$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe","-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$script`"",$probeRoot)
  $finished=$owned.Wait(30000)
  $exitCode=if($finished){$owned.ExitCode}else{$null}
  $clean=$owned.StopAndConfirm(10000)
  $diagnostics=Get-Content -LiteralPath (Join-Path $probeRoot 'stderr.txt') -Raw -ErrorAction SilentlyContinue
  [ordered]@{finished=$finished;exit_code=$exitCode;cleanup_confirmed=$clean;authentication_required=[bool]($diagnostics-match 'Authentication required');sandbox_unsupported=[bool]($diagnostics-match 'sandbox.*(unsupported|not supported)')}|ConvertTo-Json
  Write-Output "Evidence directory: $probeRoot"
} finally {if($owned){$owned.Dispose()};Remove-Variable secret -ErrorAction SilentlyContinue}
