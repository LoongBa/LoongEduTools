#!/usr/bin/env python3
"""API Key 轮换管理器 — 多 Provider、多 Key 自动切换"""
from __future__ import annotations

import json
import os
import tempfile
import threading
import time
from pathlib import Path
from typing import Optional

DEFAULT_CYCLE_SECONDS = 5 * 60 * 60
STATE_FILE = Path(__file__).parent / "key_state.json"
_lock = threading.Lock()


def _atomic_write_json(path: Path, data, indent: int = 2) -> None:
    """原子写入 JSON：先写临时文件再 os.replace，防止崩溃导致文件损坏"""
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=indent, ensure_ascii=False)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


class KeyManager:
    """多 Provider Key 管理器"""

    def __init__(self, state_file: Optional[Path] = None):
        self._state_file = state_file or STATE_FILE
        self._state = self._load_state()

    def _load_state(self) -> dict:
        if self._state_file.exists():
            with open(self._state_file, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"providers": {}}

    def _save_state(self) -> None:
        _atomic_write_json(self._state_file, self._state)

    def register_provider(
        self, provider: str, keys: list[str], cycle_seconds: int = DEFAULT_CYCLE_SECONDS,
    ) -> None:
        with _lock:
            if provider not in self._state["providers"]:
                self._state["providers"][provider] = {
                    "keys": {}, "current_index": 0, "cycle_seconds": cycle_seconds,
                }
            prov = self._state["providers"][provider]
            prov["cycle_seconds"] = cycle_seconds
            for key in keys:
                if key not in prov["keys"]:
                    prov["keys"][key] = {"exhausted": False, "started_at": 0, "started_time": ""}
            self._save_state()

    def is_available(self, provider: str, key: str) -> bool:
        with _lock:
            prov = self._state["providers"].get(provider)
            if not prov:
                return True
            info = prov["keys"].get(key)
            if not info or not info.get("exhausted"):
                return True
            elapsed = time.time() - info.get("started_at", 0)
            return elapsed >= prov.get("cycle_seconds", DEFAULT_CYCLE_SECONDS)

    def get_next_key(self, provider: str) -> Optional[str]:
        with _lock:
            prov = self._state["providers"].get(provider)
            if not prov:
                return None
            keys = list(prov["keys"].keys())
            if not keys:
                return None
            start = prov.get("current_index", 0)
            cycle = prov.get("cycle_seconds", DEFAULT_CYCLE_SECONDS)
            now = time.time()
            for i in range(len(keys)):
                idx = (start + i) % len(keys)
                key = keys[idx]
                info = prov["keys"][key]
                if not info.get("exhausted"):
                    # 记录首次使用时刻（仅首次）
                    if info.get("started_at", 0) == 0:
                        info["started_at"] = now
                        info["started_time"] = time.strftime(
                            "%Y-%m-%d %H:%M:%S", time.localtime(now)
                        )
                    prov["current_index"] = (idx + 1) % len(keys)
                    self._save_state()
                    return key
                elapsed = now - info.get("started_at", 0)
                if elapsed >= cycle:
                    prov["keys"][key] = {"exhausted": False, "started_at": 0, "started_time": ""}
                    prov["current_index"] = (idx + 1) % len(keys)
                    self._save_state()
                    return key
            return None

    def earliest_recovery(self, provider: str) -> Optional[float]:
        """返回最近一个 Key 恢复所需的秒数（None 表示无冷却中的 Key）"""
        with _lock:
            prov = self._state["providers"].get(provider)
            if not prov:
                return None
            cycle = prov.get("cycle_seconds", DEFAULT_CYCLE_SECONDS)
            min_remaining = None
            now = time.time()
            for info in prov["keys"].values():
                if info.get("exhausted"):
                    started_at = info.get("started_at", 0)
                    remaining = max(0, cycle - (now - started_at))
                    if min_remaining is None or remaining < min_remaining:
                        min_remaining = remaining
            return min_remaining

    def mark_exhausted(self, provider: str, key: str, start_at: Optional[float] = None) -> None:
        with _lock:
            prov = self._state["providers"].get(provider)
            if not prov or key not in prov["keys"]:
                return
            info = prov["keys"][key]
            # 使用首次使用时刻（started_at），而非当前时刻
            started_at = start_at or info.get("started_at") or time.time()
            prov["keys"][key] = {
                "exhausted": True,
                "started_at": started_at,
                "started_time": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(started_at)),
            }
            self._save_state()

    def get_status(self, provider: Optional[str] = None) -> dict:
        with _lock:
            result = {}
            provs = [provider] if provider else list(self._state["providers"].keys())
            for prov_name in provs:
                prov = self._state["providers"].get(prov_name)
                if not prov:
                    continue
                keys_status = []
                now = time.time()
                for i, (key, info) in enumerate(prov["keys"].items()):
                    started_at = info.get("started_at", 0)
                    exhausted = info.get("exhausted", False)
                    cycle = prov.get("cycle_seconds", DEFAULT_CYCLE_SECONDS)
                    remaining = max(0, cycle - (now - started_at)) if started_at else 0
                    keys_status.append({
                        "label": f"Key{i + 1}",
                        "exhausted": exhausted and remaining > 0,
                        "started_time": info.get("started_time"),
                        "remaining_minutes": int(remaining / 60) if remaining > 0 else 0,
                    })
                result[prov_name] = {
                    "total_keys": len(prov["keys"]),
                    "current_index": prov.get("current_index", 0),
                    "keys": keys_status,
                }
            return result

    def clear_state(self, provider: Optional[str] = None, key_index: Optional[int] = None) -> None:
        with _lock:
            if provider is None:
                self._state["providers"] = {}
            elif key_index is None:
                self._state["providers"].pop(provider, None)
            else:
                prov = self._state["providers"].get(provider)
                if prov:
                    keys = list(prov["keys"].keys())
                    if 0 <= key_index < len(keys):
                        prov["keys"].pop(keys[key_index])
            self._save_state()


_manager: Optional[KeyManager] = None

def get_manager() -> KeyManager:
    global _manager
    if _manager is None:
        _manager = KeyManager()
    return _manager


def register_provider(provider: str, keys: list[str], cycle_seconds: int = DEFAULT_CYCLE_SECONDS) -> None:
    get_manager().register_provider(provider, keys, cycle_seconds)

def get_next_key(provider: str) -> Optional[str]:
    return get_manager().get_next_key(provider)

def mark_exhausted(provider: str, key: str, start_at: Optional[float] = None) -> None:
    get_manager().mark_exhausted(provider, key, start_at)
