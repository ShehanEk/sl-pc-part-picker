# Puts a "PCPrice Sync" shortcut on the desktop. Run again if the repo moves:
#
#   npm run shortcut
#
# The shortcut runs `npm start` in a hidden window rather than pointing at
# electron.exe, so every launch rebuilds first. The app runs a snapshot of
# ../src, and launching electron directly would quietly keep running a stale
# scraper after a fix landed.
#
# npm.cmd, not npm: the npm.ps1 shim can be blocked by the execution policy.

$app = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$path = Join-Path $desktop 'PCPrice Sync.lnk'

# The shortcut this script made before the app was renamed.
$old = Join-Path $desktop 'PC Maker Sync.lnk'
if (Test-Path -LiteralPath $old) { Remove-Item -LiteralPath $old }

$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($path)
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shortcut.Arguments = "-NoProfile -WindowStyle Hidden -Command `"Set-Location -LiteralPath '$app'; npm.cmd start`""
$shortcut.WorkingDirectory = $app
$shortcut.IconLocation = Join-Path $app 'assets\icon.ico'
$shortcut.WindowStyle = 7 # minimised, so the console never flashes up before it hides
$shortcut.Description = 'PCPrice.lk price sync'
$shortcut.Save()

Write-Output "created $path"
