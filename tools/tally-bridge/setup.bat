@echo off
cd /d "%~dp0"
py --version >nul 2>&1
if errorlevel 1 (
  echo Python is not installed on this PC.
  echo Opening the download page. Install Python 3, tick "Add python.exe to PATH" and "py launcher", then run this file again.
  start https://www.python.org/downloads/
  pause
  exit /b 1
)
py -c "import PySide6" >nul 2>&1
if errorlevel 1 (
  echo First start: installing the window toolkit PySide6 ^(about 1 minute, needs internet^)...
  py -m pip install --disable-pip-version-check PySide6-Essentials
  py -c "import PySide6" >nul 2>&1
  if errorlevel 1 (
    echo Could not install PySide6. Opening the simple setup window instead.
    start "" pyw "%~dp0setup_gui.pyw"
    exit /b 0
  )
)
start "" pyw "%~dp0nabiad_bridge_app.pyw"
