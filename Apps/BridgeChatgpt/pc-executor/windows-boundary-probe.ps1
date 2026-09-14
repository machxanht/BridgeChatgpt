param([string]$Root='E:\AI\Bridge')
$ErrorActionPreference='Stop'
$control=Join-Path $Root 'runtime\runner-control'
$probeRoot=Join-Path $Root ('runtime\agent-tasks\boundary-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $probeRoot | Out-Null
$secret=(Get-Content -LiteralPath (Join-Path $control 'restricted-user.dpapi') -Raw).Trim() | ConvertTo-SecureString
$credential=[pscredential]::new("$env:COMPUTERNAME\BridgeAgent",$secret)
$script=Join-Path $probeRoot 'probe.ps1'
$result=Join-Path $probeRoot 'result.json'
Set-Content -LiteralPath (Join-Path $control 'boundary-sentinel.txt') -Value 'harmless boundary fixture'
$probe=@'
$ErrorActionPreference='Stop'
$result=[ordered]@{identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name;control_read=$false;workspace_read=$false;native_cli=$false;error=$null}
try { [IO.File]::OpenRead('E:\AI\Bridge\runtime\runner-control\boundary-sentinel.txt').Dispose();$result.control_read=$true } catch {}
try { $result.workspace_read=Test-Path -LiteralPath 'E:\AI\Bridge\package.json' } catch {}
try { $result.native_cli=Test-Path -LiteralPath 'C:\Users\OliverkhangPC\AppData\Local\agy\bin\agy.exe' } catch {$result.error=$_.Exception.GetType().Name}
$result|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'result.json') -Encoding UTF8
'@
Set-Content -LiteralPath $script -Value $probe -Encoding UTF8
try {
  $process=Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',"`"$script`"") -Credential $credential -WorkingDirectory $Root -WindowStyle Hidden -PassThru
  if(!$process.WaitForExit(20000)){throw 'Restricted probe did not finish within deadline'}
  if(Test-Path -LiteralPath $result){Get-Content -LiteralPath $result -Raw}else{throw "Restricted probe exited $($process.ExitCode) without a receipt"}
} finally {Remove-Variable secret,credential -ErrorAction SilentlyContinue}
