#!/usr/bin/env python3
"""TTS 引擎选型试点：提取 U1 真实教材句子 → 多音色对照合成（Edge TTS 英式/美式 + 不同 rate）

用法:
  python tts_voice_trial.py                # 合成对照集
  python tts_voice_trial.py --list-voices # 列出可用音色
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path

import edge_tts

MAT = Path(r"F:\_教材素材\人教版（PEP）（主编：吴欣）\四年级\上册\_重绘图片素材")
OUT_DIR = Path(__file__).resolve().parent / "tts_trial"
OUT_DIR.mkdir(exist_ok=True)

# 试听句：覆盖 单词/短句/对话/chant 类型（取自 U1 真实教材）
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

# 对照组合：英式女声（贴近 PEP 英式 RP）+ 美式（社区评测 Jenny 教育首选）
VOICE_SETS = [
    # (voice_key, voice_id, rate, pitch, 说明)
("gb_sonia",      "en-GB-SoniaNeural",      "-15%", "+0Hz",  "英式女声·通用"),
    ("gb_libby",      "en-GB-LibbyNeural",      "-15%", "+0Hz",  "英式女声·友好"),
    ("gb_sonia_20",   "en-GB-SoniaNeural",      "-20%", "+0Hz",  "英式女声·更慢"),
    ("us_jenny",      "en-US-JennyNeural",      "-15%", "+0Hz",  "美式女声·教育首选"),
    ("us_jenny_20",   "en-US-JennyNeural",      "-20%", "+10Hz", "美式女声·慢+高"),
    ("us_aria",       "en-US-AriaNeural",       "-15%", "+0Hz",  "美式女声·新闻腔"),
    ("us_ava",        "en-US-AvaMultilingualNeural", "-15%", "+0Hz", "美式多语女声"),
]


async def synth_one(text: str, out_path: Path, voice: str, rate: str, pitch: str) -> None:
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    await communicate.save(str(out_path))


async def synth_all() -> None:
    for voice_key, voice_id, rate, pitch, note in VOICE_SETS:
        print(f"\n[{voice_key}] {voice_id} ({note}) rate={rate} pitch={pitch}")
        for name, text in SAMPLE_TEXTS:
            out = OUT_DIR / f"{name}__{voice_key}.mp3"
            if out.exists() and out.stat().st_size > 100:
                continue
            await synth_one(text, out, voice_id, rate, pitch)
            print(f"  ✅ {out.name}")
        # 每家 1-2s 节流，防 Edge 风控
        await asyncio.sleep(1.2)
    print(f"\n🎧 全部完成 → {OUT_DIR}")


async def list_voices() -> None:
    voices = await edge_tts.list_voices()
    en = [v for v in voices if v["Locale"].startswith("en-GB") or v["Locale"].startswith("en-US")]
    print("=== en-GB ===")
    for v in en:
        if v["Locale"] == "en-GB":
            print(f"  {v['ShortName']} | {v.get('Gender','?')} | {v.get('VoiceTag',{}).get('VoicePersonalities','')}")
    print("=== en-US ===")
    for v in en:
        if v["Locale"] == "en-US":
            print(f"  {v['ShortName']} | {v.get('Gender','?')} | {v.get('VoiceTag',{}).get('VoicePersonalities','')}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--list-voices", action="store_true")
    ap.add_argument("--only", help="只合成某个 voice_key（如 gb_sonia）")
    args = ap.parse_args()
    if args.list_voices:
        asyncio.run(list_voices())
        return
    asyncio.run(synth_all())


if __name__ == "__main__":
    main()