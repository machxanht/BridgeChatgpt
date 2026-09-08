param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference='Stop'
& 'C:\Program Files\nodejs\node.exe' (Join-Path $PSScriptRoot 'runner-entry.mjs') $ConfigPath
exit $LASTEXITCODE
