"""
教材歌词跟读处理脚本
流程：
1. 从内容包 JSON 读取 singalong.textbook_lyrics
2. 逐句生成 TTS 音频
3. 生成 textbook_lyrics.json 数据文件
"""
import json
import subprocess
from pathlib import Path

# 配置
ROOT = Path(r"F:\LoongBa_Git\LoongEduTools\点读陪练")
BUILD = ROOT / "build"

# TTS 配置
TTS_VOICE = "en-GB-SoniaNeural"
TTS_RATE = "-15%"


def tts_line(text: str, out_path: Path):
    """生成单句 TTS"""
    cmd = [
        "edge-tts",
        "--voice", TTS_VOICE,
        f"--rate={TTS_RATE}",
        "--text", text,
        "--write-media", str(out_path)
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def process_unit(unit_dir: Path):
    """处理一个单元的教材歌词跟读"""
    print(f"\n=== 处理单元: {unit_dir.name} ===")
    
    # 读内容包 JSON
    pkg_files = list(unit_dir.glob("*content_package.json"))
    if not pkg_files:
        print("  ❌ 找不到内容包 JSON")
        return
    
    pkg_path = pkg_files[0]
    with open(pkg_path, "r", encoding="utf-8") as f:
        pkg = json.load(f)
    
    # 检查有没有 singalong.textbook_lyrics
    if "singalong" not in pkg or "textbook_lyrics" not in pkg["singalong"]:
        print("  ❌ 内容包里没有 textbook_lyrics")
        return
    
    tb = pkg["singalong"]["textbook_lyrics"]
    
    # 输出目录
    song_dir = unit_dir / "assets" / "song"
    tb_dir = song_dir / "textbook"
    tb_dir.mkdir(parents=True, exist_ok=True)
    
    # 逐句生成 TTS
    all_lines = []
    line_idx = 1
    
    for chant in tb["chants"]:
        print(f"  处理 {chant['name']}: {len(chant['lines'])} 句")
        
        for line in chant["lines"]:
            audio_file = f"line_{line_idx:02d}.mp3"
            audio_path = tb_dir / audio_file
            
            print(f"    {line_idx}. {line['en'][:30]}...")
            tts_line(line["en"], audio_path)
            
            all_lines.append({
                "en": line["en"],
                "zh": line["zh"],
                "audio": f"textbook/{audio_file}",
                "chant_id": chant["id"]
            })
            line_idx += 1
    
    # 生成 textbook_lyrics.json
    tb_json = {
        "title": tb["title"],
        "type": "textbook_lyrics",
        "chants": [
            {
                "id": c["id"],
                "name": c["name"],
                "line_count": len(c["lines"])
            }
            for c in tb["chants"]
        ],
        "lines": all_lines
    }
    
    with open(song_dir / "textbook_lyrics.json", "w", encoding="utf-8") as f:
        json.dump(tb_json, f, ensure_ascii=False, indent=2)
    
    print(f"  ✅ 生成 {len(all_lines)} 句 TTS")
    print(f"  ✅ textbook_lyrics.json 已生成")


def main():
    # 找所有单元目录
    units = sorted([d for d in BUILD.iterdir() if d.is_dir() and not d.name.startswith("_")])
    
    print(f"发现 {len(units)} 个单元目录")
    
    for unit_dir in units:
        try:
            process_unit(unit_dir)
        except Exception as e:
            print(f"  ❌ 处理失败: {e}")
            import traceback
            traceback.print_exc()


if __name__ == "__main__":
    main()
