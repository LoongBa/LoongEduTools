/** 工具箱清单 · R03 §4.4 / A01 §4.4 —— R2 静态 JSON `manifest/toolbox.json`，缺省回退内置首发目录 */
import type { Env } from "../types";
import { json } from "../lib/errors";

interface ToolboxCategory {
  id: string;
  name: string;
}

interface ToolboxTool {
  id: string;
  name: string;
  category: string;
  tags: string[];
  description: string;
  license: string;
  homepage: string;
  download_url: string;
  size_bytes: number;
  checksum: string;
  portable: boolean;
  win7_ok: boolean;
  recommend: boolean;
  entry: string;
}

interface ToolboxManifest {
  version: string;
  updated_at: string;
  categories: ToolboxCategory[];
  tools: ToolboxTool[];
}

/** 首发目录种子（R03 §4.5 / 附录 A，2026-09-25）；R2 手工维护 `manifest/toolbox.json` 可整体覆盖 */
const DEFAULT_TOOLBOX: ToolboxManifest = {
  version: "1.0",
  updated_at: "2026-09-25T00:00:00Z",
  categories: [
    { id: "capture", name: "截屏录屏" },
    { id: "annotate", name: "屏幕标注" },
    { id: "keys", name: "按键显示" },
    { id: "keyboard", name: "虚拟键盘" },
  ],
  tools: [
    {
      id: "snip-easy",
      name: "SnipEasy 截屏录屏",
      category: "capture",
      tags: ["截屏", "标注", "录屏", "OCR"],
      description: "截图+标注+OCR+录屏一体（需 Win10+/.NET9）",
      license: "MIT",
      homepage: "https://github.com/ywx914705/SnipEasy",
      download_url: "https://github.com/ywx914705/SnipEasy/releases",
      size_bytes: 0,
      checksum: "",
      portable: true,
      win7_ok: false,
      recommend: true,
      entry: "SnipEasy.exe",
    },
    {
      id: "win-shot",
      name: "WinShot 截屏标注",
      category: "capture",
      tags: ["截屏", "标注", "录屏"],
      description: "键盘驱动截屏标注，~10MB 便携单 exe（需 Win10+）",
      license: "BSD-3",
      homepage: "https://github.com/mrgoonie/winshot",
      download_url: "https://github.com/mrgoonie/winshot/releases",
      size_bytes: 0,
      checksum: "",
      portable: true,
      win7_ok: false,
      recommend: false,
      entry: "WinShot.exe",
    },
    {
      id: "snipaste",
      name: "Snipaste 截屏贴图",
      category: "capture",
      tags: ["截屏", "贴图", "标注"],
      description: "贴图+标注，免费闭源，支持 Win 含旧系统",
      license: "免费（闭源）",
      homepage: "https://www.snipaste.com/",
      download_url: "https://www.snipaste.com/download.html",
      size_bytes: 0,
      checksum: "",
      portable: true,
      win7_ok: true,
      recommend: false,
      entry: "Snipaste.exe",
    },
    {
      id: "inkeys",
      name: "智绘教 Inkeys",
      category: "annotate",
      tags: ["标注", "教学", "板书"],
      description: "教学向屏幕标注（原 IDT），Win7 RTM+ 便携，x86/x64/ARM64",
      license: "GPL-3.0",
      homepage: "https://github.com/Alan-CRL/Inkeys",
      download_url: "https://github.com/Alan-CRL/Inkeys/releases",
      size_bytes: 0,
      checksum: "",
      portable: true,
      win7_ok: true,
      recommend: true,
      entry: "Inkeys.exe",
    },
    {
      id: "marker-on",
      name: "MarkerOn 屏幕标注",
      category: "annotate",
      tags: ["标注", "快捷键", "透明画布"],
      description: "全局快捷键透明画布，11 种标注工具，~1.5MB 跨平台",
      license: "MIT",
      homepage: "https://github.com/ifer47/markeron",
      download_url: "https://github.com/ifer47/markeron/releases",
      size_bytes: 0,
      checksum: "",
      portable: false,
      win7_ok: false,
      recommend: false,
      entry: "markeron.exe",
    },
    {
      id: "keyviz",
      name: "Keyviz 按键显示",
      category: "keys",
      tags: ["按键", "快捷键", "演示"],
      description: "实时显示按键/鼠标操作，教学演示用（有社区汉化版）",
      license: "开源",
      homepage: "https://github.com/mulaRahul/keyviz",
      download_url: "https://github.com/mulaRahul/keyviz/releases",
      size_bytes: 0,
      checksum: "",
      portable: true,
      win7_ok: false,
      recommend: true,
      entry: "keyviz.exe",
    },
    {
      id: "osk",
      name: "osk.exe 屏幕键盘",
      category: "keyboard",
      tags: ["虚拟键盘", "系统内置"],
      description: "Windows 系统内置屏幕键盘，零分发成本",
      license: "系统内置",
      homepage: "",
      download_url: "",
      size_bytes: 0,
      checksum: "",
      portable: true,
      win7_ok: true,
      recommend: true,
      entry: "",
    },
  ],
};

/** GET /toolbox/manifest —— R2 静态 JSON `manifest/toolbox.json`，缺省回退内置首发目录 */
export async function toolboxManifest(_req: Request, env: Env): Promise<Response> {
  try {
    const obj = await env.R2_PACK.get("manifest/toolbox.json");
    if (obj) {
      return new Response(obj.body, {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
  } catch (e) {
    console.warn("[toolbox] R2 read failed", e);
  }
  return json(DEFAULT_TOOLBOX);
}
