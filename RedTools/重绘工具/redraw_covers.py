#!/usr/bin/env python3
"""补绘每册封面 — 调用 redraw.py 处理"""
import subprocess
import shutil
from pathlib import Path

MAT = Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）")
TASKS_DIR = Path(r"F:\LoongBa_Git\LoongEduTools\RedTools\重绘工具\tasks")
REDRAW_SCRIPT = Path(r"F:\LoongBa_Git\LoongEduTools\RedTools\重绘工具\redraw.py")

# 11 books (六下 not published)
BOOKS = [
    ("一年级", "上册", "1s"),
    ("一年级", "下册", "1x"),
    ("二年级", "上册", "2s"),
    ("二年级", "下册", "2x"),
    ("三年级", "上册", "3s"),
    ("三年级", "下册", "3x"),
    ("四年级", "上册", "4s"),
    ("四年级", "下册", "4x"),
    ("五年级", "上册", "5s"),
    ("五年级", "下册", "5x"),
    ("六年级", "上册", "6s"),
]

# Prompt for cover redraw
COVER_PROMPT = """将这张教材封面图重新绘制为卡通风格，保持原有布局和文字内容不变。
要求：
1. 保持封面的主要元素（标题、插图、出版社等）位置不变
2. 将人物和场景改为可爱的卡通风格
3. 保持文字清晰可读
4. 色彩鲜艳，适合儿童审美
5. 不要添加任何新的元素"""

def main():
    print("🎨 补绘每册封面")
    print("=" * 50)
    
    for grade, vol, code in BOOKS:
        cover_src = MAT / grade / vol / "Cover.png"
        cover_dst_dir = MAT / grade / vol / "_重绘图片素材"
        cover_dst = cover_dst_dir / "Cover.png"
        
        # Check source
        if not cover_src.exists():
            print(f"⏭️  {grade}{vol} — 封面不存在: {cover_src}")
            continue
        
        # Check if already redrawn
        if cover_dst.exists():
            print(f"✅ {grade}{vol} — 封面已存在")
            continue
        
        print(f"\n📖 {grade}{vol} ({code})")
        print(f"   源: {cover_src}")
        print(f"   目标: {cover_dst}")
        
        # Create task directory
        task_name = f"pep{code}_cover"
        task_dir = TASKS_DIR / task_name
        task_dir.mkdir(parents=True, exist_ok=True)
        (task_dir / "input").mkdir(exist_ok=True)
        (task_dir / "output").mkdir(exist_ok=True)
        (task_dir / "prompts").mkdir(exist_ok=True)
        
        # Write config
        config = {
            "model": "sensenova-u1.5-lite",
            "api_base": "https://token.sensenova.cn/v1",
            "size": "auto",
            "watermark": False,
            "prompt_extend": True,
            "response_format": "url",
            "prompt_file": "prompts/redraw.txt",
            "input_dir": "input",
            "output_dir": "output",
            "pages": [0]
        }
        import json
        with open(task_dir / "config.json", "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        
        # Write prompt
        with open(task_dir / "prompts" / "redraw.txt", "w", encoding="utf-8") as f:
            f.write(COVER_PROMPT)
        
        # Copy cover to input
        input_cover = task_dir / "input" / "Cover.png"
        shutil.copy2(cover_src, input_cover)
        print(f"   📁 已复制到 {input_cover}")
        
        # Run redraw
        print(f"   🚀 开始重绘...")
        result = subprocess.run(
            ["python", str(REDRAW_SCRIPT), "--task", task_name, "--all"],
            capture_output=True,
            text=True,
            encoding="utf-8"
        )
        
        if result.returncode == 0:
            # Move output to _重绘图片素材
            output_cover = task_dir / "output" / "Cover.png"
            if output_cover.exists():
                cover_dst_dir.mkdir(exist_ok=True)
                shutil.copy2(output_cover, cover_dst)
                print(f"   ✅ 完成: {cover_dst}")
            else:
                print(f"   ⚠️  输出文件不存在")
        else:
            print(f"   ❌ 失败: {result.stderr[:200]}")
    
    print("\n" + "=" * 50)
    print("📁 检查结果:")
    for grade, vol, code in BOOKS:
        cover_dst = MAT / grade / vol / "_重绘图片素材" / "Cover.png"
        status = "✅" if cover_dst.exists() else "❌"
        print(f"   {status} {grade}{vol}")

if __name__ == "__main__":
    main()
