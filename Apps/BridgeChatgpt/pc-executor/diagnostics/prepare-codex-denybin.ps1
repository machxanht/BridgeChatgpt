$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'native-environment.ps1')
$target=Join-Path $env:USERPROFILE '.sbx-denybin'
if($env:USERPROFILE -ne 'C:\Users\BridgeAgent'){throw 'Unexpected profile'}
[IO.Directory]::CreateDirectory($target)|Out-Null
foreach($tool in @('ssh','scp')) {foreach($ext in @('bat','cmd')){[IO.File]::WriteAllText((Join-Path $target "$tool.$ext"),"@echo off`r`nexit /b 1`r`n",[Text.Encoding]::ASCII)}}
& icacls.exe $target /grant '*S-1-15-2-2031389295-489431135-2461900177-1913706768-3870177427-4052891927-2660065647:(OI)(CI)(RX)' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Denybin ACL failed'}
[ordered]@{prepared=$true;path=$target}|ConvertTo-Json|Set-Content 'E:\AI\Bridge\runtime\agent-tasks\runner-io-probe\denybin-prepared.json'
