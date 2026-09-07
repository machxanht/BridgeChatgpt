$ErrorActionPreference = 'Stop'
$task = 'Bridge PC GitHub Safe Sync'
$script = 'E:\AI\Bridge\sync-pc-to-github.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable
Register-ScheduledTask -TaskName $task -Action $action -Trigger $trigger -Settings $settings -Description 'Safely pushes clean committed main when GitHub has not diverged.' -Force | Out-Null
Write-Output "INSTALLED:$task"