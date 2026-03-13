# create-structure.ps1
# Запуск из корня проекта KosmosCore:
#   .\create-structure.ps1

$root = $PSScriptRoot
if (-not $root) { $root = Get-Location }

$dirs = @(
    # Data Layer
    "Data/Models",
    "Data/Repositories/Interfaces",
    "Data/Repositories/Implementations",

    # Business Layer
    "Business/Services/Interfaces",
    "Business/Services/Implementations",
    "Business/DTOs/Requests",
    "Business/DTOs/Responses",

    # Presentation (wwwroot уже существует, добавляем textures)
    "wwwroot/textures"
)

foreach ($dir in $dirs) {
    $path = Join-Path $root $dir
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
        Write-Host "[+] $dir" -ForegroundColor Green
    } else {
        Write-Host "[=] $dir (exists)" -ForegroundColor DarkGray
    }
}

Write-Host "`nStructure created successfully." -ForegroundColor Cyan
