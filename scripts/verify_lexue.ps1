# verify_lexue.ps1 — lexue（乐学系列）公网部署验证
# 用法：.\verify_lexue.ps1 [-BaseUrl https://lexue.loongba.cn] [-MiniAppCount <N>]
# 断言覆盖（方案 v0.9 §4.2）：
#   1) 系列页 /index.html → 200 + 含产品链接
#   2) peilian/api/manifest（无后缀·前端真实路径）→ 200 + grades 非空
#   3) peilian/api/manifest.json（双写副本）→ 200 + grades 非空
#   4) peilian/api/units/u01（无后缀·前端真实路径）→ 200 + content 非空
#   5) units/u01/audio/<首文件>（站点根·素材 URL）→ 200
#   6) shudu/ → 200 + index.html
#   7) qiaosuan/ → 200 + index.html
#   8) timemanager/ → 200 + index.html（未开工时 404 属预期，可 -SkipTimemanager）
#   9) MiniApp/数学口算/ → 200 + index.html
#  10) 抽查错序资源响应头 immutable、api 响应头 no-cache
#  11) MiniApp 清单抽样（默认抽 3 个，可 -MiniAppSample 调整）

param(
  [string]$BaseUrl = "https://lexue.loongba.cn",
  [int]$MiniAppSample = 3,
  [switch]$SkipTimemanager,
  [switch]$SkipHeaderCheck,  # 本地 http.server 无 CF _headers 注入 → 跳过缓存头断言
  [string[]]$MiniAppList   # 传参：-MiniAppList 数学口算,24点 → 精确验证这批
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

function Get-Text { param([object]$Content)
  if ($Content -is [byte[]]) { return [System.Text.Encoding]::UTF8.GetString($Content) }
  return [string]$Content
}

Write-Host "=== lexue 公网验证：$BaseUrl ===" -ForegroundColor Cyan

# 1) 系列页
Assert-Get "/index.html" {
  param($resp)
  (Get-Text $resp.Content) -match "乐学系列"
} "系列页 index.html 200 · 含「乐学系列」"

# 2) peilian 在线内容（无后缀 + 双写）
Assert-Get "/peilian/api/manifest" {
  param($resp)
  $j = (Get-Text $resp.Content) | ConvertFrom-Json
  @($j.grades).Count -gt 0 -and (@($j.grades | ForEach-Object { @($_.units).Count }) | Measure-Object -Sum).Sum -gt 0
} "peilian/api/manifest（无后缀·前端真实路径）200 · grades>0"

Assert-Get "/peilian/api/manifest.json" {
  param($resp)
  $j = (Get-Text $resp.Content) | ConvertFrom-Json
  @($j.grades).Count -gt 0
} "peilian/api/manifest.json（双写副本）200 · grades>0"

Assert-Get "/peilian/api/units/u01" {
  param($resp)
  $j = (Get-Text $resp.Content) | ConvertFrom-Json
  $null -ne $j.content
} "peilian/api/units/u01（无后缀·前端真实路径）200 · content 非空"

Assert-Get "/peilian/api/units/u01.json" {
  param($resp)
  $j = (Get-Text $resp.Content) | ConvertFrom-Json
  $null -ne $j.content
} "peilian/api/units/u01.json（双写副本）200 · content 非空"

# 5) 素材（站点根 units/，取真实首文件：从 manifest/units JSON 读 audio 字段）
try {
  $unit = Invoke-WebRequest -Uri "$BaseUrl/peilian/api/units/u01" -TimeoutSec 20 -UseBasicParsing
  $unitJson = (Get-Text $unit.Content) | ConvertFrom-Json
  # 递归找第一个 audio 字段（绝对 URL 或相对）
  $sampleAudio = $null
  function Find-Audio($obj) {
    if ($sampleAudio) { return }
    if ($obj -is [System.Management.Automation.PSCustomObject] -or $obj -is [hashtable]) {
      foreach ($p in $obj.PSObject.Properties) {
        if ($p.Name -eq "audio" -and $p.Value -is [string] -and $p.Value -match "^(https?:)?/.*") { $script:sampleAudio = $p.Value; return }
        if ($p.Value -is [System.Management.Automation.PSCustomObject]) { Find-Audio $p.Value }
        elseif ($p.Value -is [array]) { foreach ($e in $p.Value) { if ($e -is [System.Management.Automation.PSCustomObject]) { Find-Audio $e } } }
      }
    }
  }
  Find-Audio $unitJson
  if ($sampleAudio) {
    $audioPath = if ($sampleAudio -match "^https?://") { ([uri]$sampleAudio).AbsolutePath } else { $sampleAudio }
    Assert-Get $audioPath {
      param($resp) $resp.RawContentLength -gt 0
    } "素材 $audioPath 200（站点根 units/ 直引）"
  } else {
    Write-Host "SKIP  素材断言（u01 未找到 audio 字段，可能无音频单元）" -ForegroundColor Yellow
  }
} catch {
  Write-Host "SKIP  素材断言（拉取 u01 单元失败: $($_.Exception.Message)）" -ForegroundColor Yellow
}

# 6) 主力入口
Assert-Get "/shudu/" {
  param($resp) (Get-Text $resp.Content) -match "html"
} "shudu/ 200 + html"
Assert-Get "/qiaosuan/" {
  param($resp) (Get-Text $resp.Content) -match "html"
} "qiaosuan/ 200 + html"
if (-not $SkipTimemanager) {
  Assert-Get "/timemanager/" {
    param($resp) (Get-Text $resp.Content) -match "html"
  } "timemanager/ 200 + html（如 404 属预期：未开工，加 -SkipTimemanager 跳过）"
}

# 9) MiniApp 抽样
if ($MiniAppList) { $samples = $MiniAppList } else {
  # 本地产物清单：scripts/dist/lexue-site/MiniApp（build_lexue_site.py 默认输出）
  $miniDirs = @(Get-ChildItem (Join-Path $PSScriptRoot "dist\lexue-site\MiniApp") -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
  if ($miniDirs.Count -eq 0) {
    Write-Host "WARN  无本地 MiniApp 清单（未构建产物），跳过 MiniApp 抽样（可 -MiniAppList 指定）" -ForegroundColor Yellow
    $samples = @()
  } else {
    $samples = $miniDirs | Select-Object -First $MiniAppSample
  }
}
foreach ($t in $samples) {
  $esc = [uri]::EscapeDataString($t)
  Assert-Get "/MiniApp/$esc/" {
    param($resp) (Get-Text $resp.Content) -match "html"
  } "MiniApp/$t/ 200 + html"
}

# 10) 缓存头抽查（仅公网有效；本地 http.server 无 CF _headers 注入 → -SkipHeaderCheck 跳过）
if ($SkipHeaderCheck) {
  Write-Host "SKIP  缓存头断言（-SkipHeaderCheck：本地环境无 CF _headers 注入）" -ForegroundColor Yellow
} else {
Assert-Get "/peilian/api/manifest" {
  param($resp)
  $cc = $resp.Headers["Cache-Control"]
  $cc -match "no-cache"
} "peilian/api/manifest 响应头 no-cache"
$miniFirst = if ($samples.Count -gt 0) { "/MiniApp/$([uri]::EscapeDataString($samples[0]))/assets/" } else { $null }
if ($miniFirst) {
  $miniIdx = Invoke-WebRequest -Uri "$BaseUrl$miniFirst" -TimeoutSec 20 -UseBasicParsing -ErrorAction SilentlyContinue
  if ($miniIdx -and $miniIdx.StatusCode -eq 200) {
    $assetsFiles = @(($miniIdx.Content -split '"') | Where-Object { $_ -match "\.(js|css)$" } | Select-Object -First 1)
    if ($assetsFiles.Count -gt 0) {
      $af = "/MiniApp/$([uri]::EscapeDataString($samples[0]))/assets/$($assetsFiles[0].TrimStart('/'))"
      Assert-Get $af {
        param($resp)
        $cc = $resp.Headers["Cache-Control"]
        $cc -match "immutable"
      } "$af 响应头 immutable"
    } else { Write-Host "SKIP  资源 immutable 断言（未在首页找到 js/css 引用）" -ForegroundColor Yellow }
  } else { Write-Host "SKIP  资源 immutable 断言（MiniApp 首页不可达）" -ForegroundColor Yellow }
} else { Write-Host "SKIP  资源 immutable 断言（无抽样样本）" -ForegroundColor Yellow }
}

Write-Host ""
Write-Host "结果：$pass 通过 / $fail 失败" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
exit $fail