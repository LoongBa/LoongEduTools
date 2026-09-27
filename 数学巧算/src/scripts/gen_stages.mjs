// 构建期数据生成：content/（教程库 SSOT，位于 src 上一级）→ src/data/stages.generated.ts
// 目的：离线包一切数据构建期内联（minitool 禁网络，与英语陪练 gen_catalog.mjs 同构）。
// 用法：pnpm dev / pnpm build / pnpm build:online 前自动执行（见 package.json scripts）
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = resolve(__dirname, "../../content");
const OUT_DIR = resolve(__dirname, "../src/data");
const OUT_FILE = resolve(OUT_DIR, "stages.generated.ts");

const STAGES_ORDER = [
  "stage1_凑十破十平十.json",
  "stage2_凑整与搬家.json",
  "stage3_拆数与特殊数.json",
  "stage4_简便运算系统化.json",
  "stage5_小数巧算.json",
  "stage6_分数巧算.json",
  "stageX_思维进阶.json",
];

function loadJson(name) {
  const raw = readFileSync(resolve(CONTENT_DIR, name), "utf-8");
  return JSON.parse(raw);
}

function main() {
  const stages = [];
  for (const name of STAGES_ORDER) {
    try {
      const d = loadJson(name);
      stages.push(d);
    } catch (e) {
      console.error(`WARN: 读取 ${name} 失败（${e.message}），跳过`);
    }
  }
  if (!stages.length) {
    console.error("ERROR: 无任何阶段数据，检查 content/ 目录");
    process.exit(1);
  }
  const lessonCount = stages.reduce((n, s) => n + (s.lessons?.length || 0), 0);

  // 输出 TS 模块（类型宽松：内容为数据，运行时由渲染层消费）
  const ts = `// ⚠️ 本文件由 scripts/gen_stages.mjs 自动生成，勿手改。
// 数据源：数学巧算/content/*.json（教程库 SSOT —— 原理先行、六阶段+拓展 28 讲）
export interface SmartExample {
  expr: string;
  normal: string;
  smart: string;
  answer: number | string;
  accepted?: (number | string)[];
  why: string;
}
export interface SmartLesson {
  stage?: number | string;
  lesson_id: string;
  title: string;
  goal: string;
  principle: string;
  prereq: string[];
  situation: { text: string; question: string };
  explore: { model: string; steps: string[] };
  method: { rhyme: string; steps: string[] };
  examples: SmartExample[];
  mistakes: { wrong: string; reason: string }[];
  practice: Record<string, { count: number; gen: string; params: Record<string, unknown> }>;
  answers: Record<string, (number | string)[]>;
}
export interface SmartStage {
  schema_version: string;
  generated_at: string;
  source: string;
  stage: number | string;
  grade: string;
  theme: string;
  lessons: SmartLesson[];
}

export const STAGES: SmartStage[] = ${JSON.stringify(stages, null, 2)};
export const STAGES_META = { total: ${stages.length}, lessons: ${lessonCount}, generated_at: ${JSON.stringify(stages[0]?.generated_at || "")} };
`;

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, ts, "utf-8");
  console.log(`gen_stages ✓ ${stages.length} 阶段 / ${lessonCount} 讲 → src/data/stages.generated.ts`);
}

main();