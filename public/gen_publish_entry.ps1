# 教育工具 · 离线发布物测试入口生成器
# 扫描 RedTools/publish/<分类>/*/index.html → 生成 public/测试入口.html
# 用法：每次有新的离线包发布后运行本脚本，重新生成测试入口。
param()
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot   # public/ 的父级 = 仓库根
$publishRoot = Join-Path $repoRoot "RedTools\publish"
$outFile = Join-Path $PSScriptRoot "测试入口.html"

if (-not (Test-Path -LiteralPath $publishRoot)) {
  Write-Error "未找到发布目录：$publishRoot"
}

# 展示名：去掉 _解压测试版/_离线版 后缀；_vX.Y.Z → " vX.Y.Z"；_ → 空格
function Get-DisplayName([string]$dirName) {
  $n = $dirName -replace "_(解压测试版|离线版)$", ""
  $n = $n -replace "_v(\d+\.\d+(\.\d+)?)", " v`$1"
  return ($n -replace "_", " ")
}

# 收集每个分类下含 index.html 的工具目录
$items = @()
foreach ($catDir in Get-ChildItem -LiteralPath $publishRoot -Directory | Sort-Object Name) {
  $cat = $catDir.Name
  foreach ($toolDir in Get-ChildItem -LiteralPath $catDir.FullName -Directory | Sort-Object Name) {
    $idx = Join-Path $toolDir.FullName "index.html"
    if (Test-Path -LiteralPath $idx) {
      $items += [PSCustomObject]@{
        Category = $cat
        Dir      = $toolDir.Name
        Path     = $idx
        Mtime    = $toolDir.LastWriteTime
      }
    }
  }
}

# 最近发布（按目录修改时间取前 5，用于顶部提示）
$recent = $items | Sort-Object Mtime -Descending | Select-Object -First 5

$sb = [System.Text.StringBuilder]::new()
[void]$sb.AppendLine("<!DOCTYPE html>")
[void]$sb.AppendLine('<html lang="zh-CN">')
[void]$sb.AppendLine("<head>")
[void]$sb.AppendLine('  <meta charset="UTF-8">')
[void]$sb.AppendLine('  <meta name="viewport" content="width=device-width, initial-scale=1.0">')
[void]$sb.AppendLine("  <title>教育工具 · 离线发布测试入口</title>")
[void]$sb.AppendLine("  <style>")
[void]$sb.AppendLine("    body { font-family: system-ui, -apple-system, 'Microsoft YaHei', sans-serif; background: #f7f6f2; color: #2d2a26; margin: 0; padding: 24px 16px 48px; }")
[void]$sb.AppendLine("    h1 { font-size: 22px; margin: 0 0 4px; }")
[void]$sb.AppendLine("    .meta { color: #8a857d; font-size: 12px; margin-bottom: 20px; }")
[void]$sb.AppendLine("    .recent { background: #fff6e0; border: 1px solid #f0d9a8; border-radius: 12px; padding: 12px 16px; margin-bottom: 24px; font-size: 13px; }")
[void]$sb.AppendLine("    .recent a { color: #a97a1a; margin-right: 8px; }")
[void]$sb.AppendLine("    .recent b { color: #a97a1a; }")
[void]$sb.AppendLine("    h2 { font-size: 15px; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #e6e1d7; }")
[void]$sb.AppendLine("    ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }")
[void]$sb.AppendLine("    li a { display: block; background: #fff; border: 1px solid #e6e1d7; border-radius: 10px; padding: 10px 12px; color: inherit; text-decoration: none; font-size: 14px; box-shadow: 0 1px 2px rgba(0,0,0,.04); }")
[void]$sb.AppendLine("    li a:hover { border-color: #c9a35a; box-shadow: 0 2px 6px rgba(0,0,0,.08); }")
[void]$sb.AppendLine("    li a .ver { color: #8a857d; font-size: 12px; }")
[void]$sb.AppendLine("    .count { color: #8a857d; font-size: 12px; font-weight: normal; }")
[void]$sb.AppendLine("  </style>")
[void]$sb.AppendLine("</head>")
[void]$sb.AppendLine("<body>")
[void]$sb.AppendLine("  <h1>🧰 教育工具 · 离线发布测试入口</h1>")
[void]$sb.AppendLine("  <p class='meta'>本地离线包统一入口（file:// 双击即测）｜ 生成于 $(Get-Date -Format 'yyyy-MM-dd HH:mm') ｜ 共 $($items.Count) 个工具</p>")

if ($recent.Count -gt 0) {
  $recentHtml = ($recent | ForEach-Object {
    $href = "../RedTools/publish/$($_.Category)/$([Uri]::EscapeDataString($_.Dir))/index.html"
    "<a href='$href'>$(Get-DisplayName $_.Dir)</a>"
  }) -join " · "
  [void]$sb.AppendLine("  <div class='recent'>📌 <b>最近发布</b>：$recentHtml</div>")
}

foreach ($cat in ($items | Select-Object -ExpandProperty Category -Unique | Sort-Object)) {
  $list = $items | Where-Object { $_.Category -eq $cat } | Sort-Object Dir
  [void]$sb.AppendLine("  <h2>$cat <span class='count'>$($list.Count)</span></h2>")
  [void]$sb.AppendLine("  <ul>")
  foreach ($it in $list) {
    $display = Get-DisplayName $it.Dir
    $href = "../RedTools/publish/$cat/$([Uri]::EscapeDataString($it.Dir))/index.html"
    $m = [regex]::Match($display, " v\d+(\.\d+)*$")
    $namePart = if ($m.Success) { $display.Substring(0, $m.Index) } else { $display }
    $verPart = if ($m.Success) { $m.Value } else { "" }
    $nameEsc = [System.Security.SecurityElement]::Escape($namePart)
    $verEsc = [System.Security.SecurityElement]::Escape($verPart)
    [void]$sb.AppendLine("    <li><a href='$href'>$nameEsc<span class='ver'>$verEsc</span></a></li>")
  }
  [void]$sb.AppendLine("  </ul>")
}

[void]$sb.AppendLine("  <p class='meta' style='margin-top:28px'>提示：<code>RedTools/publish/</code> 为 git 忽略目录（zip/解压测试版不入库），本入口 html 与生成脚本入库。新增发布后运行 <code>public/gen_publish_entry.ps1</code> 重新生成。</p>")
[void]$sb.AppendLine("</body>")
[void]$sb.AppendLine("</html>")

[System.IO.File]::WriteAllText($outFile, $sb.ToString(), [System.Text.UTF8Encoding]::new($false))
Write-Host "已生成：$outFile"
