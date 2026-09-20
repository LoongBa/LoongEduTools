#!/usr/bin/env python3
"""批量生图核心引擎 — 通用并发调度 + 状态管理 + 断点续跑"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from key_manager import KeyManager, get_manager
from providers import get_provider
from providers.base import (
    Job, JobResult, QuotaExhaustedError, RetryableError, FatalError,
)

ROOT = Path(__file__).parent
TASKS_DIR = ROOT / "tasks"

# 所有 Key 冷却时最大等待秒数（默认 10 分钟）
MAX_KEY_WAIT = 600


def log(msg: str) -> None:
    print(msg, flush=True)


_done_lock = threading.Lock()


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


def parse_pages(s: str) -> list[int]:
    """解析页码字符串，支持逗号分隔和范围（如 '2,4,6-10,15'）"""
    pages = []
    for part in s.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            pages.extend(range(int(a), int(b) + 1))
        else:
            pages.append(int(part))
    return sorted(set(pages))


@dataclass
class TaskConfig:
    """任务配置"""
    task_name: str
    provider: str
    model: str = ""
    size: str = "auto"
    concurrency: str = "auto"
    max_retries: int = 3
    max_key_switches: int = 10
    retry_backoff: float = 5.0
    cycle_seconds: int = 18000

    @classmethod
    def from_dict(cls, d: dict) -> TaskConfig:
        return cls(
            task_name=d.get("task_name", ""),
            provider=d.get("provider", "sensenova"),
            model=d.get("model", ""),
            size=d.get("size", "auto"),
            concurrency=d.get("concurrency", "auto"),
            max_retries=d.get("retry", {}).get("max_attempts", 3),
            max_key_switches=d.get("retry", {}).get("max_key_switches", 10),
            retry_backoff=d.get("retry", {}).get("backoff_seconds", 5.0),
            cycle_seconds=d.get("cycle_seconds", 18000),
        )


@dataclass
class TaskState:
    """任务运行时状态"""
    total: int = 0
    done: int = 0
    success: int = 0
    failed: int = 0
    skipped: int = 0
    start_time: float = 0
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def update(self, success: bool = True, skipped: bool = False) -> None:
        with self._lock:
            self.done += 1
            if skipped:
                self.skipped += 1
            elif success:
                self.success += 1
            else:
                self.failed += 1

    def elapsed_str(self) -> str:
        elapsed = time.time() - self.start_time
        m, s = divmod(int(elapsed), 60)
        return f"{m:02d}:{s:02d}"


def load_task_config(task_dir: Path) -> TaskConfig:
    cfg_path = task_dir / "config.json"
    if not cfg_path.exists():
        log(f"❌ 缺少配置文件: {cfg_path}")
        sys.exit(1)
    with open(cfg_path, "r", encoding="utf-8") as f:
        return TaskConfig.from_dict(json.load(f))


def load_jobs(task_dir: Path, resume: bool = False) -> list[dict]:
    jobs_path = task_dir / "jobs.json"
    if not jobs_path.exists():
        log(f"❌ 缺少任务清单: {jobs_path}")
        sys.exit(1)
    with open(jobs_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    jobs = data if isinstance(data, list) else data.get("jobs", [])

    if resume:
        done_ids = load_done_ids(task_dir)
        jobs = [j for j in jobs if j.get("id") not in done_ids]
        log(f"📋 断点续跑: 跳过 {len(done_ids)} 已完成, 剩余 {len(jobs)} 项")

    return jobs


def load_done_ids(task_dir: Path) -> set:
    done_path = task_dir / "done.json"
    if done_path.exists():
        with open(done_path, "r", encoding="utf-8") as f:
            return set(json.load(f))
    return set()


def save_done_id(task_dir: Path, job_id: str) -> None:
    done_path = task_dir / "done.json"
    with _done_lock:
        done_ids = load_done_ids(task_dir)
        done_ids.add(job_id)
        _atomic_write_json(done_path, sorted(done_ids))


def resolve_concurrency(cfg: TaskConfig, km: KeyManager) -> int:
    if cfg.concurrency != "auto":
        return int(cfg.concurrency)
    # get_status 内部已有锁保护
    status = km.get_status(cfg.provider)
    prov_status = status.get(cfg.provider, {})
    available = sum(1 for k in prov_status.get("keys", []) if not k.get("exhausted"))
    # 全冷却时至少 1 个线程等待 Key 恢复（见 MAX_KEY_WAIT 逻辑）
    return max(1, available)


def run_single_job(
    job: dict, cfg: TaskConfig, km: KeyManager, state: TaskState, task_dir: Path,
    force: bool = False,
) -> None:
    job_id = job.get("id", "unknown")
    out_path = task_dir / job.get("output_path", f"output/{job_id}.png")
    # 任务级 force 覆盖 job 级 force
    job_force = force or job.get("force", False)

    if out_path.exists() and not job_force:
        log(f"⏭ [{job_id}] 已存在，跳过")
        state.update(success=True, skipped=True)
        return

    input_path = task_dir / job.get("input_image", "")
    prompt = job.get("prompt", "")

    provider = get_provider(cfg.provider)
    job_obj = Job(
        id=job_id,
        prompt=prompt,
        input_image=input_path if input_path.exists() else None,
        output_path=out_path,
        params={**job.get("params", {}), "model": cfg.model, "size": cfg.size},
    )

    retries = 0
    key_switches = 0
    while retries < cfg.max_retries and key_switches < cfg.max_key_switches:
        api_key = km.get_next_key(cfg.provider)
        if not api_key:
            # 所有 Key 冷却中，等待最近一个恢复
            wait_secs = km.earliest_recovery(cfg.provider)
            if wait_secs and wait_secs <= MAX_KEY_WAIT:
                log(f"⏸ [{job_id}] 所有 Key 冷却中，等待 {int(wait_secs)}s")
                time.sleep(wait_secs + 1)
                continue
            log(f"❌ [{job_id}] 无可用 Key 且等待超时")
            state.update(success=False)
            return

        attempt = retries + key_switches + 1
        try:
            log(f"🖼 [{job_id}] 尝试 #{attempt}  retries={retries}  key_switches={key_switches}")
            result = provider.generate(job_obj, api_key)
            if result.success:
                log(f"✅ [{job_id}] 完成")
                save_done_id(task_dir, job_id)
                state.update(success=True)
                return
            else:
                log(f"⚠️ [{job_id}] {result.error}")
                # Provider 返回失败（非异常），按可重试处理
                retries += 1
                time.sleep(cfg.retry_backoff * (2 ** min(retries - 1, 4)))
        except QuotaExhaustedError as e:
            log(f"⚠️ [{job_id}] 额度用完: {e}")
            km.mark_exhausted(cfg.provider, api_key)
            key_switches += 1  # 额度耗尽换 Key 不消耗重试预算
            continue
        except RetryableError as e:
            log(f"⚠️ [{job_id}] 可重试错误: {e}")
            retries += 1
            time.sleep(cfg.retry_backoff * (2 ** min(retries - 1, 4)))
        except FatalError as e:
            log(f"❌ [{job_id}] 不可重试错误: {e}")
            state.update(success=False)
            return
        except Exception as e:
            log(f"❌ [{job_id}] 异常: {e}")
            state.update(success=False)
            return

    log(f"❌ [{job_id}] 重试耗尽 (retries={retries}, key_switches={key_switches})")
    state.update(success=False)


def execute_task(
    task_dir: Path,
    resume: bool = False,
    force: bool = False,
    concurrency: Optional[int] = None,
) -> None:
    cfg = load_task_config(task_dir)
    jobs = load_jobs(task_dir, resume=resume)

    if not jobs:
        log("✅ 无待处理任务")
        return

    km = get_manager()

    # 加载公共 keys 配置
    keys_file = task_dir / "keys.json"
    if not keys_file.exists():
        keys_file = ROOT / "keys.json"
    if keys_file.exists():
        with open(keys_file, "r", encoding="utf-8") as f:
            keys_cfg = json.load(f)
        for prov_name, prov_keys in keys_cfg.items():
            if isinstance(prov_keys, list):
                km.register_provider(prov_name, prov_keys, cfg.cycle_seconds)
            elif isinstance(prov_keys, dict):
                km.register_provider(
                    prov_name, prov_keys.get("keys", []),
                    prov_keys.get("cycle_seconds", cfg.cycle_seconds),
                )

    if concurrency:
        max_workers = concurrency
    else:
        max_workers = resolve_concurrency(cfg, km)

    state = TaskState(total=len(jobs), start_time=time.time())
    log(f"🚀 任务 [{cfg.task_name}]  provider={cfg.provider}  共 {len(jobs)} 项  并发={max_workers}")

    if force:
        done_path = task_dir / "done.json"
        if done_path.exists():
            done_path.unlink()

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(run_single_job, job, cfg, km, state, task_dir, force): job
            for job in jobs
        }
        for future in as_completed(futures):
            try:
                future.result()
            except Exception as e:
                log(f"❌ 线程异常: {e}")

    log(f"\n{'='*56}")
    log(f"📊 完成: {state.success}/{state.total} 成功 | {state.failed} 失败 | {state.skipped} 跳过")
    log(f"⏱ 耗时: {state.elapsed_str()}")


def list_tasks() -> None:
    if not TASKS_DIR.exists():
        log("（无任务目录）")
        return
    for task_dir in sorted(TASKS_DIR.iterdir()):
        if not task_dir.is_dir():
            continue
        cfg_path = task_dir / "config.json"
        jobs_path = task_dir / "jobs.json"
        if not cfg_path.exists():
            continue
        cfg = load_task_config(task_dir)
        n_jobs = 0
        if jobs_path.exists():
            with open(jobs_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            n_jobs = len(data) if isinstance(data, list) else len(data.get("jobs", []))
        done = len(load_done_ids(task_dir))
        log(f"📁 {task_dir.name}  provider={cfg.provider}  jobs={n_jobs}  done={done}")
