param(
  [switch]$SkipInstall,
  [switch]$SkipMigration,
  [switch]$DryRunMigration,
  [switch]$StartIfMissing
)

$ErrorActionPreference = 'Stop'

Write-Host '[production] deploy started'
Write-Host '[production] confirm you already validated the same commit in staging'

if (-not (Test-Path 'package.json')) {
  throw 'package.json not found. Please run this script from the project root.'
}

if (-not (Test-Path '.env.production')) {
  throw '.env.production not found. Create it before deploying production.'
}

if (-not $SkipInstall) {
  Write-Host '[production] installing dependencies with npm ci'
  npm ci
}

if (-not $SkipMigration) {
  if ($DryRunMigration) {
    Write-Host '[production] running migration dry run'
    cmd /c "set APP_ENV=production&& node scripts/runMigrations.js --dry-run"
  } else {
    Write-Host '[production] running migrations'
    cmd /c "set APP_ENV=production&& node scripts/runMigrations.js"
  }
}

$pm2ProcessName = 'admin-backend'
$pm2List = pm2 jlist | Out-String

if ($pm2List -match $pm2ProcessName) {
  Write-Host '[production] restarting pm2 process'
  pm2 restart $pm2ProcessName
} elseif ($StartIfMissing) {
  Write-Host '[production] starting pm2 process'
  pm2 start ecosystem.config.js --only $pm2ProcessName
} else {
  Write-Host '[production] pm2 process not found, starting it'
  pm2 start ecosystem.config.js --only $pm2ProcessName
}

Write-Host '[production] deployment completed'
Write-Host '[production] next checks: pm2 status, pm2 logs admin-backend, GET /health'
