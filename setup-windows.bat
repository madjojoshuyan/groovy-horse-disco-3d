@echo off
echo ==========================================
echo Groovy Horse Disco 3D - Setup ^& Run
echo ==========================================

:: Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please download and install it from https://nodejs.org/
    pause
    exit /b
)

echo [1/3] Node.js is installed.
echo [2/3] Installing dependencies (this may take a minute)...
call npm install

echo [3/3] Starting the application...
:: Wait 3 seconds then open the browser
start "" "http://localhost:3000"
call npm run dev

pause
