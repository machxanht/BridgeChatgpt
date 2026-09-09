param(
 [Parameter(Mandatory=$true)][string]$ConfigPath,
 [Parameter(Mandatory=$true)][ValidateSet('Verify','VerifyPolicy','PrepareTask','Credential')][string]$Mode,
 [string]$Task
)
$ErrorActionPreference='Stop'
$env:PSModulePath="$env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules"
$nativeSid='S-1-5-21-2299166317-3866393011-3260234217-1005'
$packageSid='S-1-15-2-2031389295-489431135-2461900177-1913706768-3870177427-4052891927-2660065647'
$operator=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$trusted=@('S-1-5-18','S-1-5-32-544',$operator)
function RealPath([string]$value){
 if(![IO.Path]::IsPathRooted($value)){throw 'Absolute installed path required'}
 $item=Get-Item -LiteralPath $value
 for($cursor=$item;$cursor;$cursor=$cursor.Parent){if($cursor.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse path rejected'}}
 return $item.FullName.TrimEnd('\')
}
function Protected([string]$value,[bool]$private){
 $acl=Get-Acl -LiteralPath (RealPath $value)
 $owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
 if($trusted -notcontains $owner){throw 'Untrusted owner on installed path'}
 foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
  if($rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow){continue}
  $sid=$rule.IdentityReference.Value;$rights=[int]$rule.FileSystemRights
  if($trusted -notcontains $sid -and ($rights -band 0xD0156)){throw 'Untrusted write access on installed path'}
  if($private -and $trusted -notcontains $sid -and ($rights -band 1)){throw 'Controller path readable outside controller'}
 }
}
Protected $ConfigPath $true
$config=Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8|ConvertFrom-Json
if((RealPath $config.controlRoot) -ne [IO.Path]::GetDirectoryName((RealPath $ConfigPath))){throw 'Control root mismatch'}
Protected $config.controlRoot $true
Protected $config.releaseRoot $false
Protected $config.qualificationFile $true
foreach($entry in $config.executables.PSObject.Properties){Protected $entry.Value.path $false;Protected ([IO.Path]::GetDirectoryName($entry.Value.path)) $false}
foreach($property in $config.files.PSObject.Properties){
 if($property.Name -ne [IO.Path]::GetFileName($property.Name)){throw 'Invalid manifest file'}
 $file=Join-Path $config.releaseRoot $property.Name
 Protected $file $false
 if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $property.Value){throw 'Installed file changed'}
}
if($Mode -eq 'Credential'){
 $file=Join-Path $config.controlRoot 'controller-token.dpapi';Protected $file $true
 $secure=(Get-Content -LiteralPath $file -Raw).Trim()|ConvertTo-SecureString
 $plain=[Runtime.InteropServices.Marshal]::SecureStringToGlobalAllocUnicode($secure)
 try{[Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringUni($plain))}finally{[Runtime.InteropServices.Marshal]::ZeroFreeGlobalAllocUnicode($plain)}
 exit
}
if($Mode -eq 'PrepareTask'){
 $taskPath=RealPath $Task
 if([IO.Path]::GetDirectoryName($taskPath) -ne (RealPath $config.taskRoot) -or [IO.Path]::GetFileName($taskPath) -notmatch '^run-[A-Za-z0-9]+$'){throw 'Invalid attempt output path'}
 $acl=Get-Acl -LiteralPath $taskPath
 foreach($sid in @($nativeSid,$packageSid)){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),[Security.AccessControl.FileSystemRights]::Modify,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))}
 Set-Acl -LiteralPath $taskPath -AclObject $acl
 & "$env:SystemRoot\System32\icacls.exe" $taskPath /setintegritylevel '(OI)(CI)L' | Out-Null
 if($LASTEXITCODE -ne 0){throw 'Cannot label native output directory'}
 Write-Output 'prepared';exit
}
$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Installed coordinator needs permission to inspect WFP'}
Add-Type -Path (Join-Path $config.releaseRoot 'WindowsNetworkPolicyIpc.cs')
if(![Bridge.Native.NetworkPolicyIpc]::Verify($packageSid,43892,'C:\Program Files\nodejs\node.exe')){throw 'Installed WFP policy mismatch'}
$exempt=(& "$env:SystemRoot\System32\CheckNetIsolation.exe" LoopbackExempt -s 2>&1|Out-String)
if($LASTEXITCODE -ne 0 -or $exempt.Contains($packageSid)){throw 'Loopback exemption verification failed'}
if($Mode -eq 'VerifyPolicy'){Write-Output 'verified';exit}
$workspace=RealPath $config.workspace.cwd
if(!$workspace.StartsWith('E:\AI\Bridge\Apps\',[StringComparison]::OrdinalIgnoreCase)){throw 'Workspace outside approved project root'}
foreach($sid in @($nativeSid,$packageSid)){
 $rules=(Get-Acl -LiteralPath $workspace).GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])
 $match=$rules|Where-Object {$_.IdentityReference.Value -eq $sid -and $_.AccessControlType -eq 'Allow' -and ([int]$_.FileSystemRights -band 0x1301bf) -eq 0x1301bf}
 if(!$match){throw 'Workspace is not provisioned for native execution'}
}
Write-Output 'verified'
