# 批量生图工具

> 通用并发调度 + 多 Key 均衡 + 断点续跑

## 1. 定位

通用的**批量 AI 生图执行引擎**，核心能力：

| 能力 | 说明 |
|------|------|
| **均衡调度** | 多 Key 轮换 + 冷却周期 + 自动恢复 |
| **并发控制** | 自动匹配可用 Key 数 / 手动指定 |
| **失败重试** | 额度错误自动换 Key 重试 / 可配置最大重试次数 |
| **状态持久化** | `done.json` 记录已完成任务，支持断点续跑 |
| **Provider 插件** | 支持 SenseNova / OpenAI / 任意 API 提供商 |
| **公共配置** | `keys.json` 统一管理 API Key，重绘工具也能用 |

## 2. 快速开始

### 2.1 初始化 Key

```bash
# 方式 1：命令行
python batch_cli.py init-keys --keys sk-xxx sk-yyy sk-zzz

# 方式 2：直接编辑 keys.json
```

```json
{
  "sensenova": {
    "keys": ["sk-xxx", "sk-yyy", "sk-zzz"],
    "cycle_seconds": 18000
  }
}
```

### 2.2 创建任务

```bash
# 从原图目录创建
python batch_cli.py create pep4s_u01 "F:\教材\四年级上\_图片素材" --pages 2-13

# 从 book.json 创建（按单元）
python batch_cli.py create pep4s_u01 \
  --book-json "F:\...\book.json" \
  --source-dir "F:\教材\四年级上\_图片素材" \
  --unit Unit01
```

### 2.3 执行任务

```bash
# 执行
python batch_cli.py run pep4s_u01

# 断点续跑（跳过已完成）
python batch_cli.py run pep4s_u01 --resume

# 强制重新执行
python batch_cli.py run pep4s_u01 --force

# 指定并发数
python batch_cli.py run pep4s_u01 --parallel 3
```

### 2.4 查看状态

```bash
# 列出所有任务
python batch_cli.py list

# 查看 Key 状态
python batch_cli.py status

# 清除 Key 状态
python batch_cli.py clear --all
```

## 3. 目录结构

```
批量生图工具/
├── batch_cli.py              # CLI 入口
├── batch_engine.py           # 核心执行引擎
├── batch_redraw.py           # 重绘特例（任务创建）
├── key_manager.py            # 多 Provider Key 管理
├── keys.json                 # 公共 API Key 配置（不入 git）
├── key_state.json            # Key 运行状态（不入 git）
├── providers/
│   ├── __init__.py           # Provider 注册表
│   ├── base.py               # 抽象基类
│   └── sensenova.py          # SenseNova Provider
├── tasks/
│   └── <task_name>/
│       ├── config.json       # 任务配置
│       ├── jobs.json         # 任务清单
│       ├── done.json         # 已完成 ID（断点续跑）
│       ├── prompts/          # 提示词
│       └── output/           # 输出结果
└── docs/
    └── 设计方案.md           # 架构设计文档
```

## 4. 任务 JSON 格式

```json
{
  "task_name": "redraw_4s_units",
  "provider": "sensenova",
  "model": "sensenova-u1.5-lite",
  "size": "auto",
  "concurrency": "auto",
  "retry": {
    "max_attempts": 3,
    "backoff_seconds": 5
  },
  "jobs": [
    {
      "id": "page_002",
      "prompt": "将这张图片重绘为卡通风格...",
      "input_image": "input/Page_002.png",
      "output_path": "output/Page_002_redrawn.png",
      "params": {}
    }
  ]
}
```

## 5. 与重绘工具的关系

| 工具 | 职责 |
|------|------|
| `批量生图工具/` | 通用执行引擎（并发调度 + Key 均衡 + 断点续跑） |
| `重绘工具/redraw.py` | 旧版单体脚本（**key 配置已接入公共 keys.json**） |

**推荐用法**：使用 `批量生图工具` 的 `batch_cli.py create` 创建任务，然后 `batch_cli.py run` 执行。

### 5.1 Key 配置共享（重要）

`keys.json` 是**公共密钥配置**，两个工具共用：

- 本工具：运行时读取根目录 `keys.json`
- `重绘工具/key_manager.py`：**优先读取 `../批量生图工具/keys.json`**，未配置时才回退内置列表

**改 key 只改一处**：编辑 `批量生图工具/keys.json` 即可，重绘工具自动生效。

> ⚠️ 冷启状态迁移：旧 `重绘工具/key_state.json` 的 key 冷却状态已迁移到
> `批量生图工具/key_state.json`（新格式 `providers.<name>.keys`），恢复日历不丢失。
> 两个工具各自读自己的状态文件，互不覆盖。

## 6. 扩展 Provider

在 `providers/` 下新建文件，继承 `BaseProvider`：

```python
from .base import BaseProvider, Job, JobResult

class MyProvider(BaseProvider):
    @property
    def name(self) -> str:
        return "my_provider"

    @property
    def max_concurrency(self) -> int:
        return 3

    def generate(self, job: Job, api_key: str) -> JobResult:
        # 实现 API 调用
        ...

    def validate_config(self, config: dict) -> list[str]:
        # 验证配置
        return []
```

然后在 `providers/__init__.py` 中注册：

```python
from . import my_provider  # noqa: E402, F401
```

## 7. 注意事项

1. **keys.json 和 key_state.json 不入 git**（已在 .gitignore）
2. **冷却周期**：默认 5 小时，从标记用完时刻算起
3. **断点续跑**：`--resume` 会跳过 `done.json` 中已记录的 job
4. **并发数**：`auto` 模式下 = 可用 Key 数量（冷却中的 Key 不计）
