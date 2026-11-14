@echo off
cd /d "%~dp0"
title NBA model update

rem ---- Find Python (checks every usual install spot) ----
echo Looking for Python...
set PY=
for %%C in (python3.13 python3 python py) do (
  if not defined PY (
    %%C -c "import sys" >nul 2>&1 && set PY=%%C
  )
)
if not defined PY (
  for %%F in ("%LOCALAPPDATA%\Microsoft\WindowsApps\python3.13.exe" "%LOCALAPPDATA%\Microsoft\WindowsApps\python3.exe" "%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe") do (
    if not defined PY if exist %%F (
      %%F -c "import sys" >nul 2>&1 && set PY=%%F
    )
  )
)
if not defined PY (
  for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python3*") do (
    if not defined PY if exist "%%D\python.exe" set PY="%%D\python.exe"
  )
)
if defined PY goto havepython
echo.
echo Couldn't find Python on this PC.
echo If you just installed it from the Microsoft Store, restart your computer and try again.
echo Otherwise, open the Microsoft Store, search "Python 3.13", and click Get.
pause
exit /b
:havepython
echo Found Python: %PY%

rem ---- First run: save your site address and secret ----
if exist board_url.txt goto haveurl
echo.
set /p URL=Paste your site address (like https://nba-board.vercel.app) and press Enter: 
>board_url.txt echo %URL%
:haveurl
if exist model_secret.txt goto havesecret
echo.
set /p SECRET=Paste your MODEL_SECRET from Vercel and press Enter: 
>model_secret.txt echo %SECRET%
:havesecret
set /p BOARD_URL=<board_url.txt
set /p MODEL_SECRET=<model_secret.txt

rem ---- Install packages (fast after the first time) ----
echo.
echo Getting ready. The first run takes a minute or two...
%PY% -m pip install --quiet --disable-pip-version-check nba_api pandas numpy scikit-learn requests
if errorlevel 1 (
  echo Package install failed. Check your internet connection and try again.
  pause
  exit /b
)

rem ---- Train and upload ----
echo.
echo Pulling NBA games and training the model. This takes a few minutes...
echo.
%PY% model\nba_model_v1.py
echo.
echo Done. If you see "Upload: 200" above, refresh your site.
echo To change your site address or secret, delete board_url.txt or model_secret.txt and run this again.
pause
