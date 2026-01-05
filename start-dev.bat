@echo off
setlocal
set "ROOT=%~dp0"

:: Activate Python venv if present
set "CHATBOT_ENV=%ROOT%chatbot_service\.venv"
IF EXIST "%CHATBOT_ENV%" (
  call "%CHATBOT_ENV%\Scripts\activate.bat" >nul 2>&1
)

:: Start chatbot service
IF EXIST "%ROOT%chatbot_service\main.py" (
  echo Starting chatbot service...
  start "Kidz4Fun Chatbot" cmd /K "cd /d %ROOT%chatbot_service && uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
) ELSE (
  echo Chatbot service not found. Skipping.
)

:: Start backend
echo Starting backend server...
start "Playfunia Backend" cmd /K "cd /d %ROOT%backend && npm run dev"

:: Start frontend
echo Starting frontend dev server...
start "Playfunia Frontend" cmd /K "cd /d %ROOT%frontend && npm start"

@echo Both services are launching in separate windows.
@echo Close those windows or press Ctrl+C here when you are done.

