#!/usr/bin/env python3
"""Provider 注册表 — 自动发现和加载 Provider"""
from __future__ import annotations

from typing import Type

from .base import BaseProvider

# Provider 注册表
_PROVIDERS: dict[str, Type[BaseProvider]] = {}


def register_provider(cls: Type[BaseProvider]) -> Type[BaseProvider]:
    """注册 Provider（装饰器）"""
    instance = cls()
    _PROVIDERS[instance.name] = cls
    return cls


def get_provider(name: str) -> BaseProvider:
    """获取 Provider 实例"""
    if name not in _PROVIDERS:
        raise ValueError(f"未知 Provider: {name}，可用: {list(_PROVIDERS.keys())}")
    return _PROVIDERS[name]()


def list_providers() -> list[str]:
    """列出所有已注册 Provider"""
    return list(_PROVIDERS.keys())


# 自动导入内置 Provider
from . import sensenova  # noqa: E402, F401
