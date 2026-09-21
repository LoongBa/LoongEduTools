# -*- coding: utf-8 -*-
"""小学英语素材管理系统 — 只读输入路径集中定义（Oracle 评审 R1）

所有外部目录/文件路径集中于此，避免散落在各模块硬编码
（Windows 中文路径 + 全角括号 + 反斜杠，统一 pathlib.Path 处理）。
"""
from __future__ import annotations

from pathlib import Path

# ------------------------------------------------------------------
# 系统自身
# ------------------------------------------------------------------
SYSTEM_ROOT = Path(__file__).resolve().parents[2]          # 小学英语素材管理系统/
INVENTORY_DIR = SYSTEM_ROOT / "inventory"
SCHEMA_DIR = INVENTORY_DIR / "schema"
SCRIPTS_DIR = SYSTEM_ROOT / "scripts"

# 清单产物（SSOT + 派生）
MANIFEST_PATH = INVENTORY_DIR / "manifest.json"
INTEGRITY_PATH = INVENTORY_DIR / "integrity.json"
PRODUCTION_PATH = INVENTORY_DIR / "production.json"
READINESS_PATH = INVENTORY_DIR / "readiness.json"
REPORT_PATH = INVENTORY_DIR / "report.md"

# ------------------------------------------------------------------
# 仓库根（LoongEduTools）
# ------------------------------------------------------------------
REPO_ROOT = SYSTEM_ROOT.parent

# ------------------------------------------------------------------
# 只读输入：教材素材
# ------------------------------------------------------------------
MAT_ROOT = Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）")
MAT_MANIFEST_MD = MAT_ROOT / "素材清单.md"

# ------------------------------------------------------------------
# 只读输入：PEP 词库
# ------------------------------------------------------------------
PEP_CIKU_DIR = REPO_ROOT / "PEP词库"
DIANDU_DIR = PEP_CIKU_DIR / "data" / "diandu"          # book.json（原始 json 不入 git，book_data.zip 分发）
VOCAB_JSON = PEP_CIKU_DIR / "data" / "vocab" / "pep_vocab.json"

# ------------------------------------------------------------------
# 只读输入：重绘工具（RedTools）
# ------------------------------------------------------------------
REDTOOLS_DIR = REPO_ROOT / "RedTools"
REDRAW_DIR = REDTOOLS_DIR / "重绘工具"
REDRAW_TASKS_DIR = REDRAW_DIR / "tasks"                # pep{N}{s|x}_u{MM}/（input/ output/ config.json）
QA_REPORTS_DIR = REDRAW_DIR / "qa_reports"             # <册>.html（内嵌 const DATA={...}）
QA_REVIEWS_JSON = REDRAW_DIR / "qa_reviews.json"       # 当前为空 {}

# ------------------------------------------------------------------
# 只读输入：点读陪练
# ------------------------------------------------------------------
PEIDIAN_DIR = REPO_ROOT / "点读陪练"
PEIDIAN_BUILD_DIR = PEIDIAN_DIR / "build"              # u01/ u02/...（uXX_content_package.json / 07_qa_report.md / print_worksheet_sample.html）
PEIDIAN_SRC_DIR = PEIDIAN_DIR / "src"                  # pipeline.py + 7 步骤脚本

# ------------------------------------------------------------------
# 只读输入：发布/模板（视频产物）
# ------------------------------------------------------------------
PUBLISH_DIR = REDTOOLS_DIR / "publish"                 # publish/<系列>/<工具名>.zip
CAPCUT_TOOL_DIR = REPO_ROOT.parent / "LoongMediaTools" / "CapCutTool"   # 视频模板/产物（仅引用）

# ------------------------------------------------------------------
# 11 册清单（年级, 册次）；六下未出版
# ------------------------------------------------------------------
GRADE_TERMS: list[tuple[str, str]] = [
    ("一年级", "上册"), ("一年级", "下册"),
    ("二年级", "上册"), ("二年级", "下册"),
    ("三年级", "上册"), ("三年级", "下册"),
    ("四年级", "上册"), ("四年级", "下册"),
    ("五年级", "上册"), ("五年级", "下册"),
    ("六年级", "上册"),
]