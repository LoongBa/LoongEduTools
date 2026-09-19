@echo off
cd /d "%~dp0"
echo ============================================
echo   Hotzone Corrector Service  (auto-load)
echo   Browser will open automatically.
echo   Press Ctrl+C to stop.
echo ============================================
echo.
python hotzone_serve.py
echo.
pause