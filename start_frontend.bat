@echo off
title NeuroVault Frontend (Vite)
cd /d "%~dp0neurovault\frontend"
echo ========================================================
echo Starting NeuroVault Frontend on http://localhost:5173...
echo ========================================================
npm run dev
pause
