$ErrorActionPreference = "Stop"

$vercel = Join-Path $env:APPDATA "npm\vercel.cmd"
if (-not (Test-Path $vercel)) {
  throw "Vercel CLI not found at $vercel"
}

& (Join-Path $PSScriptRoot "sync-note.ps1")
& $vercel --prod --yes
