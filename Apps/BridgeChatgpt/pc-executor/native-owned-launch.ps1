param(
  [Parameter(Mandatory=$true)][string]$RequestPath,
  [Parameter(Mandatory=$true)][string]$ControlRoot,
  [Parameter(Mandatory=$true)][string]$ReleaseRoot
)
$ErrorActionPreference='Stop'
Add-Type -Path (Join-Path $ReleaseRoot 'WindowsJob.cs')
Add-Type -TypeDefinition 'public static class BridgeCancelInput { public static System.Threading.Tasks.Task<string> Read() { return System.Threading.Tasks.Task.Run(() => System.Console.ReadLine()); } }'
$request=Get-Content -LiteralPath $RequestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$password=(Get-Content -LiteralPath (Join-Path $ControlRoot 'restricted-user.dpapi') -Raw).Trim()|ConvertTo-SecureString
$child=Join-Path $ReleaseRoot 'native-child.ps1'
$owned=$null
try {
  $arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$child+'" -RequestPath "'+$RequestPath+'"'
  $owned=[Bridge.Native.OwnedJob]::Start('BridgeAgent',$env:COMPUTERNAME,$password,"$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe",$arguments,$request.cwd)
  $cancel=[BridgeCancelInput]::Read()
  $deadline=[DateTime]::Parse($request.deadline).ToUniversalTime()
  while(!$owned.Wait(200)) {
    if($cancel.IsCompleted -or [DateTime]::UtcNow -ge $deadline){break}
    foreach($file in @($request.stdout,$request.stderr)) {
      if((Test-Path -LiteralPath $file) -and (Get-Item -LiteralPath $file).Length -gt 8388608){throw 'Native output exceeded limit'}
    }
  }
  $finished=$owned.Wait(0)
  $exitCode=if($finished){$owned.ExitCode}else{$null}
  $stopped=$owned.StopAndConfirm(10000)
  if($request.attemptId -match '^ATT-[a-f0-9-]{36}$') {
    $receipt=Join-Path $ControlRoot ($request.attemptId+'.cleanup.json')
    $temp=$receipt+'.'+[guid]::NewGuid().ToString('N')+'.tmp'
    $json=[ordered]@{attempt_id=$request.attemptId;finished=$finished;launcher_exit=$exitCode;cleanup_confirmed=$stopped;time=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Compress
    $stream=[IO.File]::Open($temp,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$bytes=[Text.UTF8Encoding]::new($false).GetBytes($json);$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
    [IO.File]::Move($temp,$receipt)
  }
  [ordered]@{finished=$finished;launcher_exit=$exitCode;cleanup_confirmed=$stopped}|ConvertTo-Json -Compress
  if(!$stopped){exit 3}
} finally {
  if($owned){$owned.Dispose()}
  Remove-Variable password -ErrorAction SilentlyContinue
}
