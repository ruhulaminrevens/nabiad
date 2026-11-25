# Nabiad Bridge - first safe test. READ-ONLY dry run: one company, 3 days, nothing uploaded.
# Run:  powershell -ExecutionPolicy Bypass -File .\run_first_test.ps1
$ErrorActionPreference = 'Stop'
$src = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Real Python (the Microsoft Store 'python' stub does not count)
$py = $null
foreach ($name in 'py', 'python') {
  if (Get-Command $name -ErrorAction SilentlyContinue) {
    $v = ''
    try {
      $ErrorActionPreference = 'Continue'
      $v = (& $name --version 2>&1 | Out-String)
    } catch { $v = '' }
    $ErrorActionPreference = 'Stop'
    if ($v -match 'Python 3') { $py = $name; break }
  }
}
if (-not $py) {
  Write-Host 'Python 3 is not installed. Installing with winget...'
  winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
  Write-Host 'If that worked: close this window, open a NEW PowerShell and run this script again.'
  Write-Host 'If winget is missing: install Python 3 from python.org (tick "Add python.exe to PATH"), then run again.'
  exit
}
Write-Host ("Using: " + $py)

# 2. Today's Tally backup folder must exist
$bkPath = 'E:\Tally_Backup\123 TALLY BACK UP\' + (Get-Date).ToString('dd.MM.yyyy')
if (-not (Test-Path $bkPath)) { Write-Host "STOP: no backup folder for today: $bkPath"; exit }
Write-Host "Today's backup found: $bkPath (made $((Get-Item $bkPath).LastWriteTime))"

# 3. Tally port
if (-not (Test-NetConnection localhost -Port 9000 -InformationLevel Quiet)) { Write-Host 'STOP: Tally is not answering on port 9000.'; exit }

# 4. Confirm
$ok = Read-Host 'Tally open, companies loaded, nobody entering data right now? Type YES to continue'
if ($ok -ne 'YES') { Write-Host 'Cancelled. Nothing was sent to Tally.'; exit }

# 5. Work in a folder you can write to
$work = Join-Path $env:USERPROFILE 'NabiadBridge'
New-Item -ItemType Directory -Force -Path $work | Out-Null
Copy-Item (Join-Path $src 'bridge.py') $work -Force
Copy-Item (Join-Path $src 'config.example.json') (Join-Path $work 'config.json') -Force
Remove-Item (Join-Path $work 'bridge_out') -Recurse -Force -ErrorAction SilentlyContinue
Set-Location $work

# 6. One company, 3 days, standard reports only
& $py bridge.py --config config.json --company "Nabiad Distribution Ltd." --from 2026-11-21 --to 2026-11-22 --skip-ledgers --confirm-live --save-raw
if ($LASTEXITCODE -ne 0) { Write-Host 'The run stopped early (see message above). Tally was not contacted again.'; exit }

Compress-Archive -Path (Join-Path $work 'bridge_out') -DestinationPath (Join-Path $work 'bridge_out.zip') -Force
Write-Host 'Done. Upload bridge_out.zip to the Claude chat. It holds real company data (raw Tally XML), so share it only here.'
explorer.exe /select,(Join-Path $work 'bridge_out.zip')
