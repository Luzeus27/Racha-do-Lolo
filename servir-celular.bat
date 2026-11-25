@echo off
powershell -NoProfile -Command "$p=[Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent(); if(-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){Start-Process -FilePath '%~f0' -Verb RunAs; exit 9}"
if errorlevel 9 exit /b
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servir-celular.ps1"
pause
