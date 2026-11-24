# Nabiad Bridge - first safe test. READ-ONLY dry run: one company, 3 days, nothing uploaded.
# Run:  powershell -ExecutionPolicy Bypass -File .\run_first_test.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

# 1. Python
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  Write-Host 'Python not found. Installing with winget...'
  winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
  Write-Host 'Done. Close this window, open a NEW PowerShell and run this script again.'
  exit
}
python --version

# 2. Today's Tally backup must exist
$bk = Get-ChildItem 'E:\Tally_Backup\Daily' -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime.Date -eq (Get-Date).Date } | Select-Object -First 1
if (-not $bk) { Write-Host 'STOP: no backup from today in E:\Tally_Backup\Daily. Take a backup first.'; exit }
Write-Host "Today's backup found: $($bk.FullName)"

# 3. Tally port
if (-not (Test-NetConnection localhost -Port 9000 -InformationLevel Quiet)) { Write-Host 'STOP: Tally is not answering on port 9000.'; exit }

# 4. Confirm
$ok = Read-Host 'Tally open, companies loaded, nobody entering data right now? Type YES to continue'
if ($ok -ne 'YES') { Write-Host 'Cancelled. Nothing was sent to Tally.'; exit }

if (-not (Test-Path config.json)) { Copy-Item config.example.json config.json }

# 5. One company, 3 days, standard reports only
python bridge.py --config config.json --company "Nabiad Distribution Ltd." --from 2026-11-20 --to 2026-11-22 --confirm-live --save-raw
if ($LASTEXITCODE -ne 0) { Write-Host 'The run stopped early (see message above). Tally was not contacted again.'; exit }

Compress-Archive -Path bridge_out -DestinationPath bridge_out.zip -Force
Write-Host 'Done. Upload bridge_out.zip to the Claude chat. It holds real company data (raw Tally XML), so share it only here.'
