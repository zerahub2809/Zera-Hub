@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)
if not exist .env (
  copy /Y .env.example .env >nul
  echo.
  echo Created .env from .env.example.
  echo IMPORTANT: open .env and set JWT_SECRET and ADMIN_PASSWORD before using admin features.
  echo OPENAI_API_KEY is optional until you want live ZERA AI responses.
  echo.
)
start "ZERA HUB API" cmd /k "npm run server"
timeout /t 2 /nobreak >nul
start "ZERA HUB Frontend" cmd /k "npm run dev"
timeout /t 2 /nobreak >nul
start "ZERA HUB" http://localhost:5173
endlocal
