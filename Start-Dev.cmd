@echo off
setlocal
cd /d "%~dp0"
node scripts\dev.cjs
if errorlevel 1 pause
endlocal
