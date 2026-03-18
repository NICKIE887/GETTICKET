param(
  [int]$FrontendPort = 5173,
  [int]$BackendPort = 8000
)

$ErrorActionPreference = 'Stop'

function Get-PythonCommand {
  if (Get-Command python -ErrorAction SilentlyContinue) { return 'python' }
  if (Get-Command py -ErrorAction SilentlyContinue) { return 'py' }
  throw 'Python not found on PATH. Install Python or add it to PATH.'
}

$pythonCmd = Get-PythonCommand

Write-Host "Starting backend on http://localhost:$BackendPort"
Start-Process powershell -ArgumentList '-NoExit', "-Command", "cd D:\\CODEX\\backend-js; npm run dev"

Start-Sleep -Seconds 1

Write-Host "Starting frontend on http://localhost:$FrontendPort"
Start-Process powershell -ArgumentList '-NoExit', "-Command", "cd D:\\CODEX\\frontend; $pythonCmd -m http.server $FrontendPort"
