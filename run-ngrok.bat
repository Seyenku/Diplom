@echo off
setlocal enabledelayedexpansion
title KosmosCore + ngrok

REM ===================================================================
REM  Quietly starts KosmosCore (no browser, no console window),
REM  waits for port 7242, then runs ngrok https tunnel.
REM  Ctrl+C / closing the window kills dotnet too.
REM ===================================================================

set "PROJ=%~dp0"

REM --- Dependency checks ---
where ngrok >nul 2>&1
if errorlevel 1 (
    echo [error] ngrok not found in PATH. Install from https://ngrok.com/download
    goto :hold
)
where dotnet >nul 2>&1
if errorlevel 1 (
    echo [error] dotnet not found in PATH.
    goto :hold
)

REM --- 1. Start ASP.NET hidden, no browser, https on 7242 ---
REM --no-launch-profile makes dotnet ignore launchSettings.json,
REM so launchBrowser:true does not trigger.
REM Production: dev exception pages must never be exposed through the public tunnel.
set "ASPNETCORE_ENVIRONMENT=Production"
set "ASPNETCORE_URLS=https://localhost:7242"

echo Starting KosmosCore in background ^(https://localhost:7242^) ...

REM Capture the dotnet PID so we kill only OUR instance, not other dev runs.
for /f "delims=" %%P in ('powershell -NoProfile -Command "$p = Start-Process -FilePath 'dotnet' -ArgumentList @('run','--no-launch-profile','--project','%PROJ%KosmosCore.csproj') -WindowStyle Hidden -PassThru; $p.Id"') do set "DOTNET_PID=%%P"

if "%DOTNET_PID%"=="" (
    echo [error] Failed to start dotnet.
    goto :hold
)
echo dotnet PID: %DOTNET_PID%

REM --- 2. Wait for port 7242 (TCP probe, no HTTPS handshake) ---
echo Waiting for port 7242 to become ready ...
set /a WAIT=0
:waitloop
powershell -NoProfile -Command "try { $c=New-Object Net.Sockets.TcpClient; $c.Connect('localhost',7242); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto :ready

tasklist /FI "PID eq %DOTNET_PID%" 2>nul | find "%DOTNET_PID%" >nul
if errorlevel 1 (
    echo [error] dotnet process died - probably a build error.
    echo Run manually for diagnostics: dotnet run --no-launch-profile
    goto :hold
)

set /a WAIT+=1
if %WAIT% GEQ 90 (
    echo [warn] Server did not respond within 90 sec - continuing anyway.
    goto :ready
)
timeout /t 1 /nobreak >nul
goto :waitloop

:ready
echo Server ready.
echo.
echo =================================================
echo   ngrok http https://localhost:7242
echo   Ctrl+C / closing window stops dotnet too.
echo =================================================
echo.

REM --- 3. Run ngrok visibly so the public URL is shown ---
ngrok http https://localhost:7242

REM --- 4. After ngrok exits, kill dotnet (PID tree) ---
echo.
echo Stopping KosmosCore (PID %DOTNET_PID%) ...
taskkill /F /PID %DOTNET_PID% /T >nul 2>&1
echo Done.

:hold
echo.
echo Press any key to close this window.
pause >nul
endlocal
pause