# 人教点读下载工具 — 技术原理备忘

> ⚠️ **保密提醒**：本项目 GitHub 仓库为 **Private**（`LoongBa/LoongEduTools`），
> 本文件及 `PEP词库/tools/diandu/` 下脚本仅限内部使用，**不得公开**。
> 涉及人教点读接口的逆向信息，请勿外传。

---

## 1. 背景与用途

国家智慧教育平台（ykt.cbern.com.cn）的教材音频**需要登录鉴权**（x-nd-auth 头），
且**没有朗读文字/字幕**。而人教点读（rjdiandu.mypep.cn / pdpd.mypep.cn）的教材
**音频是公开直链**，且自带：
- `track_text` —— 英文朗读内容
- `track_genre` —— 中文翻译
- `sentence_evaluating` —— 逐句时间轴（可生成 SRT 字幕）

本工具从人教点读获取 音频 + 页面图片 + 朗读文字 + 字幕，供老师制作同步视频、
按顺序播放、知道每一句内容。

---

## 2. 数据来源链路

```
人教点读小程序/H5 (diandu.mypep.cn)
  ├─ applet_book_list3000.anys      → 书目列表（无需 token）
  ├─ getEmbedCourses.anys           → 章节树（无需 token，但 url 字段是加密的）
  ├─ access_token.json              → 换取 token（需登录态）
  ├─ getBookUrl.json                → book.json 地址（需 token + SHA1 签名）
  └─ pdpd.mypep.cn/digitbook/{bookid}/book.json  → 完整 book JSON（加密二进制，SDK 解密）
       ├─ bookpage[].track_info[]   → 每页音频热区（track_text/track_genre/track_url_source/sentence_evaluating）
       ├─ bookpage[].page_url_source → 每页截图 PNG（公开直链）
       ├─ bookinfo                  → 书名 / bookid / bookid_3rd
       └─ resource.track.url        → 整包音频 zip（⚠ 内容加密，不可用）
```

**关键结论**：
- book.json 是 namibox 私有加密格式（前 4 字节 = 明文长度 + 高熵密文），
  需 `namibox_jssdk.loadBookJson()` 在浏览器里解密
- 解密后的数据**只在页面内存**，不在 localStorage（localStorage 仅有目录 bookaudio_v3）
- 因此获取 book JSON 的可行方式是：**浏览器打开页面 → SDK 解密 → 控制台导出**
  （见 `get_book_json.js`，可批量导出全部 PEP 教材）
- mp3 直链（`pdpd.mypep.cn/.../track/*.mp3`）与图片直链（`page_url_source`）**公开可下载，无需鉴权**；
  `track.zip` 整包内容为加密格式，**不可用**（已实测）

### getBookUrl.json 签名（get_book_json.js 内实现）

```js
const ts = 格式化为 yyyyMMddHHmmss;
const sign = sha1(`ak=pep_click&book_id=${bid}&fixed_key=bac1359d7feb996b396dff38ab77rf7a&timestamp=${ts}`);
POST https://diandu.mypep.cn/book/getBookUrl.json
  body: { book_id, sign, timestamp: ts, ak: 'pep_click' }
  → result 即 book.json 地址，交给 namibox_jssdk.loadBookJson() 解密
```

---

## 3. 文件命名规则

### 3.1 单句音频

```
P{页码:03d}_{页内序号:02d}_{朗读文字}.mp3
例: P002_01_Unit_1_Helping_at_home.mp3
    P003_02_What_do_you_help_at_home.mp3
```

- 页码 + 页内序号：按文件名排序即教材顺序
- 朗读文字 = track_text（英文），缺失回退 track_genre（中文）
- 特殊字符清洗（见 `diandu_common.py clean_name`）：
  - Windows 非法字符：`"` 删除，`< >` → `《 》`，`:` → `：`，`/ \ |` → `-`，`?` → `？`，`*` → `·`
  - 控制字符（含换行）→ 空格；HTML 标签删除
  - 空白 → `_`，合并连续 `_`，截断 60 字符
  - 保留英文句点 `.`（老脚本会替换为 `_`，已优化为保留，语义更清晰）

### 3.2 页面图片

```
{书名}_{页码:02d}.png
例: 英语（PEP）_四年级_上册_02.png
```

- 文件名前缀 = `bookinfo.bookname` 经 `clean_name` 清洗
- 与单句音频按 `page_no` 对齐（同页码 ↔ 同页图）

---

## 4. 字幕生成（对齐老脚本 ExtractPEP_Srt.py）

- 每个 track 为一条字幕（时长 = track_duration）
- 含 `sentence_evaluating` 的 track 按 `audio_start` 切分逐句，时间轴精确到毫秒
- 输出三种：`.srt`（英）、`_cn.srt`（中）、`_en_cn.txt`（中英对照，供打印）

---

## 5. 常见问题

- **book.json 下载失败（invalid token）**：token 过期，需重新从微信小程序获取
  `access_token`（抓包 `diandu.mypep.cn` 的 `access_token.json` 响应或页面 URL 参数）
- **音频整包不可用**：`resource.track.zip` 内容加密，必须用 `track_url_source` 直链逐条下载（脚本默认如此）
- **字幕为空**：部分教材 track 无 `sentence_evaluating`，只有整段文字（仍生成 srt）
- **merge 报 ffmpeg not found**：安装 ffmpeg 并加入 PATH（scoop install ffmpeg）
- **tag 报 mutagen 缺失**：`pip install mutagen`

---

## 6. 已知数据状态

- `data/` 现有 11 本教材 book.json（一年级~六年级 上下册，共 12 本），
  不入库，已打包为 `book_data.zip`（约 1.3MB）
- 缺 **六年级下册**（`1212001602145`）—— 新版教材尚未出版，**推测 27 年寒假甚至下学期开学前发布，此前暂缓**

---

*本文档是逆向过程的备忘，忘记操作方法时先看 README.md（使用方式），再看本文（原理）。*
