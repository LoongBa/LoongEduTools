// 通用「内容包 JSON → 前端 Unit」转换器。
// 消灭硬编码适配层：任何管线内容包（content_package.json）都能在运行时转为
// WebH5 可消费的 Unit，单元列表由 manifest.json 自动发现。
// 映射规则继承自原 u01Content.ts 的手工快照模式（IP 循环、stage 映射、词拆分）。
import type { IpKey } from "./ip";
import type { SentenceCard, SkillCheck, Song, SongJson, Unit, WordCard } from "./content";

const IP_KEYS: IpKey[] = ["leo", "mia", "sam", "nana", "kiki", "bubu"];

/** 停用词：从句卡拆「可点读实词」时跳过 */
const STOPWORDS = new Set([
  "a", "an", "the", "in", "on", "to", "and", "with", "my", "your", "his", "her",
  "he", "she", "we", "they", "i", "you", "it", "is", "are", "was", "were",
  "can", "yes", "no", "do", "does", "has", "have", "of", "for", "at", "but",
  "this", "that", "what", "who", "how", "why", "so", "too", "very", "also",
  "often", "always", "really", "me", "us", "my", "there", "here", "s",
  "don't", "isn't", "he's", "she's", "it's", "we're", "they're", "I'm",
]);

interface RawSentence {
  text?: string;
  zh?: string;
  audio?: string;
  source?: string;
}

export interface ContentPackage {
  unit?: string;
  grade?: string;
  title?: string;
  topic?: string;
  abilities?: { id: string; desc?: string; training_segments?: string[]; check?: { items?: string[]; retrain_segment?: string } }[];
  segments?: {
    id?: string;
    type?: string;
    scene?: { hotspots?: { text?: string; zh?: string; audio?: string }[] };
    groups?: { name?: string; cards?: { word?: string; zh?: string; audio?: string; image?: string; image_prompt?: string }[] }[];
    layers?: { original?: RawSentence[]; complete?: RawSentence[]; extend?: RawSentence[] };
    lines?: RawSentence[];
  }[];
}

/** 拆出句中 1-3 个可点读实词（跳过停用词），cn 没有就空串 */
function pickWords(en: string): { text: string; cn: string }[] {
  const toks = en.replace(/[.,!?;:]/g, " ").split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  const out: { text: string; cn: string }[] = [];
  for (const t of toks) {
    const bare = t.toLowerCase();
    if (STOPWORDS.has(bare) || seen.has(bare)) continue;
    seen.add(bare);
    out.push({ text: t, cn: "" });
    if (out.length >= 3) break;
  }
  return out;
}

/** 句子工厂：顺学顺序循环分配 IP 角色 */
function sentenceFactory() {
  let seq = 0;
  const ip = (): IpKey => {
    const key = IP_KEYS[seq % IP_KEYS.length];
    seq += 1;
    return key;
  };
  return (id: string, stage: SentenceCard["stage"], en: string, cn: string, mp3?: string): SentenceCard => ({
    id,
    stage,
    ip: ip(),
    en,
    cn,
    words: pickWords(en),
    ...(mp3 ? { mp3 } : {}),
  });
}

function stageForLayer(layer: string): SentenceCard["stage"] {
  if (layer === "original") return "warm";
  if (layer === "complete") return "new";
  if (layer === "extend") return "drill";
  return "drill";
}

/** 词卡工厂（IP 循环；image/mp3 为管线素材，缺省回退 IP 与浏览器朗读） */
function wordFactory(imageBase: string) {
  let seq = 0;
  const ip = (): IpKey => {
    const key = IP_KEYS[seq % IP_KEYS.length];
    seq += 1;
    return key;
  };
  const asWebp = (f: string | undefined): string | undefined => {
    if (!f) return undefined;
    const base = f.replace(/\.(png|jpg|jpeg|webp)$/i, "");
    return `${imageBase}${base}.webp`;
  };
  return (word: string, cn: string, image?: string, mp3?: string): WordCard => ({
    word,
    cn,
    ip: ip(),
    ...(asWebp(image) ? { image: asWebp(image) } : {}),
    ...(mp3 ? { mp3 } : {}),
  });
}

/**
 * 内容包 JSON → 前端 Unit。
 * @param pkg     管线内容包（content_package.json 解析结果）
 * @param unitDir 单元目录机读名（如 "u01"）——用于拼素材 URL
 * @param no      单元序号（manifest 提供）
 */
export function contentToUnit(pkg: ContentPackage, unitDir: string, no: number): Unit {
  const unitId = unitDir; // "u01"
  const audioBase = `/units/${unitDir}/audio/`;
  const imageBase = `/units/${unitDir}/images/`;
  const s = sentenceFactory();
  const wf = wordFactory(imageBase);

  const cards: SentenceCard[] = [];
  const words: WordCard[] = [];
  const segments = pkg.segments ?? [];
  let cardSeq = 0;

  for (const seg of segments) {
    const sid = seg.id ?? "S?";
    const type = seg.type ?? "";

    // S0 场景热区 → warm
    for (const h of seg.scene?.hotspots ?? []) {
      if (!h.text) continue;
      cardSeq += 1;
      cards.push(s(`${sid.toLowerCase()}_orig_${cardSeq}`, "warm", h.text, h.zh ?? "", h.audio ?? undefined));
    }

    // vocab 段 → 词卡
    if (type === "vocab") {
      for (const g of seg.groups ?? []) {
        for (const c of g.cards ?? []) {
          if (!c.word) continue;
          words.push(wf(c.word, c.zh ?? "", c.image, c.audio));
        }
      }
    }

    // pattern / phonics / story 段 → 三层句
    const layers = seg.layers ?? {};
    const pushLayer = (layerKey: "original" | "complete" | "extend") => {
      for (const r of (layers as Record<string, RawSentence[] | undefined>)[layerKey] ?? []) {
        if (!r.text) continue;
        cardSeq += 1;
        cards.push(s(`${sid.toLowerCase()}_${layerKey}_${cardSeq}`, stageForLayer(layerKey), r.text, r.zh ?? "", r.audio ?? undefined));
      }
    };
    pushLayer("original");
    pushLayer("complete");
    pushLayer("extend");

    // story 段 lines → warm（无 layers 时）
    if (type === "story" && !(layers.original?.length)) {
      for (const r of seg.lines ?? []) {
        if (!r.text) continue;
        cardSeq += 1;
        cards.push(s(`${sid.toLowerCase()}_orig_${cardSeq}`, "warm", r.text, r.zh ?? "", r.audio ?? undefined));
      }
    }
  }

  // 收尾句（wrap）：取最后一卡文本衍生，无音频 → 浏览器朗读
  if (cards.length > 0) {
    const last = cards[cards.length - 1];
    cards.push(s(`${unitId}_wrap_1`, "wrap", last.en, last.cn));
  }

  // 词卡不足 10 → 从句卡实词补足（去重）
  if (words.length < 10) {
    const have = new Set(words.map((w) => w.word.toLowerCase()));
    for (const c of cards) {
      for (const w of c.words) {
        if (words.length >= 10) break;
        const bare = w.text.toLowerCase();
        if (!have.has(bare) && !STOPWORDS.has(bare)) {
          have.add(bare);
          words.push(wf(w.text, w.cn ?? ""));
        }
      }
    }
  }

  // 歌曲：用 story 段/句卡前 4 句拼（带 audio 供 mp3 优先播放）
  const story = segments.find((x) => x.type === "story");
  const storyLines: Song["lines"] = story?.lines?.slice(0, 4).map((l) => ({
    en: l.text ?? "",
    cn: l.zh ?? "",
    ...(l.audio ? { audio: l.audio } : {}),
  })) ?? [];
  const songLines: Song["lines"] =
    storyLines.length > 0
      ? storyLines
      : cards.slice(0, 4).map((c) => ({ en: c.en, cn: c.cn, ...(c.mp3 ? { audio: c.mp3 } : {}) }));
  const song: Song = {
    id: `${unitId}-song`,
    title: pkg.title ?? unitDir,
    cn: pkg.topic ?? pkg.title ?? unitDir,
    kind: "lines",
    lines: songLines,
  };
  // 能力：abilities → SkillCheck
  const skills: SkillCheck[] = (pkg.abilities ?? []).map((ab, i) => {
    const retrain = ab.check?.retrain_segment ?? "";
    const stageMap: Record<string, SentenceCard["stage"]> = {
      S0: "warm", S1: "warm", S2: "new", S3: "new", S4: "drill", S6: "drill", S7: "drill", S8: "wrap",
    };
    const stage = /^S\d+$/.test(retrain) ? (stageMap[retrain] ?? "new") : "new";
    // demo：训练段首个 original 句
    const segId = (ab.training_segments ?? [])[0] ?? "";
    const seg = segments.find((x) => x.id === segId);
    const demo = seg?.layers?.original?.[0]?.text ?? cards[0]?.en ?? "";
    return {
      id: `${unitId}-s${i + 1}`,
      no: i + 1,
      name: ab.desc ?? `能力 ${i + 1}`,
      demo,
      task: ab.check?.items?.[0] ?? "",
      remedy: { stage, hint: `回到${retrain || "对应段落"}再练一练` },
    };
  });

  return {
    id: unitId,
    no,
    title: pkg.title ?? unitDir,
    cn: pkg.topic ?? pkg.title ?? unitDir,
    theme: pkg.topic ?? "",
    cards,
    words,
    song,
    skills,
  };
}

/**
 * song.json（点唱台整曲数据）→ 前端 Song。
 * 兼容两种 schema：
 *  - 需求文档 v1.1：lyrics[{en,zh,start,end}]（原创儿歌）
 *  - 并行任务实际产出：lines[{en,zh,audio,chant_id}] + chants[]（教材歌词跟读）
 * 缺 type 时按 original_song 处理（process_song.py 产物）。
 */
export function songJsonToSong(j: SongJson, unitDir: string): Song {
  const audioBase = `/units/${unitDir}/song/`;
  const isTextbook = j.type === "textbook_lyrics" || j.audio_type === "tts_sentences";
  const raw = (j.lyrics ?? j.lines ?? []) as { en?: string; zh?: string; start?: number; end?: number; audio?: string }[];
  const absAudio = (a: string | undefined) => (a && !a.startsWith("/") ? `${audioBase}${a}` : a);
  const lines: Song["lines"] = raw.map((l) => ({
    en: l.en ?? "",
    cn: l.zh ?? "",
    ...(l.audio ? { audio: absAudio(l.audio) } : {}),
  }));
  if (isTextbook) {
    // 教材歌词跟读：逐句 TTS，无整曲（id 与原创区分，避免点唱台选歌错位）
    return {
      id: `${unitDir}-tb-song`,
      title: j.title ?? unitDir,
      cn: unitDir,
      kind: "textbook_lyrics",
      lines,
    };
  }
  // 原创儿歌整曲（缺 type 时按此处理）
  const timeline = raw
    .map((l) => ({ start: l.start ?? 0, end: l.end ?? 0 }))
    .filter((t) => t.end > t.start);
  return {
    id: `${unitDir}-song`,
    title: j.title ?? unitDir,
    cn: unitDir,
    kind: "original_song",
    audio: absAudio(j.audio),
    instrumental: absAudio(j.instrumental),
    duration: j.duration,
    lines, // audio 已在上方 absAudio 拼成绝对路径（/units/uXX/song/...）
    timeline: timeline.length === lines.length ? timeline : undefined,
  };
}

/** 让未用到的路径常量被树摇掉前保留引用（音频/图路径拼接入 cards 用） */
export function assetPaths(unitDir: string) {
  return { audioBase: `/units/${unitDir}/audio/`, imageBase: `/units/${unitDir}/images/` };
}
