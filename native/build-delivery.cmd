@echo off
setlocal
cd /d "%~dp0"
set "DELIVERY_FRAMEWORK=%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319"
if not exist "%DELIVERY_FRAMEWORK%\WPF\UIAutomationClient.dll" exit /b 2
if not exist "%~dp0..\work\delivery-build" mkdir "%~dp0..\work\delivery-build"
set "TEMP=%~dp0..\work\delivery-build"
set "TMP=%TEMP%"
rem Separate candidate only; never overwrite the ASR worker or shared resources.
"%DELIVERY_FRAMEWORK%\csc.exe" /nologo /platform:x64 /optimize+ /target:exe /reference:"%DELIVERY_FRAMEWORK%\System.Web.Extensions.dll" /reference:"%DELIVERY_FRAMEWORK%\System.Windows.Forms.dll" /reference:"%DELIVERY_FRAMEWORK%\WPF\UIAutomationClient.dll" /reference:"%DELIVERY_FRAMEWORK%\WPF\UIAutomationTypes.dll" /reference:"%DELIVERY_FRAMEWORK%\WPF\WindowsBase.dll" /out:"%~dp0dictpin-delivery.exe" "%~dp0WindowsDelivery.cs"
exit /b %errorlevel%
