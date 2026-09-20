#!/usr/bin/env python3
"""列出 Edge TTS 可用男女声音色（en-GB/en-US/en-AU），确认男声选择"""
import asyncio
import edge_tts


async def main():
    vs = await edge_tts.list_voices()
    for loc in ("en-GB", "en-US", "en-AU"):
        print(f"=== {loc} ===")
        for v in vs:
            if v["Locale"] == loc:
                g = v.get("Gender", "?")
                tag = v.get("VoiceTag", {})
                persona = tag.get("VoicePersonalities", "") if tag else ""
                print(f"  {g:6s} {v['ShortName']:35s} {persona}")
        print()


if __name__ == "__main__":
    asyncio.run(main())