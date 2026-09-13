param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference='Stop'
$config=Get-Content -LiteralPath $ConfigPath -Raw|ConvertFrom-Json
$helper=Join-Path $PSScriptRoot 'WindowsPathQueryAccess.cs'
if(!$config.files.'WindowsPathQueryAccess.cs' -or (Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash -ne $config.files.'WindowsPathQueryAccess.cs'){throw 'Path-query helper manifest mismatch'}
Add-Type -Path $helper
# Object-manager entries can be recreated after reboot. Restore only the
# existing package-specific query rights, never profile or project permissions.
for($i=0;$i -lt 5;$i++){[Bridge.Native.PathQueryAccess]::Grant($i)}
& 'C:\Program Files\nodejs\node.exe' (Join-Path $PSScriptRoot 'runner-entry.mjs') $ConfigPath
exit $LASTEXITCODE
