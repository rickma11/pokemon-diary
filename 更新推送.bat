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

echo [1/4] Staging all changes...
git add -A
if errorlevel 1 goto :fail

git diff --cached --quiet
if errorlevel 1 (
  echo [2/4] Committing: %MSG%
  git commit -m "%MSG%"
  if errorlevel 1 goto :fail
) else (
  echo [2/4] No changes to commit, skipping.
)

REM The app writes account/save files straight into this repo at runtime,
REM so remote main often has extra "sync:" commits. Rebase before pushing.
echo [3/4] Syncing with remote main (runtime save commits) ...
git -c credential.helper= pull --rebase origin main
if errorlevel 1 goto :netfail

echo [4/4] Pushing to origin main ...
git -c credential.helper= push origin main
if errorlevel 1 goto :fail

echo.
echo [OK] Pushed. GitHub Pages refreshes in about 1 minute.
goto :end

:netfail
echo.
echo [FAILED] Could not sync with remote.
echo The app creates commits in this repo while you use it, so a sync is required first.
echo Check your network / proxy (github.com must be reachable), then run again.
echo If a rebase conflict appears, run: git rebase --abort  and ask for help.
goto :end

:fail
echo.
echo [FAILED] See the message above.
echo If it says authentication failed, your GitHub PAT may be expired.
echo Re-generate a token with "repo" scope, then update the origin URL.

:end
echo.
pause
