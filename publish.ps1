param(
  [string]$ProjectName = "twf-web"
)

$ErrorActionPreference = "Stop"

$syncScript = Join-Path $PSScriptRoot "sync-note.ps1"
if (Test-Path (Join-Path $PSScriptRoot "..\The Walten Files*")) {
  & $syncScript
}

npx --yes wrangler pages deploy $PSScriptRoot --project-name $ProjectName --branch main
