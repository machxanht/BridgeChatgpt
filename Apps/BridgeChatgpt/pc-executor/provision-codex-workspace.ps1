param(
 [Parameter(Mandatory=$true)][string]$Workspace,
 [Parameter(Mandatory=$true)][string]$CapabilitySid,
 [Parameter(Mandatory=$true)][string]$Backup
)
$ErrorActionPreference='Stop'
$env:PSModulePath="$env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules"
if($Workspace -ne 'E:\AI\Bridge\Apps\BridgeChatgpt'){throw 'Only the installed default workspace is supported'}
if($CapabilitySid -notmatch '^S-1-5-21-\d+-\d+-\d+-\d+$' -or $CapabilitySid.StartsWith('S-1-5-21-2299166317-3866393011-3260234217-')){throw 'Expected a synthetic Codex capability, not a local account SID'}
if([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Backup)) -ne 'E:\AI\Bridge\runtime\runner-control'){throw 'Protected backup required'}
for($item=Get-Item -LiteralPath $Workspace;$item;$item=$item.Parent){if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Workspace link rejected'}}
$acl=Get-Acl -LiteralPath $Workspace
if(Test-Path -LiteralPath $Backup){throw 'Never overwrite the ACL backup'}
[IO.File]::WriteAllText($Backup,$acl.Sddl)
$identity=[Security.Principal.SecurityIdentifier]::new($CapabilitySid)
$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity,[Security.AccessControl.FileSystemRights]::Modify,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))
Set-Acl -LiteralPath $Workspace -AclObject $acl
$match=(Get-Acl -LiteralPath $Workspace).GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])|Where-Object {$_.IdentityReference.Value -eq $CapabilitySid -and $_.AccessControlType -eq 'Allow' -and ([int]$_.FileSystemRights -band 0x1301bf) -eq 0x1301bf}
if(!$match){throw 'Codex workspace grant did not persist'}
Write-Output 'Codex workspace capability provisioned'
