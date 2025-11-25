# PowerShell script to start MongoDB via Docker Compose
# Usage: .\run-mongo.ps1

Write-Host "Starting MongoDB in Docker..." -ForegroundColor Green

# Check if docker is installed
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Docker is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Please install Docker Desktop from https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

# Navigate to project root
$projectRoot = Split-Path -Parent $PSCommandPath
Set-Location $projectRoot

# Start MongoDB using docker-compose
Write-Host "Running: docker-compose up -d" -ForegroundColor Cyan
docker-compose up -d

# Wait a moment for the container to be ready
Start-Sleep -Seconds 3

# Check if container is running
$containerStatus = docker-compose ps --services --filter "status=running" | Select-String "mongodb"
if ($containerStatus) {
    Write-Host "✓ MongoDB is running on localhost:27017" -ForegroundColor Green
    Write-Host "Container: stock-dashboard-mongo" -ForegroundColor Green
    Write-Host "`nTo stop MongoDB, run: docker-compose down" -ForegroundColor Yellow
    Write-Host "To view logs, run: docker-compose logs -f mongodb" -ForegroundColor Yellow
}
else {
    Write-Host "✗ Failed to start MongoDB. Check logs:" -ForegroundColor Red
    docker-compose logs mongodb
    exit 1
}
