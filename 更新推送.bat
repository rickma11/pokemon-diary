@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   Pokemon Diary - Rebuild and Push
echo ============================================
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo [ERROR] git not found in PATH. Install Git for Windows first.
  goto :end
)

REM Locate Node.js: PATH first, then common install folders.
set "NODEBIN="
for /f "delims=" %%i in ('where node 2^>nul') do if not defined NODEBIN set "NODEBIN=%%i"
if not defined NODEBIN if exist "%ProgramFiles%\nodejs\node.exe" set "NODEBIN=%ProgramFiles%\nodejs\node.exe"
if not defined NODEBIN if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODEBIN=%LOCALAPPDATA%\Programs\nodejs\node.exe"

if defined NODEBIN (
  echo [1/5] Rebuilding index.html from index.src.html ...
  "%NODEBIN%" build.js
  if errorlevel 1 goto :buildfail
) else (
  echo.
  echo [WARNING] Node.js not found - skipping rebuild.
  echo   Pushing the EXISTING index.html. If you just changed js/ or css/,
  echo   install Node.js or ask the AI to run "node build.js" first,
  echo   otherwise the online site will still use old code.
  echo.
)

set "MSG=%~1"
if "%MSG%"=="" set "MSG=update: site changes"

echo [2/5] Staging all changes...
git add -A
if errorlevel 1 goto :fail

git diff --cached --quiet
if errorlevel 1 (
  echo [3/5] Committing: %MSG%
  git commit -m "%MSG%"
  if errorlevel 1 goto :fail
) else (
  echo [3/5] No changes to commit, skipping.
)

REM The app writes account/save files straight into this repo at runtime,
REM so remote main often has extra "sync:" commits. Rebase before pushing.
echo [4/5] Syncing with remote main (runtime save commits) ...
git -c credential.helper= pull --rebase origin main
if errorlevel 1 goto :netfail

echo [5/5] Pushing to origin main ...
git -c credential.helper= push origin main
if errorlevel 1 goto :fail

echo.
echo [OK] Pushed. GitHub Pages refreshes in about 1 minute.
goto :end

:buildfail
echo.
echo [FAILED] build.js could not generate index.html. Nothing was pushed.
echo Ask the AI to check index.src.html / js/ / css/ and run "node build.js".
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
