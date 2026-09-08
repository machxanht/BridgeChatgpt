$ErrorActionPreference='Stop'
$env:PSModulePath="$env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules"
$root='E:\AI\Bridge\runtime\agent-tasks\native-auth'
$release='E:\AI\Bridge\runtime\runner-releases\runner-v2-development'
$job=$null
try {
 Add-Type -Path (Join-Path $release 'WindowsJob.cs')
 $password=(Get-Content -LiteralPath 'E:\AI\Bridge\runtime\runner-control\restricted-user.dpapi' -Raw).Trim()|ConvertTo-SecureString
 $arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+(Join-Path $release 'native-confined-auth.ps1')+'"'
 $job=[Bridge.Native.OwnedJob]::Start('BridgeAgent',$env:COMPUTERNAME,$password,"$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe",$arguments,$root)
 $until=[DateTime]::UtcNow.AddMinutes(10)
 while(!$job.Wait(200) -and [DateTime]::UtcNow -lt $until){}
} catch {[IO.File]::WriteAllText((Join-Path $root 'launcher-error.txt'),$_.Exception.Message)} finally {
 if($job){$stopped=$job.StopAndConfirm(10000);$job.Dispose();[ordered]@{cleanup_confirmed=$stopped;time=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json|Set-Content (Join-Path $root 'cleanup.json')}
 if(Test-Path -LiteralPath (Join-Path $root 'code.txt')){Remove-Item -LiteralPath (Join-Path $root 'code.txt')}
 Remove-Variable password -ErrorAction SilentlyContinue
}
