# dev_local.ps1 — 本地起 wrangler dev 并捕获 SMS 验证码（D04 §6）
# 用法（在 server/ 目录）：
#   .\scripts\dev_local.ps1
# 另开终端：
#   node scripts\smoke.mjs --api-key local-dev-pkg-admin-key
param(
  [string]$Port = "8787",
  [string]$CodeFile = "$PSScriptRoot\sms_code.txt"
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

# 1. 确保 .dev.vars
if (-not (Test-Path ".dev.vars")) {
  if (Test-Path ".dev.vars.example") {
    Copy-Item ".dev.vars.example" ".dev.vars"
    Write-Host "[dev_local] created .dev.vars from example"
  }
}

# 2. 初始化本地 D1（幂等）
if (Test-Path "migrations/0001_init.sql") {
  npx wrangler d1 execute edu-teacher-db --local --file=migrations/0001_init.sql
}

# 3. 清旧验证码文件
if (Test-Path $CodeFile) { Remove-Item $CodeFile -Force }
$hist = "$CodeFile.history"
if (-not (Test-Path $hist)) { New-Item -ItemType File -Path $hist | Out-Null }

# 4. 起 wrangler dev，边跑边扫 SMS_MOCK 行 → 写 code 文件
Write-Host "[dev_local] starting wrangler dev on :$Port  (Ctrl+C to stop)"
$env:WRANGLER_LOG = "info"

$psi = Start-Process -FilePath "npx" -ArgumentList @("wrangler", "dev", "--port", $Port) `
  -NoNewWindow -PassThru -RedirectStandardOutput "$env:TEMP\wrangler_dev.out" -RedirectStandardError "$env:TEMP\wrangler_dev.err"

# 后台轮询日志抓 [SMS_MOCK] phone => code
$watcher = {
  param($outPath, $errPath, $codeFile, $hist)
  $seen = @{}
  while ($true) {
    foreach ($p in @($outPath, $errPath)) {
      if (Test-Path $p) {
        try {
          $lines = Get-Content $p -ErrorAction Stop
          foreach ($line in $lines) {
            if ($line -match '\[SMS_MOCK\]\s+\d+\s*=>\s*(\d{6})') {
              $code = $Matches[1]
              if (-not $seen.ContainsKey($code)) {
                $seen[$code] = $true
                Set-Content -Path $codeFile -Value $code -NoNewline -Encoding ascii
                Add-Content -Path $hist -Value $code -Encoding ascii
                Write-Host "[dev_local] captured SMS code → $codeFile"
              }
            }
          }
        } catch { }
      }
    }
    Start-Sleep -Milliseconds 400
  }
}

$job = Start-Job -ScriptBlock $watcher -ArgumentList "$env:TEMP\wrangler_dev.out", "$env:TEMP\wrangler_dev.err", $CodeFile, $hist

try {
  # 等健康检查（最多 90s）
  $ok = $false
  for ($i = 0; $i -lt 90; $i++) {
    try {
      $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/edu/health" -UseBasicParsing -TimeoutSec 2
      if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch { }
    Start-Sleep -Seconds 1
  }
  if ($ok) {
    Write-Host "[dev_local] health OK → run: node scripts\smoke.mjs --api-key local-dev-pkg-admin-key"
  } else {
    Write-Host "[dev_local] health not ready yet; check $env:TEMP\wrangler_dev.out"
  }

  # 挂住直到 Ctrl+C
  Wait-Process -Id $psi.Id
} finally {
  Stop-Job $job -ErrorAction SilentlyContinue
  Remove-Job $job -ErrorAction SilentlyContinue
  if (-not $psi.HasExited) { Stop-Process -Id $psi.Id -Force -ErrorAction SilentlyContinue }
}
