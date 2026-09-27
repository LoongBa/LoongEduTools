# verify_cf_pages.ps1 — CF Pages 公网部署验证（教师客户端 · CF 免费档起步）
# 用法：.\verify_cf_pages.ps1 [-BaseUrl https://edu-teacher-test.pages.dev]
# 5 项断言：
#   1) GET /api/edu/packages/manifest  → 200 + packages.Count == 4
#   2) GET /api/edu/toolbox/manifest   → 200 + tools.Count == 7
#   3) GET /shell/config.signed.json   → 200 + signature.key_id == "shell-config-2026"
#   4) GET /packs/pep-reader-u01-1.3.3.zip → 200 + Content-Length ≈ 5089919
#   5) GET /packs/substitute-kit-1.0.0.zip → 200 + Content-Length ≈ 9124

param(
  [string]$BaseUrl = "https://edu-teacher-test.pages.dev"
)

$ErrorActionPreference = "Stop"
$pass = 0; $fail = 0

function Assert-Get([string]$Path, [scriptblock]$Check, [string]$Desc) {
  try {
    $r = Invoke-WebRequest -Uri "$BaseUrl$Path" -TimeoutSec 20 -UseBasicParsing
    if ($r.StatusCode -ne 200) { throw "HTTP $($r.StatusCode)" }
    $ok = & $Check $r
    if ($ok) { $script:pass++; Write-Host "PASS  $Desc" -ForegroundColor Green }
    else { $script:fail++; Write-Host "FAIL  $Desc（状态 200 但内容断言不满足）" -ForegroundColor Red }
  } catch {
    $script:fail++
    Write-Host "FAIL  $Desc : $($_.Exception.Message)" -ForegroundColor Red
  }
}

# JSON 内容断言辅助：Content 可能是 byte[]（octet-stream）或字符串（PS7 直接给字符串），统一转 UTF-8 文本
function Get-Text {
  param([object]$Content)
  if ($Content -is [byte[]]) {
    return [System.Text.Encoding]::UTF8.GetString($Content)
  }
  return [string]$Content
}

Write-Host "=== CF Pages 公网验证：$BaseUrl ===" -ForegroundColor Cyan

# JSON 内容断言用 .json 后缀路径（CF 返回 application/json；无后缀副本主要为壳端请求形态）
Assert-Get "/api/edu/packages/manifest" {
  param($resp)
  # 壳端 store.rs 真实请求形态：GET {base}/api/edu/packages/manifest（无后缀）
  # 内容与 manifest.json 相同（双写副本），此处只断言 200 + 可解析为含 packages 的 JSON
  $j = (Get-Text $resp.Content) | ConvertFrom-Json
  @($j.packages).Count -eq 4
} "manifest（无后缀·壳端真实路径）200 · 4 包"

Assert-Get "/api/edu/toolbox/manifest" {
  param($resp)
  $j = (Get-Text $resp.Content) | ConvertFrom-Json
  @($j.tools).Count -eq 7
} "toolbox（无后缀·壳端真实路径）200 · 7 工具"

Assert-Get "/api/edu/packages/manifest.json" {
  param($resp)
  $j = (Get-Text $resp.Content) | ConvertFrom-Json
  @($j.packages).Count -eq 4
} "manifest.json 200 · 4 包"

Assert-Get "/api/edu/toolbox/manifest.json" {
  param($resp)
  $j = (Get-Text $resp.Content) | ConvertFrom-Json
  @($j.tools).Count -eq 7
} "toolbox.json 200 · 7 工具"

Assert-Get "/shell/config.signed.json" {
  param($resp)
  $j = (Get-Text $resp.Content) | ConvertFrom-Json
  $j.signature.key_id -eq "shell-config-2026" -and $j.signature.alg -eq "ed25519"
} "shell config 签名 key_id=shell-config-2026 + alg=ed25519"

Assert-Get "/packs/pep-reader-u01-1.3.3.zip" {
  param($resp)
  $resp.RawContentLength -eq 5089919
} "pep-reader-u01 zip 200 · 5089919 bytes"

Assert-Get "/packs/substitute-kit-1.0.0.zip" {
  param($resp)
  $resp.RawContentLength -eq 9124
} "substitute-kit zip 200 · 9124 bytes"

Write-Host ""
Write-Host "结果：$pass 通过 / $fail 失败" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
exit $fail
