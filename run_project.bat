@echo off
echo ===================================================
echo   Starting Student Management System Full Stack
echo ===================================================

echo Starting Django Backend Server on http://127.0.0.1:8000 ...
start "Django Backend Server" cmd /k ".\Backend\venv\Scripts\python.exe Backend\manage.py runserver 127.0.0.1:8000"

echo Starting Vite React Frontend on http://localhost:5173 ...
start "Vite React Frontend" cmd /k "npm run dev"

echo.
echo Both servers are launching!
echo Backend:  http://127.0.0.1:8000
echo Frontend: http://localhost:5173
echo.
echo Login with default credentials:
echo Username: madam
echo Password: 123456
echo ===================================================
pause
