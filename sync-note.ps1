$ErrorActionPreference = "Stop"

$parent = Join-Path $PSScriptRoot ".."
$target = Join-Path $PSScriptRoot "note.md"

# Avoid direct Japanese filename literals to reduce encoding-dependent failures.
$source = Get-ChildItem -Path $parent -File -Filter "The Walten Files*.md" |
  Where-Object { $_.Name -notlike "*BunnyFarm*" } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $source) {
  throw "Source note not found in parent directory. Expected a file like 'The Walten Files*.md'."
}

Copy-Item -Path $source.FullName -Destination $target -Force
Write-Host "note.md updated from source: $($source.Name)"
