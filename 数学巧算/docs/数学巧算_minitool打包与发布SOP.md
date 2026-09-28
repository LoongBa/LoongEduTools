# 数学巧算 · minitool 打包与发布 SOP

> 版本：v1.0 ｜ 日期：2026-09-27 ｜ 依据：`RedTools/AGENTS.md` §2/§3/§6 + `.skill/minitool-zip-builder` 打包规范
> 对齐先例：点读陪练 `src/publish_offline.py`（React+Vite 同栈 11 步管线，数学巧算精简为 6 步）
> 发布红线：小红书离线包——**禁排行榜/云存档/多人互动**（见 `docs/教育工具/教育工具产品指导原则.md`）

---

## 一、发布前检查清单

| # | 检查项 | 命令/依据 |
|---|---|---|
| 1 | typecheck 0 错误 | `cd 数学巧算\src && pnpm typecheck` |
| 2 | 引擎单测全绿 | `pnpm test:engine`（31 方法 + 口算 25 知识点 validate 0 失败） |
| 3 | 浏览器冒烟全过 | `pnpm test`（需 CHROMIUM_PATH，file:// 直开 = minitool 形态） |
| 4 | 合规自查 | `grep` 扫描无网络引用/无游戏红线（禁排行榜/晒分）；或用 `RedTools/scripts/compliance_check.py` |
| 5 | 版本号确认 | 本次为较大调整（新功能）→ 次版本号升级；**发布前向用户确认版本**（`RedTools/AGENTS.md` §6） |

---

## 二、打包命令

```powershell
cd 数学巧算\src
python publish_offline.py              # 默认：读 package.json version，发布到 RedTools/publish/学科/
python publish_offline.py -v 0.3.0     # 指定版本号
python publish_offline.py -p D:\temp\publish   # 指定发布目录（测试用）
```

**管线 6 步**（脚本自动执行）：
1. `pnpm build`（离线形态：经典脚本 + Chrome 61 CSS 降级，vite.config 内置）
2. 包体门禁 `check_package()`：index.html 在根 / theme-boot.js 存在 / 单文件 ≤10MB / 相对路径 / 无 type=module / 无 crossorigin / 无 a[download] / assets JS 无动态 download
3. `audit_artifact.py` 审 dist 目录（路径探测：`.skill` 解压目录 → `.skill` zip 解包 fallback）
4. zip 打包 → `RedTools/publish/学科/数学巧算_<版本>_离线版.zip`（index.html 在 zip 根）
5. 自动解压一份（zip 旁同名目录）→ 打开其中 index.html 即测
6. 二次 `audit_artifact.py` 审 zip

---

## 三、产物与发布目录

```
RedTools/publish/学科/
├── 数学巧算_v0.3.0_离线版.zip          # 小红书上传（附 SHA-256）
├── 数学巧算_v0.3.0_离线版/             # 解压测试版（双击 index.html 即测）
└── 发布文案.txt                        # 人工维护（标题/正文/标签），唯一入库项
```

**git 忽略**：zip / 解压测试版 / dist 全部不入库（`.gitignore`）；`发布文案.txt` 入库。

---

## 四、发布文案模板

```
标题：巧算乐学 · 小学数学巧算（口算热身 + 巧算方法课）
正文：
  口算打基础，教程教技巧，练习见实效。
  🌱 一年级到六年级：凑十破十 / 补数凑整 / 分配律 / 小数分数巧算 / 思维进阶
  🏃 口算热身 10 题打底 · 原理先行，讲不出为什么不算学会
  ⏱ 防沉迷：到点提醒「我很自律」成就
  📊 家长报告：阶段掌握度 / 错题 / 近 7 天（可打印）
  对照人教版教材编排，无广告无联网，儿童数据全存本机。
标签：#数学 #口算 #巧算 #小学 #家长
```

---

## 五、发布流程（正式发布）

1. **版本确认**：向用户列出变更摘要，确认版本号（较大调整 → 次版本，如 V0.2.0 → V0.3.0）。
2. **打包**：`python publish_offline.py`（audit PASS + zip ≤10MiB）。
3. **合规自查**：确认无排行榜/云存档/多人互动；无网络引用。
4. **测试**：打开解压测试版 index.html 冒烟（file:// 形态）；真机未实测如实标记。
5. **git**：`git add` 仅本轮文件 → `git diff --cached --name-only` 复核 → commit（粒度 = 一个逻辑变更单元）。
6. **push + tag**：**push 默认免同意，交付即推**（push 前 `git log @{u}..HEAD --oneline` 核查归属，含其它会话 commit 先征得同意）；tag 名 `数学巧算-v0.3.0`，**打 tag 必须另行征求用户同意**（打 tag 前 `git tag | Select-String '数学巧算'` 核对）。
7. **看板回写**：`docs/开发进度看板.md` 数学巧算行更新版本/状态/commit。

---

## 六、风险与边界

| # | 项 | 说明 |
|---|---|---|
| R1 | Chrome 61 / 真机未实测 | 发布文案与看板如实标记，不宣称真机通过 |
| R2 | 体积 | React 产物 ~390KB 主包 + 口算 26KB，远低于 10MiB 硬上限 |
| R3 | 打印（家长报告） | `window.print` + `@media print` 零依赖；Chrome 61 file:// 可用（先例数独思维 v1.23 验证） |
| R4 | skill 脚本路径 | publish_offline.py 内路径探测（解压目录 → .skill zip 解包），缺失报错退出 |
