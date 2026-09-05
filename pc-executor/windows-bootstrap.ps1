$ErrorActionPreference = 'Stop'
$BridgeUrl = if ($env:BRIDGE_URL) { $env:BRIDGE_URL.TrimEnd('/') } else { 'https://bridge-ai-mission-control.ai.studio' }
$PairCode = if ($env:BRIDGE_PAIR_CODE) { $env:BRIDGE_PAIR_CODE.Trim() } else { Read-Host 'Bridge pairing code' }

Write-Host ''
Write-Host '=== Bridge Local Executor ===' -ForegroundColor Cyan
Write-Host 'This PC will only access the folder you choose.' -ForegroundColor DarkGray

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js LTS is required.' -ForegroundColor Yellow
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    $answer = Read-Host 'Install Node.js LTS with winget now? [Y/n]'
    if ($answer -notmatch '^[Nn]') {
      winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
      $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
    }
  }
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js was not found. Install Node.js LTS, then run the Bridge setup command again.'
}

$ProjectRoot = ''
try {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = 'Choose the ONLY folder Bridge Local Executor may access'
  $dialog.ShowNewFolderButton = $true
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $ProjectRoot = $dialog.SelectedPath }
} catch {
  $ProjectRoot = Read-Host 'Project root folder (example D:\AIProjects\MyApp)'
}
if (-not $ProjectRoot) { throw 'No project folder selected.' }
$ProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot)
if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) { throw "Folder does not exist: $ProjectRoot" }

$writeAnswer = Read-Host 'Allow AI to WRITE files inside this folder? [y/N]'
$commandAnswer = Read-Host 'Allow allowlisted test/build/git commands inside this folder? [y/N]'
$AllowWrites = if ($writeAnswer -match '^[Yy]') { 'true' } else { 'false' }
$AllowCommands = if ($commandAnswer -match '^[Yy]') { 'true' } else { 'false' }

$Base = Join-Path $env:LOCALAPPDATA 'BridgeExecutor'
$App = Join-Path $Base 'app'
$Zip = Join-Path $Base 'bridge-main.zip'
$Extract = Join-Path $Base 'extract'
New-Item -ItemType Directory -Force -Path $Base | Out-Null
Remove-Item -Recurse -Force $Extract -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $Extract | Out-Null

Write-Host 'Downloading Bridge Executor...' -ForegroundColor Cyan
Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/machxanht/BridgeChatgpt/archive/refs/heads/main.zip' -OutFile $Zip
Expand-Archive -LiteralPath $Zip -DestinationPath $Extract -Force
$Source = Get-ChildItem -LiteralPath $Extract -Directory | Select-Object -First 1
if (-not $Source) { throw 'Could not unpack Bridge Executor.' }
Remove-Item -Recurse -Force $App -ErrorAction SilentlyContinue
Move-Item -LiteralPath $Source.FullName -Destination $App
Remove-Item -Recurse -Force $Extract -ErrorAction SilentlyContinue
Remove-Item -Force $Zip -ErrorAction SilentlyContinue

Push-Location $App
try {
  Write-Host 'Installing local worker dependencies (first setup only)...' -ForegroundColor Cyan
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }

  $env:BRIDGE_URL = $BridgeUrl
  $env:BRIDGE_PAIR_CODE = $PairCode
  $env:BRIDGE_PROJECT_ROOT = $ProjectRoot
  $env:BRIDGE_EXECUTOR_ALLOW_WRITES = $AllowWrites
  $env:BRIDGE_EXECUTOR_ALLOW_COMMANDS = $AllowCommands

  $Launcher = Join-Path $Base 'Start Bridge Executor.cmd'
  @"
@echo off
title Bridge Local Executor
cd /d "$App"
call npm run executor
pause
"@ | Set-Content -LiteralPath $Launcher -Encoding ASCII

  Write-Host ''
  Write-Host "Folder locked to: $ProjectRoot" -ForegroundColor Green
  Write-Host "Future launcher: $Launcher" -ForegroundColor DarkGray
  Write-Host 'Pairing and connecting now...' -ForegroundColor Cyan
  & npm.cmd run executor
} finally {
  Pop-Location
}
