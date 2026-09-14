$ErrorActionPreference='Stop'
$fixtureRoot=Join-Path ([IO.Path]::GetTempPath()) ('bridge-agy-settings-'+[guid]::NewGuid().ToString('N'))
$previousHome=[Environment]::GetEnvironmentVariable('HOME','Process')
$helper=Join-Path $PSScriptRoot '..\pc-executor\ensure-agy-permissions.ps1'
try {
  foreach($case in @('missing','empty','permissions-only','existing')) {
    $env:HOME=Join-Path $fixtureRoot $case
    $directory=Join-Path $env:HOME '.gemini\antigravity-cli'
    [IO.Directory]::CreateDirectory($directory)|Out-Null
    $settingsPath=Join-Path $directory 'settings.json'
    if($case -eq 'empty'){[IO.File]::WriteAllText($settingsPath,'{}')}
    if($case -eq 'permissions-only'){[IO.File]::WriteAllText($settingsPath,'{"permissions":{"deny":["command(secret)"],"ask":["command(push)"]}}')}
    if($case -eq 'existing'){[IO.File]::WriteAllText($settingsPath,'{"theme":"dark","permissions":{"allow":["command(git status)"],"deny":["command(secret)"],"ask":["command(push)"]}}')}
    & $helper
    $first=[IO.File]::ReadAllText($settingsPath)
    & $helper
    if($first -ne [IO.File]::ReadAllText($settingsPath)){throw ('Not idempotent: '+$case)}
    $actual=$first|ConvertFrom-Json
    if(@($actual.permissions.allow).Count -lt 1){throw ('Allow missing: '+$case)}
    if($case -in @('permissions-only','existing')){
      if($actual.permissions.deny[0] -ne 'command(secret)' -or $actual.permissions.ask[0] -ne 'command(push)'){throw 'Existing restrictions changed'}
    }
    if($case -eq 'existing' -and ($actual.theme -ne 'dark' -or @($actual.permissions.allow).Count -ne 2)){throw 'Existing settings lost'}
    Write-Output ('PASS '+$case)
  }
} finally {
  [Environment]::SetEnvironmentVariable('HOME',$previousHome,'Process')
}
