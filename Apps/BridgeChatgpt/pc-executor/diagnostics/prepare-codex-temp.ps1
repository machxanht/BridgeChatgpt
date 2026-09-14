$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'native-environment.ps1')
$target='C:\Users\BridgeAgent\AppData\Local\Packages\BridgeNative.boundary-v1\AC\Temp'
$caps=Get-Content -LiteralPath (Join-Path $env:CODEX_HOME 'cap_sid') -Raw|ConvertFrom-Json
$capValue=$caps.writable_root_by_path.'c:/users/bridgeagent/appdata/local/packages/bridgenative.boundary-v1/ac/temp'
if(!$capValue){throw 'Missing exact temp capability'}
$acl=Get-Acl -LiteralPath $target
$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($capValue),[Security.AccessControl.FileSystemRights]::Modify,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))
Set-Acl -LiteralPath $target -AclObject $acl
[ordered]@{prepared=$true;path=$target}|ConvertTo-Json|Set-Content 'E:\AI\Bridge\runtime\agent-tasks\runner-io-probe\temp-prepared.json'
