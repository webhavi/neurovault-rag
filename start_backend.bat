@echo off
title NeuroVault Backend (FastAPI)
cd /d "%~dp0neurovault\backend"
echo ========================================================
echo Starting NeuroVault Backend on http://127.0.0.1:8000...
echo ========================================================
if exist ".venv\Scripts\uvicorn.exe" (
    .venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000
) else if exist "..\..\.venv\Scripts\uvicorn.exe" (
    ..\..\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000
) else (
    uvicorn app.main:app --host 127.0.0.1 --port 8000
)
pause
