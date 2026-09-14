# Read security descriptors only. No credential contents, ACL changes or model calls.
$ErrorActionPreference='Stop'
$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Run in Administrator PowerShell'}
$rows=@()
foreach($path in @('C:\','C:\Users','C:\Users\BridgeAgent','C:\Users\BridgeAgent\.codex')){
 try{
  $item=Get-Item -LiteralPath $path -Force
  $acl=Get-Acl -LiteralPath $path
  $rows+=@{path=$path;attributes=[string]$item.Attributes;owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value;canonical=$acl.AreAccessRulesCanonical;sddl=$acl.Sddl}
 }catch{$rows+=@{path=$path;error=$_.Exception.Message}}
}
$report='E:\AI\Bridge\runtime\runner-control\native-profile-acl-inspection.json'
$rows|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $report -Encoding UTF8
Write-Output ('Saved ACL-only report: '+$report)
