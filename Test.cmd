@echo off
setlocal
cd /d "%~dp0"
node scripts\test.cjs
pause
endlocal
