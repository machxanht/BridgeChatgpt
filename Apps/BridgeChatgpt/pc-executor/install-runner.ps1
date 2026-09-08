param(
 [Parameter(Mandatory=$true)][string]$ConfigDraft,
 [string]$SourceRoot='E:\AI\Bridge'
)
$ErrorActionPreference='Stop'
$env:PSModulePath="$env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules"
$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Installation requires administrator privileges'}
$operator=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$nativeSid='S-1-5-21-2299166317-3866393011-3260234217-1005'
$packageSid='S-1-15-2-2031389295-489431135-2461900177-1913706768-3870177427-4052891927-2660065647'
$control=Join-Path $SourceRoot 'runtime\runner-control'
if([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($ConfigDraft)) -ne $control){throw 'Draft must be in protected control directory'}
$config=Get-Content -LiteralPath $ConfigDraft -Raw -Encoding UTF8|ConvertFrom-Json
if($config.sourceSha -notmatch '^[a-f0-9]{40}$'){throw 'Exact source SHA required'}
$head=(& git.exe -C $SourceRoot rev-parse HEAD).Trim()
if($LASTEXITCODE -ne 0 -or $head -ne $config.sourceSha){throw 'Source SHA mismatch'}
$dirty=& git.exe -C $SourceRoot diff HEAD --name-only
if($LASTEXITCODE -ne 0 -or $dirty){throw 'Commit reviewed source before installing'}
$release=Join-Path $SourceRoot ('runtime\runner-releases\runner-'+$head.Substring(0,12))
if(Test-Path -LiteralPath $release){throw 'Release exists; never overwrite an installed release'}
$workspace=[IO.Path]::GetFullPath($config.workspace.cwd).TrimEnd('\')
$apps=Join-Path $SourceRoot 'Apps'
if([IO.Path]::GetDirectoryName($workspace) -ne $apps){throw 'Workspace must be a direct approved project folder'}
if(!(Test-Path -LiteralPath $workspace)){New-Item -ItemType Directory -Path $workspace|Out-Null}
if((Get-Item -LiteralPath $workspace).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Workspace link rejected'}
$backup=Join-Path $control ('runner-install-'+$head.Substring(0,12)+'-acl-before.json')
[ordered]@{workspace=$workspace;sddl=(Get-Acl -LiteralPath $workspace).Sddl;time=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json|Set-Content -LiteralPath $backup
New-Item -ItemType Directory -Path $release|Out-Null
& icacls.exe $release /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' ('*'+$operator+':(OI)(CI)F') ('*'+$nativeSid+':(OI)(CI)RX') ('*'+$packageSid+':(OI)(CI)RX') | Out-Null
if($LASTEXITCODE -ne 0){throw 'Release protection failed'}
$files=@('native-owned-launch.ps1','native-child.ps1','native-environment.ps1','WindowsJob.cs','WindowsAppContainer.cs','WindowsNetworkPolicyIpc.cs','WindowsDirectoryMetadata.cs','runner-access.ps1','start-runner.ps1')
foreach($name in $files){Copy-Item -LiteralPath (Join-Path $SourceRoot ('Apps\BridgeChatgpt\pc-executor\'+$name)) -Destination (Join-Path $release $name)}
Copy-Item -LiteralPath (Join-Path $SourceRoot 'dist\runner-entry.mjs') -Destination (Join-Path $release 'runner-entry.mjs')
$hashes=[ordered]@{};foreach($file in Get-ChildItem -LiteralPath $release -File){$hashes[$file.Name]=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
Add-Type -Path (Join-Path $release 'WindowsDirectoryMetadata.cs')
[Bridge.Native.DirectoryMetadata]::Grant($apps,$packageSid)
$acl=Get-Acl -LiteralPath $workspace
foreach($sid in @($nativeSid,$packageSid)){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),[Security.AccessControl.FileSystemRights]::Modify,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))}
Set-Acl -LiteralPath $workspace -AclObject $acl
& icacls.exe $workspace /setintegritylevel '(OI)(CI)L'|Out-Null
if($LASTEXITCODE -ne 0){throw 'Workspace integrity label failed'}
$config.releaseRoot=$release;$config.controlRoot=$control;$config.taskRoot=Join-Path $SourceRoot 'runtime\agent-tasks'
$config|Add-Member -NotePropertyName files -NotePropertyValue $hashes -Force
$target=Join-Path $control 'runner-config.json'
$config|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $target -Encoding UTF8
& (Join-Path $release 'runner-access.ps1') -ConfigPath $target -Mode Verify
if($LASTEXITCODE -ne 0){throw 'Installed policy did not verify'}
$taskName='Bridge Native Runner v2'
$arguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+(Join-Path $release 'start-runner.ps1')+'" -ConfigPath "'+$target+'"'
$action=New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument $arguments -WorkingDirectory $control
$trigger=New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
$taskPrincipal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Highest
$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $taskPrincipal -Settings $settings -Force|Out-Null
[ordered]@{installed=$true;started=$false;release=$release;source_sha=$head;scheduled_task=$taskName;workspace=$workspace;time=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json|Set-Content (Join-Path $control 'runner-install-result.json')
