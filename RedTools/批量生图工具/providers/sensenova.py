#!/usr/bin/env python3
"""SenseNova Provider — 图像编辑/重绘 API"""
from __future__ import annotations

import base64
import io
from pathlib import Path

import requests

from . import register_provider
from .base import (
    BaseProvider, Job, JobResult,
    QuotaExhaustedError, RetryableError, FatalError,
)

# 额度/限流错误信号
_QUOTA_SIGNALS = (
    "quota", "balance", "insufficient", "limit", "exhausted",
    "额度", "余额", "次数", "限流", "用完",
    "402", "429",
)

# 输入图预处理：长边超过此值则先缩放
MAX_INPUT_EDGE = 1600


def _is_quota_error(text: str) -> bool:
    text_lower = text.lower()
    return any(sig in text_lower for sig in _QUOTA_SIGNALS)


def _guess_mime(path: Path) -> str:
    ext = path.suffix.lower()
    return {
        ".png": "image/png",
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(ext, "image/png")


def _preprocess_image(src: Path, max_edge: int = MAX_INPUT_EDGE) -> tuple[bytes, str]:
    """读取图片，若超尺寸则用 PIL 等比缩放。

    返回 (字节, MIME) — 缩放后统一 JPEG。
    """
    try:
        from PIL import Image, ImageOps
    except ImportError:
        return src.read_bytes(), _guess_mime(src)

    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)
        w, h = im.size
        if max(w, h) <= max_edge:
            return src.read_bytes(), _guess_mime(src)
        scale = max_edge / max(w, h)
        new_size = (max(1, int(w * scale)), max(1, int(h * scale)))
        im = im.convert("RGB")
        im = im.resize(new_size, Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=90)
        return buf.getvalue(), "image/jpeg"


@register_provider
class SenseNovaProvider(BaseProvider):
    """SenseNova U1.5 Lite 图像编辑 Provider"""

    DEFAULT_API_BASE = "https://token.sensenova.cn/v1"
    EDIT_ENDPOINT = "/images/edits"
    DEFAULT_MODEL = "sensenova-u1.5-lite"

    @property
    def name(self) -> str:
        return "sensenova"

    @property
    def max_concurrency(self) -> int:
        return 5  # 默认 5 key

    def validate_config(self, config: dict) -> list[str]:
        errors = []
        if not config.get("api_keys") and not config.get("env_key"):
            errors.append("必须提供 api_keys 或 env_key")
        return errors

    def generate(self, job: Job, api_key: str) -> JobResult:
        """执行 SenseNova 图像编辑"""
        if not job.input_image or not job.input_image.exists():
            return JobResult(success=False, error=f"输入图不存在: {job.input_image}")

        # 预处理图片
        image_bytes, mime = _preprocess_image(job.input_image)

        # 构建请求
        cfg = job.params
        b64 = base64.b64encode(image_bytes).decode("ascii")
        data_url = f"data:{mime};base64,{b64}"

        payload = {
            "model": cfg.get("model", self.DEFAULT_MODEL),
            "images": [{"image_url": data_url}],
            "prompt": job.prompt,
            "n": 1,
            "size": cfg.get("size", "auto"),
            "watermark": cfg.get("watermark", False),
            "prompt_extend": cfg.get("prompt_extend", True),
            "response_format": cfg.get("response_format", "url"),
        }

        api_base = cfg.get("api_base", self.DEFAULT_API_BASE)
        url = api_base + self.EDIT_ENDPOINT
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=600)
        except requests.RequestException as e:
            raise RetryableError(f"网络错误: {e}") from e

        if resp.status_code != 200:
            error_text = resp.text[:500]
            if _is_quota_error(error_text) or resp.status_code in (402, 429):
                raise QuotaExhaustedError(f"HTTP {resp.status_code}: {error_text}")
            raise RetryableError(f"HTTP {resp.status_code}: {error_text}")

        # 解析响应
        result = resp.json()
        images = result.get("data", [])
        if not images:
            return JobResult(success=False, error=f"响应无图片数据: {result}")

        item = images[0]
        if item.get("url"):
            # 下载图片
            try:
                r = requests.get(item["url"], timeout=120)
                r.raise_for_status()
                job.output_path.parent.mkdir(parents=True, exist_ok=True)
                with open(job.output_path, "wb") as f:
                    f.write(r.content)
                return JobResult(
                    success=True,
                    output_path=job.output_path,
                    metadata={"size_bytes": len(r.content)},
                )
            except Exception as e:
                return JobResult(success=False, error=f"下载失败: {e}")

        if item.get("b64_json"):
            job.output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(job.output_path, "wb") as f:
                f.write(base64.b64decode(item["b64_json"]))
            return JobResult(success=True, output_path=job.output_path)

        return JobResult(success=False, error=f"响应既无 url 也无 b64_json: {result}")
