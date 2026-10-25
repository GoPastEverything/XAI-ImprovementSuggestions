@echo off
title TROTT local development
cd /d "%~dp0"
echo Open http://127.0.0.1:5173/?page=trott after the servers start.
call npm.cmd run dev
pause
