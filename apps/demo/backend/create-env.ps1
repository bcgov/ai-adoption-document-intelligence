# PowerShell script to create .env file with proper UTF-8 encoding (no BOM)
# Run this script to create the .env file from env.example

if (Test-Path .env) {
    Write-Host ".env file already exists. Backing up to .env.backup..." -ForegroundColor Yellow
    Copy-Item .env .env.backup
    Remove-Item .env
}

Write-Host "Creating .env file from env.example..." -ForegroundColor Green
Get-Content env.example | Out-File -FilePath .env -Encoding utf8NoBOM

Write-Host ".env file created successfully!" -ForegroundColor Green
Write-Host "You can now edit .env with your configuration if needed." -ForegroundColor Cyan

