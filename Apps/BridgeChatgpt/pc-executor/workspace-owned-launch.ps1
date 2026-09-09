param([Parameter(Mandatory=$true)][string]$RequestPath,[Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference='Stop'
$env:PSModulePath="$env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules"
$config=Get-Content -LiteralPath $ConfigPath -Raw|ConvertFrom-Json
$request=Get-Content -LiteralPath $RequestPath -Raw|ConvertFrom-Json
if($request.attemptId -notmatch '^ATT-[a-f0-9-]{36}$'){throw 'Invalid setup attempt'}
if([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($RequestPath)) -ne $config.controlRoot){throw 'Protected setup request required'}
Add-Type -Path (Join-Path $PSScriptRoot 'WindowsJob.cs')
Add-Type -TypeDefinition 'public static class BridgeWorkspaceCancel { public static System.Threading.Tasks.Task<string> Read() { return System.Threading.Tasks.Task.Run(() => System.Console.ReadLine()); } }'
$owned=$null
try{
 $args='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+(Join-Path $PSScriptRoot 'workspace-provision.ps1')+'" -RequestPath "'+$RequestPath+'" -ConfigPath "'+$ConfigPath+'"'
 $owned=[Bridge.Native.OwnedJob]::StartCurrent("$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe",$args,$config.controlRoot)
 $cancel=[BridgeWorkspaceCancel]::Read();$deadline=[DateTime]::UtcNow.AddSeconds(180)
 while(!$owned.Wait(200)){if($cancel.IsCompleted -or [DateTime]::UtcNow -gt $deadline){break}}
 $finished=$owned.Wait(0);$code=if($finished){$owned.ExitCode}else{-1};$cleanup=$owned.StopAndConfirm(10000)
 $receipt=[ordered]@{finished=$finished;exit_code=$code;cleanup_confirmed=$cleanup}
 $json=$receipt|ConvertTo-Json -Compress
 $file=Join-Path $config.controlRoot ($request.attemptId+'.workspace-cleanup.json');$temp=$file+'.tmp'
 [IO.File]::WriteAllText($temp,$json);Move-Item -LiteralPath $temp -Destination $file
 Write-Output $json
}finally{if($owned){$owned.Dispose()}}
