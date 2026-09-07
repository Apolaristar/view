@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$d = Join-Path '%~dp0' 'release\win-unpacked'; $e = Get-ChildItem -LiteralPath $d -Filter *.exe | Where-Object { $_.Name -notmatch 'Setup|Uninstall' } | Select-Object -First 1; if ($null -eq $e) { Write-Host 'Unpacked app not found. Use 快速开发.bat or rebuild.'; exit 1 }; Start-Process -FilePath $e.FullName"
if errorlevel 1 pause
