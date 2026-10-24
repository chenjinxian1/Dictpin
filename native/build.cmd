@echo off
setlocal
cd /d "%~dp0"
set "TEMP=%~dp0..\work"
set "TMP=%TEMP%"
"%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /platform:x64 /optimize+ /target:exe /reference:"%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\System.Web.Extensions.dll" /out:"%~dp0local-asr-worker.exe" "%~dp0LocalAsrWorker.cs"
exit /b %errorlevel%
