param([Parameter(Mandatory=$true)][string]$RequestPath,[Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference='Stop'
$env:PSModulePath="$env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules"
$package='S-1-15-2-2031389295-489431135-2461900177-1913706768-3870177427-4052891927-2660065647'
$native='S-1-5-21-2299166317-3866393011-3260234217-1005'
function PlainTree([string]$folder){
 $queue=[Collections.Generic.Queue[string]]::new();$queue.Enqueue($folder)
 while($queue.Count){$p=$queue.Dequeue();$item=Get-Item -LiteralPath $p -Force;if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Project contains a junction or symbolic link; refusing automatic access changes'};if($item.PSIsContainer){foreach($child in Get-ChildItem -LiteralPath $p -Force){if($child.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Project contains a junction or symbolic link'};if($child.PSIsContainer){$queue.Enqueue($child.FullName)}}}}
}
function ProjectPath([string]$value){
 $full=[IO.Path]::GetFullPath($value).TrimEnd('\')
 if([IO.Path]::GetDirectoryName($full) -ne 'E:\AI\Bridge\Apps'){throw 'Project must be a direct child of Apps'}
 if(Test-Path -LiteralPath $full){PlainTree $full}
 return $full
}
function Grant([string]$folder,[string]$sid){
 $acl=Get-Acl -LiteralPath $folder
 $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),[Security.AccessControl.FileSystemRights]::Modify,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))
 Set-Acl -LiteralPath $folder -AclObject $acl
}
try{
 $config=Get-Content -LiteralPath $ConfigPath -Raw|ConvertFrom-Json
 & (Join-Path $PSScriptRoot 'runner-access.ps1') -ConfigPath $ConfigPath -Mode VerifyPolicy|Out-Null
 $request=Get-Content -LiteralPath $RequestPath -Raw|ConvertFrom-Json
 if(!$config.managedProjects){throw 'Managed projects are not enabled in the installed config'}
 $cwd=ProjectPath $request.cwd
 if($request.local_path -ne ('Apps/'+[IO.Path]::GetFileName($cwd))){throw 'Project mapping mismatch'}
 $store=Join-Path $config.controlRoot 'managed-workspaces.json'
 $state=if(Test-Path -LiteralPath $store){Get-Content -LiteralPath $store -Raw|ConvertFrom-Json}else{[pscustomobject]@{active=$config.workspace.cwd;bindings=@()}}
 $binding=@($state.bindings)|Where-Object {$_.workspaceId -eq $request.workspaceId}
 if($binding -and ($binding.projectId -ne $request.projectId -or $binding.cwd -ne $cwd -or $binding.repository_url -ne $request.repository_url)){throw 'Installed project binding cannot be redirected'}
 if(@($state.bindings)|Where-Object {$_.cwd -eq $cwd -and $_.workspaceId -ne $request.workspaceId}){throw 'Folder already belongs to another project'}
 if(!(Test-Path -LiteralPath $cwd)){
  if($request.repository_url){
   if($request.repository_url -notmatch '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'){throw 'Use an HTTPS GitHub repository URL'}
   if($request.branch -notmatch '^[A-Za-z0-9][A-Za-z0-9._/-]{0,150}$' -or $request.branch.Contains('..')){throw 'Invalid clone branch'}
   $env:GIT_TERMINAL_PROMPT='0';$env:GCM_INTERACTIVE='Never';$env:GIT_LFS_SKIP_SMUDGE='1'
   $staging=Join-Path $config.controlRoot ('clone-'+[guid]::NewGuid().ToString('N'))
   & 'C:\Program Files\Git\cmd\git.exe' -c core.hooksPath=NUL -c protocol.file.allow=never -c protocol.ext.allow=never clone --single-branch --branch $request.branch -- $request.repository_url $staging *> ($RequestPath+'.git.log')
   if($LASTEXITCODE -ne 0){throw 'Clone failed. Check repository URL/branch and Git access on this PC; see protected setup log. Existing files were not overwritten.'}
   PlainTree $staging
   if([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($staging)) -ne $config.controlRoot -or [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($cwd)) -ne 'E:\AI\Bridge\Apps' -or (Test-Path -LiteralPath $cwd)){throw 'Clone destination changed; refusing move'}
   Move-Item -LiteralPath $staging -Destination $cwd
  }else{[IO.Directory]::CreateDirectory($cwd)|Out-Null}
 }
 PlainTree $cwd
 # Existing folders are adopted in place. Never pull/reset/switch their branch.
 if(!$binding){
  $state.bindings=@($state.bindings)+@([pscustomobject]@{workspaceId=$request.workspaceId;projectId=$request.projectId;cwd=$cwd;repository_url=$request.repository_url;capability=$null})
  [IO.File]::WriteAllText($RequestPath+'.acl-before.txt',(Get-Acl -LiteralPath $cwd).Sddl)
  $state|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $store -Encoding UTF8
 }
 if($state.active -and $state.active -ne $cwd){
  $previous=ProjectPath $state.active
  if(Test-Path -LiteralPath $previous){
   $acl=Get-Acl -LiteralPath $previous
   foreach($rule in @($acl.GetAccessRules($true,$false,[Security.Principal.SecurityIdentifier]))){if($rule.IdentityReference.Value -eq $package -and $rule.AccessControlType -eq 'Allow'){$acl.RemoveAccessRuleSpecific($rule)}}
   Set-Acl -LiteralPath $previous -AclObject $acl
  }
 }
 # Publish before access changes so a restarted coordinator can revoke a partial activation.
 $state.active=$cwd;$state|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $store -Encoding UTF8
 Grant $cwd $native;Grant $cwd $package
 & "$env:SystemRoot\System32\icacls.exe" $cwd /setintegritylevel '(OI)(CI)L'|Out-Null
 if($LASTEXITCODE -ne 0){throw 'Cannot set workspace integrity label'}
 $binding=@($state.bindings)|Where-Object {$_.workspaceId -eq $request.workspaceId}
 if(!$binding.capability){
  # Native CLI initializes its own synthetic workspace SID without any model call.
  $task=Join-Path $config.taskRoot ('run-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($task)|Out-Null
  & (Join-Path $PSScriptRoot 'runner-access.ps1') -ConfigPath $ConfigPath -Mode PrepareTask -Task $task|Out-Null
  Add-Type -Path (Join-Path $PSScriptRoot 'WindowsJob.cs')
  $password=(Get-Content -LiteralPath (Join-Path $config.controlRoot 'restricted-user.dpapi') -Raw).Trim()|ConvertTo-SecureString
  function NativeSetup([string]$executable,[string[]]$arguments){
   $spec=[ordered]@{executable=$executable;args=$arguments;cwd=$cwd;stdin='';containerName='BridgeNative.boundary-v1';stdout=(Join-Path $task 'stdout.txt');stderr=(Join-Path $task 'stderr.txt');result=(Join-Path $task 'result.json')}
   $file=Join-Path $PSScriptRoot ('workspace-init-'+[guid]::NewGuid().ToString('N')+'.json');$spec|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $file -Encoding UTF8
   $args='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+(Join-Path $PSScriptRoot 'native-child.ps1')+'" -RequestPath "'+$file+'"'
   $job=[Bridge.Native.OwnedJob]::Start('BridgeAgent',$env:COMPUTERNAME,$password,"$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe",$args,$cwd)
   try{if(!$job.Wait(30000)){throw 'Native workspace setup timed out'};$exit=$job.ExitCode;if(!$job.StopAndConfirm(10000)){throw 'Native setup cleanup failed'};if($exit -ne 0){throw 'Native profile setup failed'};$result=Get-Content -LiteralPath $spec.result -Raw|ConvertFrom-Json;if($result.exit_code -ne 0){throw 'Native capability initialization failed; inspect setup output'}}finally{$job.Dispose()}
   return [IO.File]::ReadAllText($spec.stdout)
  }
  NativeSetup $config.executables.codex.path @('-c','windows.sandbox="unelevated"','-c','windows.sandbox_private_desktop=false','sandbox','-P',':workspace','-C',$cwd,"$env:SystemRoot\System32\cmd.exe",'/d','/c','echo BRIDGE_WORKSPACE_INIT')|Out-Null
  $caps=(NativeSetup "$env:SystemRoot\System32\findstr.exe" @('^','C:\Users\BridgeAgent\.codex\cap_sid'))|ConvertFrom-Json
  $key=$cwd.Replace('\','/').ToLowerInvariant();$cap=$caps.workspace_by_cwd.PSObject.Properties[$key].Value
  if($cap -notmatch '^S-1-5-21-\d+-\d+-\d+-\d+$' -or $cap.StartsWith('S-1-5-21-2299166317-3866393011-3260234217-')){throw 'Invalid native workspace capability'}
  $binding.capability=$cap;$state|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $store -Encoding UTF8
 }
 Grant $cwd $binding.capability
 $docs=Join-Path $cwd 'docs';if(!(Test-Path -LiteralPath $docs)){[IO.Directory]::CreateDirectory($docs)|Out-Null}
 foreach($name in @('HANDOFF','ARCHITECTURE','RUNBOOK','SECURITY','ROADMAP')){
  $file=Join-Path $docs ($name+'.md');if(!(Test-Path -LiteralPath $file)){[IO.File]::WriteAllText($file,"# $name`r`n`r`nProject: $($request.workspaceId). Work only in this project. Record actual changes and checks; preserve existing work.`r`n")}
 }
 $entry=Join-Path $cwd 'START_HERE.md';if(!(Test-Path -LiteralPath $entry)){[IO.File]::WriteAllText($entry,"# Project handoff`r`n`r`nRead docs/HANDOFF.md before changing code. Agents work sequentially in this project. Update the handoff after each task. Do not claim unperformed tests.`r`n")}
 [ordered]@{cwd=$cwd;prepared=$true;time=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json|Set-Content -LiteralPath ($RequestPath+'.result.json') -Encoding UTF8
}catch{
 [ordered]@{error=$_.Exception.Message;prepared=$false}|ConvertTo-Json|Set-Content -LiteralPath ($RequestPath+'.result.json') -Encoding UTF8
 exit 1
}
