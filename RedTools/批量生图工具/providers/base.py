#!/usr/bin/env python3
"""API Provider 抽象基类 — 定义生图 Provider 接口"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class JobResult:
    """单个 Job 执行结果"""
    success: bool
    output_path: Optional[Path] = None
    error: Optional[str] = None
    metadata: dict = field(default_factory=dict)


@dataclass
class Job:
    """单个生图任务"""
    id: str
    prompt: str
    input_image: Optional[Path] = None
    output_path: Optional[Path] = None
    params: dict = field(default_factory=dict)

    def __post_init__(self):
        if self.input_image and isinstance(self.input_image, str):
            self.input_image = Path(self.input_image)
        if self.output_path and isinstance(self.output_path, str):
            self.output_path = Path(self.output_path)


class BaseProvider(ABC):
    """Provider 抽象基类 — 所有 API 提供商实现此接口"""

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider 名称（如 sensenova, openai）"""
        ...

    @property
    @abstractmethod
    def max_concurrency(self) -> int:
        """默认最大并发数（通常 = key 数量）"""
        ...

    @abstractmethod
    def generate(self, job: Job, api_key: str) -> JobResult:
        """执行单个生成任务

        Args:
            job: 生成任务
            api_key: API 密钥

        Returns:
            JobResult: 执行结果

        Raises:
            QuotaExhaustedError: 额度用完（触发换 key 重试）
            RetryableError: 可重试错误（网络超时等）
            FatalError: 不可重试错误（参数错误等）
        """
        ...

    @abstractmethod
    def validate_config(self, config: dict) -> list[str]:
        """验证 Provider 配置，返回错误列表（空 = 合法）"""
        ...


class ProviderError(Exception):
    """Provider 基类异常"""
    pass


class QuotaExhaustedError(ProviderError):
    """额度用完 — 触发换 key 重试"""
    pass


class RetryableError(ProviderError):
    """可重试错误 — 如网络超时、限流"""
    pass


class FatalError(ProviderError):
    """不可重试错误 — 如参数错误、认证失败"""
    pass
