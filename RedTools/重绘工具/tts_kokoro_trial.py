#!/usr/bin/env python3
"""Kokoro 试合成：与 Edge TTS 试点同 8 句对照（英式 bf_emma/bf_isabella vs 美式 af_nicole/af_heart）
用法: python tts_kokoro_trial.py [--voice bf_emma] [--speed 0.9]
"""
import argparse
import os
import sys
import wave
from pathlib import Path

os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"  # HF 不可达，走国内镜像

OUT_DIR = Path(__file__).resolve().parent / "tts_trial"
OUT_DIR.mkdir(exist_ok=True)

SAMPLE_TEXTS = [
    ("p002_t1_unit",           "Unit 1 Helping at home"),
    ("p002_t2_whadodo",        "What do family do together?"),
    ("p003_t2_howhelp",        "How do these children help at home?"),
    ("p003_t3_howyouhelp",     "How do you help at home?"),
    ("p003_t5_chant_short",    "Can you help? Yes, I can. I can clean my room."),
    ("word_clean",             "clean"),
    ("word_sweep",             "sweep the floor"),
    ("phrase_no_problem",      "No problem!"),
]

# 对照音色：英式（b_）最贴近人教 PEP；美式（a_）对照
VOICE_SETS = [
    ("k_bf_emma", "bf_emma", "b", "英式女声·标准"),
    ("k_bf_isabella", "bf_isabella", "b", "英式女声·友好"),
    ("k_af_nicole", "af_nicole", "a", "美式女声·清晰"),
    ("k_af_heart", "af_heart", "a", "美式女声·温暖"),
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", help="只跑单个音色（如 bf_emma）")
    ap.add_argument("--speed", type=float, default=0.92, help="语速（教材慢读 ~0.9）")
    args = ap.parse_args()

    videos = VOICE_SETS if not args.voice else [v for v in VOICE_SETS if v[1] == args.voice]
    if not videos:
        sys.exit(f"未知音色: {args.voice}，可选: {[v[1] for v in VOICE_SETS]}")

    from kokoro import KPipeline

    for key, voice, lang, note in videos:
        print(f"\n[{key}] {voice} ({note}) speed={args.speed}")
        try:
            pipeline = KPipeline(lang_code=lang, device="cpu")
        except Exception as e:
            print(f"  ❌ pipeline 初始化失败: {str(e)[:200]}")
            continue
        for name, text in SAMPLE_TEXTS:
            out = OUT_DIR / f"{name}__{key}.wav"
            if out.exists() and out.stat().st_size > 1000:
                print(f"  ⏭ {out.name} 已存在")
                continue
            try:
                with wave.open(str(out.resolve()), "wb") as wav_file:
                    wav_file.setnchannels(1)
                    wav_file.setsampwidth(2)
                    wav_file.setframerate(24000)
                    for res in pipeline(text, voice=voice, speed=args.speed):
                        if res.audio is None:
                            continue
                        a = (res.audio.numpy() * 32767).astype("int16").tobytes()
                        wav_file.writeframes(a)
                print(f"  ✅ {out.name} ({out.stat().st_size//1024} KB)")
            except Exception as e:
                print(f"  ❌ {out.name}: {str(e)[:150]}")
    print(f"\n🎧 Kokoro 试听 → {OUT_DIR}")


if __name__ == "__main__":
    main()