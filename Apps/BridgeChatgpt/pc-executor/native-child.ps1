param([Parameter(Mandatory=$true)][string]$RequestPath)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'native-environment.ps1')
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$OutputEncoding=[Text.UTF8Encoding]::new($false)
# This file and RequestPath are installed in runner-releases with read/execute
# rights only for BridgeAgent. No controller credential is in this request.
$request=Get-Content -LiteralPath $RequestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$env:OPENAI_API_KEY=$null
$env:CODEX_API_KEY=$null
$env:AGY_API_KEY=$null
$env:GEMINI_API_KEY=$null
$env:ANTHROPIC_API_KEY=$null
if($request.containerName) {
  Add-Type -Path (Join-Path $PSScriptRoot 'WindowsAppContainer.cs')
  $env:HTTP_PROXY='http://127.0.0.1:43892'
  $env:HTTPS_PROXY=$env:HTTP_PROXY
  $env:http_proxy=$env:HTTP_PROXY
  $env:https_proxy=$env:HTTP_PROXY
  $env:NO_PROXY=''
  $env:no_proxy=''
  $inputFile=Join-Path ([IO.Path]::GetDirectoryName($request.stdout)) 'input.txt'
  [IO.File]::WriteAllText($inputFile,[string]$request.stdin,[Text.UTF8Encoding]::new($false))
  $native=[Bridge.Native.ContainerProcess]::Start($request.containerName,$request.executable,[string[]]$request.args,$request.cwd,$inputFile,$request.stdout,$request.stderr)
  try {
    while(!$native.Wait(200)) {} # Enclosing OwnedJob enforces deadline/cancel/output limits.
    [ordered]@{exit_code=$native.ExitCode;identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name;container_sid=[Bridge.Native.ContainerProcess]::Sid($request.containerName)}|ConvertTo-Json|Set-Content -LiteralPath $request.result -Encoding UTF8
  } finally {$native.Dispose()}
  exit 0
}
function Quote-Argument([string]$value) {
  # CommandLineToArgvW quoting. No cmd.exe/PowerShell expression evaluation.
  '"'+([regex]::Replace($value,'(\\*)"','$1$1\"') -replace '(\\+)$','$1$1')+'"'
}
$start=[Diagnostics.ProcessStartInfo]::new()
$start.FileName=$request.executable
$start.WorkingDirectory=$request.cwd
$start.Arguments=($request.args | ForEach-Object {Quote-Argument $_}) -join ' '
$start.UseShellExecute=$false
$start.CreateNoWindow=$true
$start.RedirectStandardInput=$true
$start.RedirectStandardOutput=$true
$start.RedirectStandardError=$true
$start.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
$start.StandardErrorEncoding=[Text.UTF8Encoding]::new($false)
$process=[Diagnostics.Process]::new()
$process.StartInfo=$start
try {
  if(!$process.Start()){throw 'Native process did not start'}
  $stdout=[IO.File]::Create($request.stdout)
  $stderr=[IO.File]::Create($request.stderr)
  $outputCopy=$process.StandardOutput.BaseStream.CopyToAsync($stdout)
  $errorCopy=$process.StandardError.BaseStream.CopyToAsync($stderr)
  $process.StandardInput.Write([string]$request.stdin)
  $process.StandardInput.Close()
  $process.WaitForExit()
  $outputCopy.GetAwaiter().GetResult()
  $errorCopy.GetAwaiter().GetResult()
  $stdout.Dispose();$stderr.Dispose()
  [ordered]@{exit_code=$process.ExitCode;identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name}|ConvertTo-Json|Set-Content -LiteralPath $request.result -Encoding UTF8
} finally {
  if($stdout){$stdout.Dispose()};if($stderr){$stderr.Dispose()}
  $process.Dispose()
}
