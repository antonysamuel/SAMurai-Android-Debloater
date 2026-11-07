@echo off
setlocal enabledelayedexpansion
title SAMurai — Android Debloater

cd /d "%~dp0"

echo.
echo   ==================================================
echo             SAMurai v3.2 - Android Debloater
echo   ==================================================
echo   Platform: Windows
echo.

:: 1. Search for ADB
where adb >nul 2>nul
if %errorlevel% equ 0 (
    echo   [OK] ADB found in PATH
) else (
    set "FOUND_ADB="
    if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" (
        set "FOUND_ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools"
    ) else if exist "C:\Program Files (x86)\Android\android-sdk\platform-tools\adb.exe" (
        set "FOUND_ADB=C:\Program Files (x86)\Android\android-sdk\platform-tools"
    )

    if defined FOUND_ADB (
        set "PATH=!FOUND_ADB!;%PATH%"
        echo   [OK] ADB auto-discovered in: !FOUND_ADB!
    ) else (
        echo   [!] ADB not found!
        echo.
        echo   Please install Android Platform Tools:
        echo   Option 1 (winget): winget install Google.PlatformTools
        echo   Option 2 (manual): https://developer.android.com/tools/releases/platform-tools
        echo.
        pause
        exit /b 1
    )
)

:: 2. Search for Python or uv
set "PY_CMD="

where py >nul 2>nul
if %errorlevel% equ 0 (
    set "PY_CMD=py -3"
) else (
    where python3 >nul 2>nul
    if %errorlevel% equ 0 (
        set "PY_CMD=python3"
    ) else (
        where python >nul 2>nul
        if %errorlevel% equ 0 (
            set "PY_CMD=python"
        ) else (
            where uv >nul 2>nul
            if %errorlevel% equ 0 (
                set "PY_CMD=uv run python"
            )
        )
    )
)

if not defined PY_CMD (
    echo   [!] Neither Python 3 nor uv was found.
    echo.
    echo   Install Python via:
    echo   Option 1 (winget): winget install Python.Python.3.12
    echo   Option 2 (uv):     winget install astral-sh.uv
    echo   Option 3 (manual): https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

echo   [OK] Runtime: !PY_CMD!

:: 3. Start ADB daemon
adb start-server >nul 2>nul
echo   [OK] ADB daemon running

:: 4. Run debloater
echo.
echo   Starting SAMurai web UI at http://127.0.0.1:8080...
echo   Press Ctrl+C to stop.
echo.

!PY_CMD! debloater.py %*
if %errorlevel% neq 0 (
    echo.
    echo   [!] Application exited with an error code: %errorlevel%
    pause
)
