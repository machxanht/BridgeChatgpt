param(
  [string]$ProxyExecutable='C:\Program Files\nodejs\node.exe',
  [string]$ContainerName='BridgeNative.boundary-v1',
  [UInt16]$ProxyPort=43892
)
$ErrorActionPreference='Stop'
$env:PSModulePath="$env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules"
$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Administrator token required to inspect WFP'}
Add-Type -Path (Join-Path $PSScriptRoot 'WindowsNetworkPolicyIpc.cs')
Add-Type -Path (Join-Path $PSScriptRoot 'WindowsAppContainer.cs')
$sid=[Bridge.Native.ContainerProcess]::Sid($ContainerName)
$exemptions=(& "$env:SystemRoot\System32\CheckNetIsolation.exe" LoopbackExempt -s 2>&1|Out-String)
if($LASTEXITCODE -ne 0){throw 'Cannot verify Windows loopback exemptions'}
$exempt=$exemptions.Contains($sid)
$verified=[Bridge.Native.NetworkPolicyIpc]::Verify($sid,$ProxyPort,$ProxyExecutable)
[ordered]@{verified=($verified -and !$exempt);loopback_exempt=$exempt;package_sid=$sid;proxy_port=$ProxyPort;time=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json
if(!$verified -or $exempt){exit 2}
