# -*- coding: utf-8 -*-
"""
步骤⑥ schedule 编排脚本
输入：内容包（segments 清单）+ 当前册次单元 + 两周制参数
输出：05_schedule.json（天天见/小阅兵/自助餐，按天分配）
两周制：Week1 上课日1-3 + Week1周末PBL + Week2上课日4-5 + Week2周末小阅兵
"""
import json, sys

# ---- 默认两周制段映射（四上节奏，按册次/年级可调）----
DEFAULT_MAP = {
    "week1_school_days": [
        {"day": 1, "segments": ["S0", "S1"]},
        {"day": 2, "segments": ["S2"]},
        {"day": 3, "segments": ["S3"]},
    ],
    "week1_weekend": {"type": "pbl", "segment": "S5"},
    "week2_school_days": [
        {"day": 4, "segments": ["S4"]},
        {"day": 5, "segments": ["S6", "S7"]},
    ],
    "week2_weekend": {"type": "review", "segments": ["S8"], "print": "worksheet"},
}

def build_schedule(content_pkg: dict, seg_map: dict = None) -> dict:
    seg_map = seg_map or DEFAULT_MAP
    days = []

    # Week1 上课日（天天见）
    for d in seg_map["week1_school_days"]:
        days.append({
            "day": d["day"], "week": 1, "type": "tiantian",
            "review": "旧词闪卡（记忆曲线调度）",
            "new": d["segments"],
            "consolidate": [s + "扩展层" for s in d["segments"]],
            "tutor": True,
        })
    # Week1 周末（PBL）
    days.append({
        "day": "周末1", "week": 1, "type": "pbl_weekend",
        "segment": seg_map["week1_weekend"]["segment"],
        "note": "家长陪做项目，整块时间 30-40 分"
    })
    # Week2 上课日（天天见）
    for d in seg_map["week2_school_days"]:
        days.append({
            "day": d["day"], "week": 2, "type": "tiantian",
            "review": "前几天句型闪卡",
            "new": d["segments"],
            "consolidate": [s + "扩展层" for s in d["segments"]],
            "tutor": True,
        })
    # Week2 周末（小阅兵）
    rw = seg_map["week2_weekend"]
    days.append({
        "day": "周末2", "week": 2, "type": "yuebing_weekend",
        "segments": rw["segments"],
        "print": rw.get("print"),
        "note": "检验站（测）+ 打印小单（练+家长判）"
    })

    return {
        "schema": "schedule@1",
        "unit": content_pkg.get("unit"),
        "weeks": 2,
        "days": days,
        "buffers": [8, 9, 10],
        "buffet": {
            "songs": "单元点唱机（碎片随时）",
            "dictation": "单元听写（每周1-2次）",
            "review_flash": "背单词旧词（每天5分钟记忆曲线）",
        }
    }

if __name__ == '__main__':
    pkg_path = sys.argv[1] if len(sys.argv) > 1 else '04_content_package.json'
    out_path = sys.argv[2] if len(sys.argv) > 2 else '05_schedule.json'
    with open(pkg_path, encoding='utf-8') as f:
        pkg = json.load(f)
    result = build_schedule(pkg)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f'schedule 生成: {len(result["days"])} 天 -> {out_path}')
    for d in result["days"]:
        seg = d.get("segments") or ([d.get("segment")] if d.get("segment") else [])
        print(f"  Day {d['day']} ({d['type']}): {seg}")
