# publish_lexue.ps1 — 发布乐学系列静态分发产物到独立仓库（Git → CF Pages 自动部署）
#
# 发布仓库（loongba-edu-dist）按系列分区：
#   taoli/   → 乐教系列（教师客户端 + 教材点读内容包）→ CF Pages 项目 A → taoli.loongba.cn
#   lexue/   → 乐学系列（主力应用 + MiniApp 小工具）→ CF Pages 项目 B → lexue.loongba.cn  ← 本脚本
#
# 流程（幂等，可反复执行，全量替换语义）：
#   1) 前置校验：build_lexue_site.py 产物目录存在（缺产物应先在源仓库构建/汇聚）
#   2) 清理发布仓库 lexue/ 目录（保留 .git、不碰 taoli/）
#   3) 拷贝 build_lexue_site.py 产物 → 发布仓库 lexue/
#   4) git add + commit（信息含 updated_at + 产品清单）+ push（触发 CF Pages 构建）
#
# 前置：
#   - 已 clone 发布仓库到 F:\LoongBa_Git\loongba-edu-dist（gh repo clone loongba-edu-dist）
#   - gh 已登录（本机 LoongBa 账号）
#   - 本仓库产物已生成（python scripts/build_lexue_site.py）
#
# 用法：
#   .\publish_lexue.ps1                # 常规发布（汇聚 → commit → push）
#   .\publish_lexue.ps1 -DryRun        # 只拷贝 + commit，不 push（预览）
#   .\publish_lexue.ps1 -SkipBuild     # 跳过 build_lexue_site.py（直接用已有产物目录）

param(
  [switch]$DryRun,
  [switch]$SkipBuild,
  [string]$DistRepo = "F:\LoongBa_Git\loongba-edu-dist",
  [string]$ScriptsDir = "F:\LoongBa_Git\LoongEduTools\scripts"
)

$ErrorActionPreference = "Stop"

# ── 1) 构建产物（build_lexue_site.py）───────────────────────────────────────
$SiteDir = Join-Path $ScriptsDir "dist\lexue-site"
if (-not $SkipBuild) {
  Write-Host "=== 汇聚 lexue 产物（build_lexue_site.py）===" -ForegroundColor Cyan
  python (Join-Path $ScriptsDir "build_lexue_site.py")
  if ($LASTEXITCODE -ne 0) { throw "build_lexue_site.py 失败（exit $LASTEXITCODE）" }
}
if (-not (Test-Path (Join-Path $SiteDir "index.html"))) {
  throw "产物目录不完整: $SiteDir（缺 index.html，先跑 build_lexue_site.py 或确认 --out）"
}
if (-not (Test-Path $DistRepo)) { throw "发布仓库不存在: $DistRepo（先 gh repo clone loongba-edu-dist）" }

# ── 2) 清理 lexue/（保留 .git、不碰 taoli/ 等其它分区）──────────────────────
$SeriesDir = Join-Path $DistRepo "lexue"
if (-not (Test-Path $SeriesDir)) { New-Item -ItemType Directory -Path $SeriesDir | Out-Null }
Get-ChildItem $SeriesDir -Force | ForEach-Object { Remove-Item $_.FullName -Recurse -Force }

# ── 3) 拷贝产物（保持相对路径结构：index.html / peilian/ / shudu/ / qiaosuan/ / timemanager/ / units/ / MiniApp/ / _headers）
Copy-Item "$SiteDir\*" -Destination $SeriesDir -Recurse -Force

# ── 4) commit + push ──────────────────────────────────────────────────────
git -C $DistRepo add -A
$updatedAt = ""
$mf = Join-Path $SeriesDir "peilian\api\manifest.json"
if (Test-Path $mf) {
  $updatedAt = (Get-Content $mf -Raw | ConvertFrom-Json).updated_at
}
$miniCount = @(Get-ChildItem (Join-Path $SeriesDir "MiniApp") -Directory -ErrorAction SilentlyContinue).Count
$msg = "chore(lexue): 乐学系列分发产物更新（$miniCount 款 MiniApp，manifest $updatedAt）"
git -C $DistRepo commit -m $msg | Out-Null
Write-Host "已提交: $msg"

if ($DryRun) {
  Write-Host "[DryRun] 未 push（-DryRun）"
} else {
  git -C $DistRepo push origin main 2>&1 | Select-Object -First 3
  Write-Host "已 push → 触发 CF Pages 构建（lexue.loongba.cn）"
}

$last = git -C $DistRepo log --oneline -1
Write-Host "发布仓库: $DistRepo（$last）"
Write-Host "验证: .\verify_lexue.ps1 -BaseUrl https://lexue.loongba.cn"