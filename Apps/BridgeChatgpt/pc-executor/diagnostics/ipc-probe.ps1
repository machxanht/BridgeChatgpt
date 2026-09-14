param([switch]$Child)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$outside='E:\AI\Bridge-boundary-6e32dc0579e24019afd981caf6318ae7.txt'
$inside='E:\AI\Bridge\runtime\agent-tasks\container-probe-v1\inside.txt'
$read=$false;$write=$false;$allowed=$false;$network=$false
try{[IO.File]::ReadAllText($outside)|Out-Null;$read=$true}catch{}
try{[IO.File]::AppendAllText($outside,'container-probe');$write=$true}catch{}
try{[IO.File]::WriteAllText($inside,'allowed');$allowed=$true}catch{}
$client=[Net.Sockets.TcpClient]::new()
try{$connect=$client.ConnectAsync('127.0.0.1',43891);if($connect.Wait(2000)){$network=$client.Connected}}catch{}finally{$client.Dispose()}
$proxy=$false;$direct=$false;$listen=$false
$client=[Net.Sockets.TcpClient]::new()
try{$connect=$client.ConnectAsync('127.0.0.1',43892);if($connect.Wait(2000)){$proxy=$client.Connected}}catch{}finally{$client.Dispose()}
$client=[Net.Sockets.TcpClient]::new()
try{$connect=$client.ConnectAsync('1.1.1.1',443);if($connect.Wait(2000)){$direct=$client.Connected}}catch{}finally{$client.Dispose()}
$own=$false;$wild=$false;$server=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
try{$server.Start();$listen=$true;$self=[Net.Sockets.TcpClient]::new();$connect=$self.ConnectAsync("127.0.0.1",$server.LocalEndpoint.Port);if($connect.Wait(1500)){$own=$self.Connected};$self.Dispose()}catch{}finally{$server.Stop()};$wildServer=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Any,0);try{
 $wildServer.Start();$wild=$true
 $phase=if($Child){'child'}else{'parent'}
 $runId=[IO.File]::ReadAllText('E:\AI\Bridge\runtime\agent-tasks\container-probe-v1\ipc-run.txt')
 [ordered]@{id=$runId;port=$wildServer.LocalEndpoint.Port}|ConvertTo-Json -Compress|Set-Content "E:\AI\Bridge\runtime\agent-tasks\container-probe-v1\ipc-ready-$phase.json"
 $until=[DateTime]::UtcNow.AddSeconds(10)
 do {
  Start-Sleep -Milliseconds 100
  try{$released=[IO.File]::ReadAllText("E:\AI\Bridge\runtime\agent-tasks\container-probe-v1\ipc-release-$phase.txt") -eq $runId}catch{$released=$false}
 }while(!$released -and [DateTime]::UtcNow -lt $until)
}catch{}finally{$wildServer.Stop()}
[ordered]@{proxy_connect=$proxy;direct_connect=$direct;can_listen=$listen;own_loopback=$own;wildcard_listen=$wild;outside_read=$read;outside_write=$write;inside_write=$allowed;loopback_connect=$network;child=[bool]$Child}|ConvertTo-Json -Compress
if(!$Child){
  $start=[Diagnostics.ProcessStartInfo]::new()
  $start.FileName="$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $start.Arguments='-NoProfile -NonInteractive -File "'+$PSCommandPath+'" -Child'
  $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
  $p=[Diagnostics.Process]::Start($start)
  [Console]::Write($p.StandardOutput.ReadToEnd());[Console]::Error.Write($p.StandardError.ReadToEnd());$p.WaitForExit();$p.Dispose()
}
