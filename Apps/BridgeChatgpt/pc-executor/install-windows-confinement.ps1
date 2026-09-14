param(
  [ValidateSet('Verify','Install','Rollback')][string]$Mode='Verify',
  [string]$Root='E:\AI\Bridge'
)
$ErrorActionPreference='Stop'
$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Run this scoped policy helper as Administrator'}
$control=Join-Path $Root 'runtime\runner-control'
if(!(Test-Path -LiteralPath $control)){throw 'Protected runner-control directory must be provisioned first'}
Add-Type -Path (Join-Path $PSScriptRoot 'WindowsNetworkPolicy.cs')
Add-Type -Path (Join-Path $PSScriptRoot 'WindowsAppContainer.cs')
$sid=[Bridge.Native.ContainerProcess]::Sid('BridgeNative.boundary-v1')
$manifest=Join-Path $control 'network-policy-install.json'
$checkNet=Join-Path $env:SystemRoot 'System32\CheckNetIsolation.exe'
$exempt=(& $checkNet LoopbackExempt -s 2>&1|Out-String).Contains($sid)
if($Mode -eq 'Verify'){
  $verified=[Bridge.Native.NetworkPolicy]::Verify($sid,43892)
  [ordered]@{verified=$verified;loopback_exempt=$exempt;package_sid=$sid;proxy_port=43892;time=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json
  if(!$verified -or !$exempt){exit 2}
  exit 0
}
if($Mode -eq 'Rollback'){
  if(!(Test-Path -LiteralPath $manifest)){throw 'Original installation manifest is required'}
  $original=Get-Content -LiteralPath $manifest -Raw -Encoding UTF8|ConvertFrom-Json
  if($original.package_sid -ne $sid -or $original.proxy_port -ne 43892){throw 'Unexpected installation manifest'}
  if($original.loopback_exempt_before){throw 'Pre-existing loopback permission requires a separately reviewed restoration'}
  # Remove the exception first, restoring default denial even if cleanup fails.
  & $checkNet LoopbackExempt -d "-p=$sid"|Out-Null
  if($LASTEXITCODE -ne 0){throw 'Failed to remove Bridge loopback exception; filters retained'}
  [Bridge.Native.NetworkPolicy]::Remove($sid,43892)
  Write-Output 'Only Bridge package network filters and its added loopback exception were removed.'
  exit 0
}
if(Test-Path -LiteralPath $manifest){
  if(![Bridge.Native.NetworkPolicy]::Verify($sid,43892) -or !$exempt){throw 'Existing Bridge policy is incomplete; refusing to overwrite its original manifest'}
  Write-Output 'Existing Bridge confinement policy verified.'
  exit 0
}
[Bridge.Native.NetworkPolicy]::Install($sid,43892)
if(![Bridge.Native.NetworkPolicy]::Verify($sid,43892)){throw 'Policy verification failed; no loopback exception was granted'}
$record=[ordered]@{installed=$true;verified=$true;package_sid=$sid;proxy_port=43892;loopback_exempt_before=$exempt;time=[DateTime]::UtcNow.ToString('o')}
$record|ConvertTo-Json|Set-Content -LiteralPath $manifest -Encoding UTF8
& $checkNet LoopbackExempt -a "-p=$sid"|Out-Null
if($LASTEXITCODE -ne 0){throw 'Scoped loopback exception failed; block filters remain installed'}
$record|ConvertTo-Json
