# GETTICKET

## What Changed
This version uses a single-file HTML/CSS/JavaScript frontend and a Node.js + SQLite backend.

## One-command Dev Run (Windows)
```powershell
cd D:\CODEX
.\run-dev.ps1
```

This starts:
- Backend: http://localhost:8000
- Frontend: http://localhost:5173

## Frontend (Single File)
Open `frontend/index.html` directly or serve it with any static server.

## Backend (Node.js)
```powershell
cd D:\CODEX\backend-js
npm install
# copy .env.example to .env and fill in values
npm run dev
```

The API runs at http://localhost:8000 by default.

## Admin Access
Set `ADMIN_EMAILS` in `backend-js/.env`, then register/login with that email.

## GitHub Pages
The workflow deploys the static `frontend` folder directly.
