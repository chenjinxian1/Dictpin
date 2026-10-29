@echo off
setlocal
cd /d "%~dp0"
node scripts\dev.cjs --profile=isolated
if errorlevel 1 pause
endlocal
