#!/usr/bin/env python3
"""API Key 轮换管理器 — SenseNova API 多 Key 自动切换

功能：
- 5 个 Key 轮流使用（一张图换一个）
- 只有【手动标记额度用完】的 Key 才跳过
- 用完 Key 的重新激活时间 = 额度周期起点(started_at) + 5h（不是用完时刻 + 5h）
- 周期到点自动清除记录 = 满额重新激活
"""
import json
import time
from pathlib import Path
from typing import Optional

# 优先从公共配置（LoongMediaTools/批量生图工具/keys.json，已随工具迁移）读取
# sensenova keys；未配置时返回 None（回退内置列表，保持向后兼容）。
def _load_shared_keys() -> Optional[list[str]]:
    shared = Path(r"F:\LoongBa_Git\LoongMediaTools\批量生图工具\keys.json")
    try:
        if shared.exists():
            with open(shared, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            sense = cfg.get("sensenova", {})
            keys = sense.get("keys", []) if isinstance(sense, dict) else []
            non_empty = [k for k in keys if isinstance(k, str) and k]
            if non_empty:
                return non_empty
    except Exception:
        pass
    return None


# Key 配置：公共配置优先（改 key 只改 批量生图工具/keys.json，本工具自动生效）
_LEGACY_API_KEYS = [
    "sk-WHa8ZsjfhrTY993oL7bX8uPkapw2uHqM",
    "sk-XK2Dv1J5maGErB9TkC3HidYrMecGlPtu",
    "sk-Up8cRpMrp7nwpWzqqhb3oHSphU2f4TLq",
    "sk-vtQg6mrsmK2IeZ3PzvM1u9kOBwsVN3ps",
    "sk-gelIwYSoPYwOgD4M1Ot9SLgESnatemfr",
]
API_KEYS = _load_shared_keys() or _LEGACY_API_KEYS

# 状态文件路径
STATE_FILE = Path(__file__).parent / "key_state.json"

# 额度周期（秒）：5 小时 = 18000 秒
CYCLE_SECONDS = 5 * 60 * 60


def load_state() -> dict:
    """加载 Key 状态"""
    if STATE_FILE.exists():
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"keys": {}, "current_index": 0}


def save_state(state: dict) -> None:
    """保存 Key 状态"""
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)


def key_label(key: str) -> str:
    """返回 Key 名称（Key1/Key2/...），不暴露 key 值"""
    try:
        index = API_KEYS.index(key)
        return f"Key{index + 1}"
    except ValueError:
        return "Key?"


def mark_exhausted(key: str, start_at: float | None = None) -> None:
    """标记 Key 额度用完（跳过，started_at + 5h 后自动恢复）。

    周期起点规则：显式传入 start_at > 已有记录 started_at > 当前时刻。
    """
    state = load_state()
    key_info = state["keys"].get(key)
    if start_at is not None:
        started_at = start_at
    elif key_info and key_info.get("started_at"):
        started_at = key_info["started_at"]
    else:
        started_at = time.time()
    state["keys"][key] = {
        "started_at": started_at,
        "started_time": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(started_at)),
        "exhausted": True,
    }
    save_state(state)
    reactivate = time.strftime("%H:%M", time.localtime(started_at + CYCLE_SECONDS))
    print(f"  ⚠️ {key_label(key)} 已标记额度用完，{reactivate} 重新激活")


def is_available(key: str) -> bool:
    """检查 Key 是否可用。仅『标记用完』的 Key 跳过；到点自动恢复并清除记录。"""
    state = load_state()
    key_info = state["keys"].get(key)
    if not key_info:
        return True  # 无记录 = 满额可用

    if not key_info.get("exhausted"):
        return True  # 有记录但未标记用完 = 正常可用

    # 标记用完：检查周期是否到点
    started_at = key_info.get("started_at", 0)
    elapsed = time.time() - started_at

    if elapsed < CYCLE_SECONDS:
        remaining = CYCLE_SECONDS - elapsed
        minutes = int(remaining / 60)
        reactivate = time.strftime("%H:%M", time.localtime(started_at + CYCLE_SECONDS))
        print(f"  ⏳ {key_label(key)} 额度用完，{minutes} 分钟后于 {reactivate} 重新激活")
        return False

    # 周期到点，自动重新激活（清除记录 = 满额）
    print(f"  ✅ {key_label(key)} 额度周期结束，满额重新激活")
    state["keys"].pop(key, None)
    save_state(state)
    return True


def get_next_key() -> Optional[str]:
    """获取下一个可用的 Key（一张图换一个）"""
    state = load_state()
    start_index = state.get("current_index", 0)

    for i in range(len(API_KEYS)):
        index = (start_index + i) % len(API_KEYS)
        key = API_KEYS[index]

        if is_available(key):
            state["current_index"] = (index + 1) % len(API_KEYS)
            save_state(state)
            print(f"  🔑 使用 {key_label(key)}")
            return key

    # 所有 Key 都在额度周期内
    print("  ❌ 所有 Key 都在额度周期内，无法使用")
    return None


def get_current_key() -> Optional[str]:
    """获取当前 Key（不切换）"""
    state = load_state()
    index = state.get("current_index", 0)
    return API_KEYS[index % len(API_KEYS)]


def get_status() -> dict:
    """获取所有 Key 状态"""
    state = load_state()
    status = {
        "total_keys": len(API_KEYS),
        "current_index": state.get("current_index", 0),
        "keys": []
    }

    for i, key in enumerate(API_KEYS):
        key_info = state["keys"].get(key, {})
        started_at = key_info.get("started_at", 0)
        exhausted = bool(key_info.get("exhausted"))
        remaining = max(0, CYCLE_SECONDS - (time.time() - started_at)) if started_at else 0

        status["keys"].append({
            "index": i + 1,
            "label": f"Key{i + 1}",
            "exhausted": exhausted and remaining > 0,
            "started_time": key_info.get("started_time"),
            "reactivate_at": time.strftime("%H:%M", time.localtime(started_at + CYCLE_SECONDS)) if started_at else None,
            "cycle_remaining_minutes": int(remaining / 60) if remaining > 0 else 0,
        })

    return status


def print_status():
    """打印 Key 状态"""
    status = get_status()
    print("\n📊 API Key 状态")
    print("=" * 56)
    for k in status["keys"]:
        icon = "⏳" if k["exhausted"] else ("👉" if k["index"] == status["current_index"] else "✅")
        print(f"  {icon} {k['label']}", end="")
        if k["exhausted"]:
            print(f" (额度用完，{k['cycle_remaining_minutes']} 分钟后于 {k['reactivate_at']} 重新激活)")
        else:
            print(" (满额可用)")
    print("=" * 56)


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        cmd = sys.argv[1]

        if cmd == "status":
            print_status()

        elif cmd == "next":
            key = get_next_key()
            if key:
                print(f"  🔑 当前使用 {key_label(key)}（已由 redraw.py 自动轮换，无需手动导出）")
            else:
                print("  ❌ 无可用 Key")

        elif cmd == "exhausted" and len(sys.argv) > 2:
            index = int(sys.argv[2])
            if 1 <= index <= len(API_KEYS):
                key = API_KEYS[index - 1]
                # 可选：指定周期起点（如 exhausted 1 2026-09-19 00:10:00）
                if len(sys.argv) > 3:
                    ts = time.mktime(time.strptime(" ".join(sys.argv[3:]), "%Y-%m-%d %H:%M:%S"))
                    mark_exhausted(key, start_at=ts)
                else:
                    mark_exhausted(key)
            else:
                print(f"  ❌ 无效 Key 索引: {index}")

        elif cmd == "clear" and len(sys.argv) > 2:
            # 清除某个 key 的状态（恢复满额）：clear 2 或 clear all
            state = load_state()
            if sys.argv[2] == "all":
                state["keys"] = {}
                save_state(state)
                print("  ✅ 已清除所有 Key 状态（全部满额）")
            else:
                index = int(sys.argv[2])
                if 1 <= index <= len(API_KEYS):
                    key = API_KEYS[index - 1]
                    state["keys"].pop(key, None)
                    save_state(state)
                    print(f"  ✅ {key_label(key)} 已清除状态（满额可用）")
                else:
                    print(f"  ❌ 无效 Key 索引: {index}")

        else:
            print("用法:")
            print("  python key_manager.py status          # 查看状态")
            print("  python key_manager.py next            # 获取下一个可用 Key")
            print("  python key_manager.py exhausted N     # 标记第 N 个 Key 额度用完")
            print("  python key_manager.py clear N|all     # 清除 Key 状态（恢复满额）")
    else:
        print_status()
