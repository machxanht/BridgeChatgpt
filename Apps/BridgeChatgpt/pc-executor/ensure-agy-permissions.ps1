<#
  Configure the smallest non-interactive Antigravity command allowlist that
  Bridge's managed runner needs. This runs as BridgeAgent before an AGY child
  starts, so it never copies credentials and never changes deny/ask rules.
  AGY headless mode soft-denies command tools unless they are pre-approved.
#>
$ErrorActionPreference='Stop'
$profile=[Environment]::GetEnvironmentVariable('HOME','Process')
if([string]::IsNullOrWhiteSpace($profile)){throw 'Native HOME is not set'}
$settingsPath=Join-Path $profile '.gemini\antigravity-cli\settings.json'
$directory=Split-Path -Parent $settingsPath
if(!(Test-Path -LiteralPath $directory)){New-Item -ItemType Directory -Path $directory -Force|Out-Null}

$settings=[pscustomobject]@{}
if(Test-Path -LiteralPath $settingsPath){
  $raw=Get-Content -LiteralPath $settingsPath -Raw -Encoding UTF8
  if($raw.Trim()){$settings=$raw|ConvertFrom-Json}
}
if($null -eq $settings.permissions){$settings|Add-Member -NotePropertyName permissions -NotePropertyValue ([pscustomobject]@{}) -Force}
$allow=[System.Collections.Generic.List[string]]::new()
foreach($rule in @($settings.permissions.allow)){if($null -ne $rule -and -not [string]::IsNullOrWhiteSpace([string]$rule)){$allow.Add([string]$rule)}}
# Native prompts use cmd.exe /c and the first command is constrained to the
# project toolchain/inspection commands. The AppContainer remains the OS
# boundary; no wildcard, network, PowerShell or unsandboxed rule is granted.
$required=@(
  'command(regex:^cmd\.exe /c "?((node|where|type|dir|findstr|mkdir|copy|move|del|echo)(\s|$)|npm (test|run (build|lint|test|build:runner))(\s|$)|npx (tsc|vite|esbuild)(\s|$)|git (status|diff|log|show|branch|rev-parse|init|add|commit)(\s|$)).*)'
)
foreach($rule in $required){if(!$allow.Contains($rule)){$allow.Add($rule)}}
$settings.permissions | Add-Member -NotePropertyName allow -NotePropertyValue @($allow.ToArray()) -Force
$json=$settings|ConvertTo-Json -Depth 16
$temp="$settingsPath.$PID.$([guid]::NewGuid().ToString('N')).tmp"
[IO.File]::WriteAllText($temp,$json+"`r`n",[Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $temp -Destination $settingsPath -Force
