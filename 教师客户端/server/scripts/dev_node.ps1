# dev_node.ps1 — Node 变体 dev 起服脚本（dev_local.ps1 的 Node 双入口版，不用 wrangler）
# 与 dev_local.ps1 同款用法：
#   .\scripts\dev_node.ps1                 # 默认 8787
#   .\scripts\dev_node.ps1 -Port 9000      # 自定义端口
# 另开终端：
#   node scripts\smoke.mjs --api-key local-dev-pkg-admin-key
# 说明：node stdout/stderr 分别重定向到 $env:TEMP\wrangler_dev.out / .err（与
#   dev_local.ps1 保持一致），smoke.mjs 从这两个文件抓 [SMS_MOCK] 验证码。
param(
  [string]$Port = "8787",
  [string]$PidFile = "$PSScriptRoot\dev_node.pid"
)

$OutputEncoding = [Console]::OutputEncoding = [Console]::InputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

# 0. 确保 .dev.vars（与 dev_local.ps1 同款）
if (-not (Test-Path ".dev.vars")) {
  if (Test-Path ".dev.vars.example") {
    Copy-Item ".dev.vars.example" ".dev.vars"
    Write-Host "[dev_node] created .dev.vars from example"
  }
}

# 1. 端口占用清理（起服前 8787 必须空闲）
Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

# 2. 清旧日志（overwrite，smoke 读这两个文件）
foreach ($p in @("$env:TEMP\wrangler_dev.out", "$env:TEMP\wrangler_dev.err")) {
  if (Test-Path $p) { Remove-Item $p -Force }
}

# 3. 起 node server（npm run dev:node = tsx src/node/main.ts）
# 注：用 cmd /c 包一层——直接 Start-Process npm 时 npm.cmd 会提前退壳，
#     $psi.Id 失活后 server 变孤儿进程，PID 文件与 Wait/Stop 都不可靠。
Write-Host "[dev_node] starting node server on :$Port  (Ctrl+C to stop)"
$env:PORT = $Port

$psi = Start-Process -FilePath "cmd.exe" -ArgumentList @("/d", "/s", "/c", "npm run dev:node") `
  -NoNewWindow -PassThru `
  -RedirectStandardOutput "$env:TEMP\wrangler_dev.out" -RedirectStandardError "$env:TEMP\wrangler_dev.err"

$psi.Id | Set-Content -Path $PidFile -Encoding ascii
Write-Host "[dev_node] pid $($psi.Id) -> $PidFile"

try {
  # 4. 等健康检查（最多 90s）
  $ok = $false
  for ($i = 0; $i -lt 90; $i++) {
    try {
      $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/edu/health" -UseBasicParsing -TimeoutSec 2
      if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch { }
    Start-Sleep -Seconds 1
  }
  if ($ok) {
    Write-Host "[dev_node] health OK → run: node scripts\smoke.mjs --api-key local-dev-pkg-admin-key"
  } else {
    Write-Host "[dev_node] health not ready yet; check $env:TEMP\wrangler_dev.err"
  }

  # 5. 挂住直到进程退出 / Ctrl+C
  Wait-Process -Id $psi.Id
} finally {
  # taskkill /T：连带杀 npm→tsx→node 整条链（Stop-Process 只杀 cmd 壳会留孤儿 server）
  & taskkill /PID $psi.Id /T /F 2>$null | Out-Null
  Stop-Process -Id $psi.Id -Force -ErrorAction SilentlyContinue
  if (Test-Path $PidFile) { Remove-Item $PidFile -Force -ErrorAction SilentlyContinue }
}
