# 游戏复习包 · R14

app 型内容包：**选择页 index.html** + 两款从 RedTools 只读复制的静态游戏。

## 组成

```
game-review-pack/
├── index.html          # 壳入口：两款游戏选择页（点击 iframe 载入）
├── games/
│   ├── idiom-match/     # 成语配对（RedTools/series/学科/成语配对/src/** 复制）
│   └── antonym-match/   # 反义词配对（同系列）
└── README.md
```

## 打包

```powershell
python pack_app.py --source content_sources/game-review-pack `
  --package-id game-review-pack --version 1.0.0 `
  --name "游戏复习" --display-name "游戏复习" `
  --categories "复习,游戏" --level 1 --out dist
```

## 红线

- 只复制 RedTools `src/` 静态产物，不改源仓库。
- 无 AI 运行时、零儿童数据采集；本地静态加载。
