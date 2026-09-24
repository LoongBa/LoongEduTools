"""
补齐"部分完成"单元的缺失图片
"""
import json
import shutil
from pathlib import Path

import sys
sys.path.insert(0, r"F:\LoongBa_Git\LoongMediaTools")
from 批量生图工具 import create_generation_task, execute_task

BUILD_DIR = Path(r"F:\LoongBa_Git\LoongEduTools\点读陪练\build")


def collect_missing_images(units: set[str] | None = None):
    """收集缺失的图片；units 非空时只收集指定单元（scoped 发布用）"""
    missing = []
    
    for pkg_file in sorted(BUILD_DIR.glob("g*/*_content_package.json")):
        unit_dir = pkg_file.parent
        unit_name = unit_dir.name
        if units is not None and unit_name not in units:
            continue
        
        with open(pkg_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        image_dir = unit_dir / "assets" / "images"
        image_dir.mkdir(parents=True, exist_ok=True)
        have = set(f.name for f in image_dir.glob("*.png"))
        
        segments = data.get("segments", [])
        for seg in segments:
            seg_type = seg.get("type")
            
            if seg_type == "map":
                scene = seg.get("scene", {})
                if scene.get("image") and scene.get("image_prompt"):
                    img = scene["image"]
                    if img not in have:
                        missing.append({
                            "id": img.replace(".png", ""),
                            "prompt": scene["image_prompt"],
                            "unit": unit_name,
                            "filename": img,
                        })
                for hs in scene.get("hotspots", []):
                    if hs.get("image") and hs.get("image_prompt"):
                        img = hs["image"]
                        if img not in have:
                            missing.append({
                                "id": img.replace(".png", ""),
                                "prompt": hs["image_prompt"],
                                "unit": unit_name,
                                "filename": img,
                            })
            
            elif seg_type == "vocab":
                for group in seg.get("groups", []):
                    for card in group.get("cards", []):
                        if card.get("image") and card.get("image_prompt"):
                            img = card["image"]
                            if img not in have:
                                missing.append({
                                    "id": img.replace(".png", ""),
                                    "prompt": card["image_prompt"],
                                    "unit": unit_name,
                                    "filename": img,
                                })
            
            elif seg_type == "phonics":
                for lg in seg.get("letter_groups", []):
                    if lg.get("image"):
                        img = lg["image"]
                        if img not in have:
                            pattern = lg.get("pattern", "")
                            prompt = f"自然拼读 {pattern} 发音，扁平卡通，圆角白底图，无文字"
                            missing.append({
                                "id": img.replace(".png", ""),
                                "prompt": prompt,
                                "unit": unit_name,
                                "filename": img,
                            })
            
            elif seg_type == "story":
                for line in seg.get("lines", []):
                    if line.get("image") and line.get("image_prompt"):
                        img = line["image"]
                        if img not in have:
                            missing.append({
                                "id": img.replace(".png", ""),
                                "prompt": line["image_prompt"],
                                "unit": unit_name,
                                "filename": img,
                            })
    
    return missing


def main():
    import argparse
    ap = argparse.ArgumentParser(description='补齐缺失图片（可选 --units 限定单元集，scoped 发布用）')
    ap.add_argument('--units', default='', help='逗号分隔单元目录名；留空=全部单元')
    args = ap.parse_args()

    units = set(u.strip() for u in args.units.split(',') if u.strip()) or None
    missing = collect_missing_images(units)
    print(f"共缺失 {len(missing)} 张图片" + (f"（限定单元: {sorted(units)}）" if units else ""))
    
    if not missing:
        print("✅ 所有图片都齐了")
        return
    
    # 按单元分组打印
    by_unit = {}
    for m in missing:
        by_unit.setdefault(m["unit"], []).append(m)
    
    print("\n按单元分布:")
    for unit, items in sorted(by_unit.items()):
        print(f"  {unit}: {len(items)} 张")
    
    # 跑生图
    print(f"\n🚀 开始批量生图...")
    task_dir = create_generation_task("missing_images_fix", missing, size="1:1")
    result = execute_task(task_dir, resume=True, concurrency=3)
    
    # 复制到各单元目录
    print("\n📤 分发到各单元...")
    output_dir = task_dir / "output"
    copied = 0
    for m in missing:
        src = output_dir / m["filename"]
        if src.exists():
            dst = BUILD_DIR / m["unit"] / "assets" / "images" / m["filename"]
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
            copied += 1
    
    print(f"\n✅ 完成！复制了 {copied} 张图片到各单元")


if __name__ == "__main__":
    main()
