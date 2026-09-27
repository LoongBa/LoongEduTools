# publish_static_site.ps1 — 发布静态分发产物到独立仓库（Git → CF Pages 自动部署）
#
# 发布仓库（loongba-edu-dist）按系列分区：
#   taoli/  → 桃李助手（乐教系列）→ CF Pages 项目 A（输出目录 taoli/）→ taoli.loongba.cn
#   lexue/  → 教育工具集（乐学系列）→ CF Pages 项目 B（输出目录 lexue/）→ lexue.loongba.cn
#
# 流程（幂等，可反复执行）：
#   1) 清理发布仓库对应系列目录（taoli/ 或 lexue/，保留 .git、不碰其它系列）
#   2) 拷贝本仓库生成的 static-site 产物 → 发布仓库对应系列目录
#   3) git add + commit（信息含系列名 + updated_at）+ push（触发 CF Pages 构建）
#
# 前置：
#   - 已 clone 发布仓库到 F:\LoongBa_Git\loongba-edu-dist（gh repo clone loongba-edu-dist）
#   - gh 已登录（本机 LoongBa 账号）
#   - 本仓库产物已生成（python scripts/build_static_site.py --base <域名>）
#
# 用法：
#   .\publish_static_site.ps1 -Series taoli     # 推送桃李系列（默认）
#   .\publish_static_site.ps1 -Series lexue     # 推送乐学系列
#   .\publish_static_site.ps1 -DryRun           # 只拷贝+commit，不 push（预览）

param(
  [ValidateSet("taoli", "lexue")]
  [string]$Series = "taoli",
  [switch]$DryRun,
  [string]$DistRepo = "F:\LoongBa_Git\loongba-edu-dist",
  [string]$SiteDir  = "F:\LoongBa_Git\LoongEduTools\教师客户端\scripts\dist\static-site"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $DistRepo)) { throw "发布仓库不存在: $DistRepo（先 gh repo clone loongba-edu-dist）" }
if (-not (Test-Path $SiteDir))  { throw "产物目录不存在: $SiteDir（先跑 build_static_site.py）" }

$SeriesDir = Join-Path $DistRepo $Series
if (-not (Test-Path $SeriesDir)) { New-Item -ItemType Directory -Path $SeriesDir | Out-Null }

# 1) 清理该系列目录（保留 .git、不碰其它系列）
Get-ChildItem $SeriesDir -Force | ForEach-Object { Remove-Item $_.FullName -Recurse -Force }

# 2) 拷贝产物（保持相对路径结构：api/ packs/ shell/ _headers）
Copy-Item "$SiteDir\*" -Destination $SeriesDir -Recurse -Force

# 3) commit + push
git -C $DistRepo add -A
$updatedAt = ""
$mf = Join-Path $SeriesDir "api\edu\packages\manifest.json"
if (Test-Path $mf) {
  $updatedAt = (Get-Content $mf -Raw | ConvertFrom-Json).updated_at
}
$msg = "chore($Series): 静态分发产物更新 ($updatedAt)"
git -C $DistRepo commit -m $msg | Out-Null
Write-Host "已提交: $msg"

if ($DryRun) {
  Write-Host "[DryRun] 未 push（-DryRun）"
} else {
  git -C $DistRepo push origin main 2>&1 | Select-Object -First 3
  Write-Host "已 push → 触发 CF Pages 构建"
}

# 回显
$last = git -C $DistRepo log --oneline -1
Write-Host "发布仓库: $DistRepo（$last）"
