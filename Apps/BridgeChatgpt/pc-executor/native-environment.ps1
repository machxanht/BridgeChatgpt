# Start-Process -Credential can retain HOME and other profile variables from its
# caller. Resolve the profile from the actual process token, never inherited HOME.
$nativeSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$profileKey=[Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\'+$nativeSid)
if(!$profileKey){throw 'Native Windows profile is not provisioned'}
try{$nativeProfile=[Environment]::ExpandEnvironmentVariables([string]$profileKey.GetValue('ProfileImagePath'))}finally{$profileKey.Dispose()}
if(![IO.Path]::IsPathRooted($nativeProfile) -or !(Test-Path -LiteralPath $nativeProfile)){throw 'Native Windows profile path is invalid'}
$env:HOME=$nativeProfile
$env:USERPROFILE=$nativeProfile
$env:HOMEDRIVE=[IO.Path]::GetPathRoot($nativeProfile).TrimEnd('\')
$env:HOMEPATH=$nativeProfile.Substring($env:HOMEDRIVE.Length)
$env:APPDATA=Join-Path $nativeProfile 'AppData\Roaming'
$env:LOCALAPPDATA=Join-Path $nativeProfile 'AppData\Local'
$env:TEMP=Join-Path $env:LOCALAPPDATA 'Temp'
$env:TMP=$env:TEMP
$env:CODEX_HOME=Join-Path $nativeProfile '.codex'
foreach($name in @('XDG_CONFIG_HOME','XDG_CACHE_HOME','XDG_DATA_HOME','XDG_STATE_HOME','OPENAI_API_KEY','CODEX_API_KEY','AGY_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY','ANTHROPIC_API_KEY')){
  [Environment]::SetEnvironmentVariable($name,$null,'Process')
}
$env:PSModulePath="$env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules"
$env:NO_COLOR='1'
