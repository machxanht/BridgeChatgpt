# User-run Administrator entrypoint. Installs committed source, then offline A/B/A proof.
$ErrorActionPreference='Stop'
$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Run in Administrator PowerShell'}
$root='E:\AI\Bridge';$control=Join-Path $root 'runtime\runner-control';$configPath=Join-Path $control 'runner-config.json'
$shell="$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
& $shell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'install-multi-project.ps1')
if($LASTEXITCODE -ne 0){throw 'Installation failed'}
$config=Get-Content -Raw $configPath|ConvertFrom-Json
$journal=Get-Content -Raw (Join-Path $control 'runner-journal.json')|ConvertFrom-Json
$status=Get-Content -Raw (Join-Path $control 'runner-status.json')|ConvertFrom-Json
if($journal.turn -or $status.state -ne 'waiting'){throw 'Runner is busy; offline verification was not started'}
$state=Get-Content -Raw (Join-Path $control 'managed-workspaces.json')|ConvertFrom-Json
$original=@($state.bindings|Where-Object {$_.cwd -eq $state.active})
if($original.Count -ne 1){throw 'Original active binding is required for restoration'}
$taskName='Bridge Native Runner v2';$lock=$null;$restored=$false;$steps=@();$failure=$null;$restoreFailure=$null
$stamp=[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,6)
$report=Join-Path $control ('offline-projects-'+$stamp+'.json')
function Owned([string]$script,[string]$arguments){
 $start=[Diagnostics.ProcessStartInfo]::new($shell,'-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$script+'" '+$arguments)
 $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 $p=[Diagnostics.Process]::Start($start);$out=$p.StandardOutput.ReadToEndAsync();$err=$p.StandardError.ReadToEndAsync()
 try{
  if(!$p.WaitForExit(190000)){$p.StandardInput.WriteLine('stop');if(!$p.WaitForExit(20000)){throw 'Owned cleanup unproven; runner must remain stopped'}}
  $receipt=$out.GetAwaiter().GetResult().Trim()|ConvertFrom-Json
  if(!$receipt.cleanup_confirmed -or !$receipt.finished -or $p.ExitCode -ne 0){throw 'Owned process failed or cleanup unproven'}
  if($receipt.PSObject.Properties['exit_code'] -and $receipt.exit_code -ne 0){throw 'Workspace preparation failed; inspect protected result files'}
 }finally{$p.Dispose()}
}
function Prepare($binding){
 $request=Join-Path $control ('offline-workspace-'+[guid]::NewGuid().ToString('N')+'.json')
 $body=@{attemptId=('ATT-'+[guid]::NewGuid());workspaceId=$binding.workspaceId;projectId=$binding.projectId;cwd=$binding.cwd;local_path=('Apps/'+[IO.Path]::GetFileName($binding.cwd));repository_url=$binding.repository_url;branch='main'}
 $body|ConvertTo-Json|Set-Content -LiteralPath $request -Encoding UTF8
 try{Owned (Join-Path $config.releaseRoot 'workspace-owned-launch.ps1') ('-RequestPath "'+$request+'" -ConfigPath "'+$configPath+'"')}catch{
  if(Test-Path -LiteralPath ($request+'.result.json')){$detail=Get-Content -Raw ($request+'.result.json')|ConvertFrom-Json;throw ($_.Exception.Message+'; '+$detail.error+'; result: '+$request+'.result.json')}
  throw
 }
 $result=Get-Content -Raw ($request+'.result.json')|ConvertFrom-Json
 if(!$result.prepared){throw 'Workspace not prepared'}
 return $request
}
function Marker($active,$inactive){
 $dir=Join-Path $config.taskRoot ('run-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($dir)|Out-Null
 & (Join-Path $config.releaseRoot 'runner-access.ps1') -ConfigPath $configPath -Mode PrepareTask -Task $dir|Out-Null
 if($LASTEXITCODE -ne 0){throw 'Cannot prepare marker output'}
 $request=Join-Path $config.releaseRoot ('offline-marker-'+[guid]::NewGuid().ToString('N')+'.json')
 $inactiveName=[IO.Path]::GetFileName($inactive.cwd)
 if($inactiveName -notmatch '^Offline[AB]-[A-Za-z0-9-]+$'){throw 'Unexpected offline fixture path'}
 # These generated sibling names contain no shell metacharacters or spaces.
 # Avoid embedded quotes: cmd.exe does not interpret CRT backslash-quote escapes.
 $command='echo BRIDGE_OFFLINE_OK>offline-marker.txt & findstr /x BRIDGE_OFFLINE_OK offline-marker.txt >nul && (echo CROSS_WRITE>..\'+$inactiveName+'\offline-cross.txt)'
 $spec=@{attemptId=('ATT-'+[guid]::NewGuid());deadline=[DateTime]::UtcNow.AddSeconds(30).ToString('o');executable="$env:SystemRoot\System32\cmd.exe";args=@('/d','/c',$command);cwd=$active.cwd;stdin='';containerName='BridgeNative.boundary-v1';stdout=(Join-Path $dir 'stdout.txt');stderr=(Join-Path $dir 'stderr.txt');result=(Join-Path $dir 'result.json')}
 $spec|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $request -Encoding UTF8
 Owned (Join-Path $config.releaseRoot 'native-owned-launch.ps1') ('-RequestPath "'+$request+'" -ControlRoot "'+$control+'" -ReleaseRoot "'+$config.releaseRoot+'"')
 if((Get-Content -Raw (Join-Path $active.cwd 'offline-marker.txt')).Trim() -ne 'BRIDGE_OFFLINE_OK'){throw 'Active confined write failed'}
 if(Test-Path -LiteralPath (Join-Path $inactive.cwd 'offline-cross.txt')){throw 'Inactive project was writable'}
 return $request
}
Stop-ScheduledTask -TaskName $taskName
try{
 Start-Sleep -Seconds 2
 if(Get-NetTCPConnection -LocalPort 43892,43893 -State Listen -ErrorAction SilentlyContinue){throw 'Runner has not stopped'}
 $journal=Get-Content -Raw (Join-Path $control 'runner-journal.json')|ConvertFrom-Json
 if($journal.turn){throw 'Runner claimed work before maintenance; finish recovery before verification'}
 $lock=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,43893);$lock.Start()
 $a=[pscustomobject]@{workspaceId=('offline-a-'+$stamp);projectId=('offline-a-'+$stamp);cwd=(Join-Path $root ('Apps\OfflineA-'+$stamp));repository_url=''}
 $b=[pscustomobject]@{workspaceId=('offline-b-'+$stamp);projectId=('offline-b-'+$stamp);cwd=(Join-Path $root ('Apps\OfflineB-'+$stamp));repository_url=''}
 foreach($binding in @($a,$b,$a)){
  $proof=Prepare $binding
  $other=if($binding.workspaceId -eq $a.workspaceId){$b}else{$a}
  $marker=if(Test-Path -LiteralPath $other.cwd){Marker $binding $other}else{$null}
  if(!(Test-Path (Join-Path $binding.cwd '.git')) -or !(Test-Path (Join-Path $binding.cwd 'docs\HANDOFF.md'))){throw 'Repository or handoff missing'}
  $steps+=@{cwd=$binding.cwd;preparation=$proof;marker=$marker}
 }
}catch{$failure=$_.Exception.Message}
finally{
 if($lock){try{$null=Prepare $original[0];$restored=$true}catch{$restoreFailure=$_.Exception.Message};$lock.Stop()}
 [ordered]@{sourceSha=$config.sourceSha;passed=(!$failure -and $restored);failure=$failure;restoreFailure=$restoreFailure;restored=$restored;steps=$steps;nativeRequests=0}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $report -Encoding UTF8
 if($restored){Start-ScheduledTask -TaskName $taskName}
}
if($failure -or $restoreFailure){throw ($failure+'; restoration: '+$restoreFailure+'. Report: '+$report)}
Write-Output ('OFFLINE PASS. No model request. Report: '+$report)
