@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   Pokemon Diary - Push Update to GitHub
echo ============================================
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo [ERROR] git not found in PATH. Install Git for Windows first.
  goto :end
)

set "MSG=%~1"
if "%MSG%"=="" set "MSG=update: site changes"

echo [1/3] Staging all changes...
git add -A
if errorlevel 1 goto :fail

echo [2/3] Committing: %MSG%
git commit -m "%MSG%"

echo [3/3] Pushing to origin main ...
git push origin main
if errorlevel 1 goto :fail

echo.
echo [OK] Pushed. GitHub Pages refreshes in about 1 minute.
goto :end

:fail
echo.
echo [FAILED] See the message above.
echo If it says authentication failed, your GitHub PAT may be expired.
echo Re-generate a token with "repo" scope, then try again.

:end
echo.
pause
