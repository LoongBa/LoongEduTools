# 小学英语素材管理系统

> **自用**的小学英语（人教版 PEP）素材管理系统——服务三个消费方：
> ① 单元视频制作 ② 点读陪练小程序 ③ 点读陪练教辅。
> 不做商业分发、不追求通用化；先专后通：先做透 PEP 英语这一个域，
> 其它视频生产模式启动时再逐个评估是否提炼通用层。

## 目录结构

```
小学英语素材管理系统/
├── README.md                            # 本文件（入口）
├── docs/                                # ★ 文档中心
│   ├── 小学英语素材管理系统-需求文档.md  #   需求（现状痛点/范围/FR/NFR/验收）
│   └── 小学英语素材管理系统-设计文档.md  #   设计（架构/Schema/模块/里程碑）
├── inventory/                           # 清单仓库（SSOT 产物，扫描/对账/状态/就绪度 JSON）
│   ├── schema/                          #   JSON schema 定义（版本化）
│   ├── manifest.json                    #   ★ SSOT：册→单元→页→track 全量清单
│   ├── integrity.json                   #   对账结果
│   ├── production.json                  #   四类生产状态
│   ├── readiness.json                   #   三消费方就绪矩阵
│   └── report.md                        #   由 JSON 生成的素材清单（替代手工版）
└── scripts/                             # 代码（inventory.py + lib/）
```

## 核心设计一句话

**SSOT（manifest.json）→ 派生（integrity/production/readiness）→ report.md**，
一切可重建、全部只读素材、agent 可查询。

## 消费方

| 消费方 | 依赖素材 | 就绪条件 |
|--------|----------|----------|
| 单元视频 | 页面图 + 重绘 + 音频 | 图全 + 重绘通过 + 音频齐全 |
| 点读陪练小程序 | content.json + audio + images | 内容已审校 + 素材已产 |
| 点读陪练教辅（打印） | content.json + print_version | 内容已审校 + 打印字段已填 |

## 文档（先读需求 → 再读设计）

1. [`docs/小学英语素材管理系统-需求文档.md`](docs/小学英语素材管理系统-需求文档.md)
2. [`docs/小学英语素材管理系统-设计文档.md`](docs/小学英语素材管理系统-设计文档.md)

## 状态

- [ ] 需求文档评审（草案待确认：Q2 素材清单.md 是否由 report.md 替代）
- [ ] 设计文档评审（Q3 CLI 先行 / Q4 六下占位）
- [ ] M1：scan + check + schema
- [ ] M2：四状态追踪
- [ ] M3：就绪矩阵 + missing + CLI
- [ ] M4：report.md 收口