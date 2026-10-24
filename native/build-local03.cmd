@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0..\work\local03-benchmark" mkdir "%~dp0..\work\local03-benchmark"
set "TEMP=%~dp0..\work\local03-benchmark"
set "TMP=%TEMP%"
rem Candidate only. Do not overwrite the reviewed original executable or DLLs.
"%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /platform:x64 /optimize+ /target:exe /reference:"%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\System.Web.Extensions.dll" /out:"%~dp0local-asr-worker-local03.exe" "%~dp0LocalAsrWorker.Local03.cs"
exit /b %errorlevel%
