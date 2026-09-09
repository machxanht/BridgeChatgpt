$ErrorActionPreference='Stop'
$env:PSModulePath="$env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules"
$control='E:\AI\Bridge\runtime\runner-control'
$result=Join-Path $control 'native-ipc-install-result.json'
$newInstalled=$false;$oldRemoved=$false;$exceptionRemoved=$false
$sid='S-1-15-2-2031389295-489431135-2461900177-1913706768-3870177427-4052891927-2660065647'
$node='C:\Program Files\nodejs\node.exe'
$checkNet=Join-Path $env:SystemRoot 'System32\CheckNetIsolation.exe'
try {
 $principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
 if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Administrator token required'}
 Add-Type -Path 'E:\AI\Bridge\Apps\BridgeChatgpt\pc-executor\WindowsNetworkPolicy.cs'
 Add-Type -Path (Join-Path $control 'WindowsNetworkPolicyIpc.cs')
 if(![Bridge.Native.NetworkPolicy]::Verify($sid,43892)){throw 'Original network policy mismatch'}
 if(!((& $checkNet LoopbackExempt -s 2>&1|Out-String).Contains($sid))){throw 'Original loopback state mismatch'}
 [Bridge.Native.NetworkPolicyIpc]::Install($sid,43892,$node);$newInstalled=$true
 if(![Bridge.Native.NetworkPolicyIpc]::Verify($sid,43892,$node)){throw 'New exact filter verification failed'}
 & $checkNet LoopbackExempt -d "-p=$sid"|Out-Null
 if($LASTEXITCODE -ne 0){throw 'Loopback exemption removal failed'};$exceptionRemoved=$true
 [Bridge.Native.NetworkPolicy]::Remove($sid,43892);$oldRemoved=$true
 & $node (Join-Path $control 'ipc-check.mjs')
 if($LASTEXITCODE -ne 0){throw 'Positive/negative IPC boundary probe failed'}
 [ordered]@{installed=$true;boundary_probe=$true;loopback_exempt=$false;time=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json|Set-Content -LiteralPath $result -Encoding utf8
} catch {
 $failure=$_.Exception.Message;$rollback=$false
 try {
  if($oldRemoved){[Bridge.Native.NetworkPolicy]::Install($sid,43892)}
  if($exceptionRemoved){& $checkNet LoopbackExempt -a "-p=$sid"|Out-Null;if($LASTEXITCODE -ne 0){throw 'Restore exemption failed'}}
  if($newInstalled){[Bridge.Native.NetworkPolicyIpc]::Remove($sid,43892,$node)}
  $rollback=$true
 } catch {$failure+='; restore: '+$_.Exception.Message}
 [ordered]@{installed=$false;error=$failure;restored=$rollback;time=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json|Set-Content -LiteralPath $result -Encoding utf8
}
Get-Content -LiteralPath $result
