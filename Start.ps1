$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
Write-Host "Starting Exam Management..."
Write-Host "Open http://localhost:3000 on this computer."
Write-Host "Students must use the LAN URL printed by the server."
npm start
