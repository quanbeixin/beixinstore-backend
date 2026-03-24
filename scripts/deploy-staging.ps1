param(
  [switch]$SkipInstall,
  [switch]$SkipMigration,
  [switch]$DryRunMigration,
  [switch]$StartIfMissing
)

$ErrorActionPreference = 'Stop'

Write-Host '[staging] deploy started'

if (-not (Test-Path 'package.json')) {
  throw 'package.json not found. Please run this script from the project root.'
}

if (-not (Test-Path '.env.staging')) {
  throw '.env.staging not found. Create it before deploying staging.'
}

if (-not $SkipInstall) {
  Write-Host '[staging] installing dependencies with npm ci'
  npm ci
}

if (-not $SkipMigration) {
  if ($DryRunMigration) {
    Write-Host '[staging] running migration dry run'
    cmd /c "set APP_ENV=staging&& node scripts/runMigrations.js --dry-run"
  } else {
    Write-Host '[staging] running migrations'
    cmd /c "set APP_ENV=staging&& node scripts/runMigrations.js"
  }
}

$pm2ProcessName = 'admin-backend-staging'
$pm2List = pm2 jlist | Out-String

if ($pm2List -match $pm2ProcessName) {
  Write-Host '[staging] restarting pm2 process'
  pm2 restart $pm2ProcessName
} elseif ($StartIfMissing) {
  Write-Host '[staging] starting pm2 process'
  pm2 start ecosystem.config.js --only $pm2ProcessName
} else {
  Write-Host '[staging] pm2 process not found, starting it'
  pm2 start ecosystem.config.js --only $pm2ProcessName
}

Write-Host '[staging] deployment completed'
Write-Host '[staging] next checks: pm2 status, pm2 logs admin-backend-staging, GET /health'
