// 真实 U02「My friends」数据适配层。
// 静态快照：转录自管线产物 build/u02/u02_content_package.json（SSOT）。
// 字段严格对齐 WebH5 的 Unit 类型；audio 字段值 = 管线 TTS 文件名（public/units/u02/audio/ 下的 mp3）。
import type { IpKey } from "./ip";
import type { SentenceCard, SkillCheck, Song, Unit, WordCard } from "./content";

const IP_KEYS: IpKey[] = ["leo", "mia", "sam", "nana", "kiki", "bubu"];

/** 句卡工厂：按顺学顺序循环分配 IP 角色 */
function buildCards(): SentenceCard[] {
  let seq = 0;
  const ip = (): IpKey => {
    const key = IP_KEYS[seq % IP_KEYS.length];
    seq += 1;
    return key;
  };
  const sentence = (
    id: string,
    stage: SentenceCard["stage"],
    en: string,
    cn: string,
    words: { text: string; cn: string }[],
    mp3?: string,
  ): SentenceCard => ({
    id,
    stage,
    ip: ip(),
    en,
    cn,
    words,
    ...(mp3 ? { mp3 } : {}),
  });

  return [
    // ---- S0 场景（map hotspots，全部作为开场复习）----
    sentence("s0_orig_1", "warm", "I have a new friend.", "我有一个新朋友。", [
      { text: "friend", cn: "朋友" },
    ], "u02_s0_h01.mp3"),
    sentence("s0_orig_2", "warm", "He's tall and strong.", "他又高又壮。", [
      { text: "tall", cn: "高的" },
      { text: "strong", cn: "强壮的" },
    ], "u02_s0_h02.mp3"),
    sentence("s0_orig_3", "warm", "She's quiet and kind.", "她安静又善良。", [
      { text: "quiet", cn: "安静的" },
      { text: "kind", cn: "善良的" },
    ], "u02_s0_h03.mp3"),
    sentence("s0_orig_4", "warm", "We play games together.", "我们一起玩游戏。", [
      { text: "games", cn: "游戏" },
      { text: "together", cn: "一起" },
    ], "u02_s0_h04.mp3"),

    // ---- S2 句型 He's/She's ___.（原文→补全→扩展）----
    sentence("s2_orig_1", "warm", "He's tall and strong.", "他又高又壮。", [
      { text: "tall", cn: "高的" },
      { text: "strong", cn: "强壮的" },
    ], "u02_s2_orig01.mp3"),
    sentence("s2_orig_2", "warm", "He has nice short hair too.", "他还有好看的短发。", [
      { text: "short hair", cn: "短发" },
    ], "u02_s2_orig02.mp3"),
    sentence("s2_orig_3", "warm", "He's also kind.", "他也很善良。", [
      { text: "kind", cn: "善良的" },
    ], "u02_s2_orig03.mp3"),
    sentence("s2_comp_1", "new", "She's short and thin.", "她又矮又瘦。", [
      { text: "short", cn: "矮的" },
      { text: "thin", cn: "瘦的" },
    ], "u02_s2_comp01.mp3"),
    sentence("s2_comp_2", "new", "She has long hair.", "她留着长头发。", [
      { text: "long hair", cn: "长头发" },
    ], "u02_s2_comp02.mp3"),
    sentence("s2_comp_3", "new", "He's quiet.", "他很安静。", [
      { text: "quiet", cn: "安静的" },
    ], "u02_s2_comp03.mp3"),
    sentence("s2_comp_4", "new", "She's funny.", "她很有趣。", [
      { text: "funny", cn: "有趣的" },
    ], "u02_s2_comp04.mp3"),
    sentence("s2_ext_1", "drill", "He's tall and thin.", "他又高又瘦。", [
      { text: "tall", cn: "高的" },
      { text: "thin", cn: "瘦的" },
    ], "u02_s2_ext01.mp3"),
    sentence("s2_ext_2", "drill", "She has big eyes.", "她有大眼睛。", [
      { text: "big eyes", cn: "大眼睛" },
    ], "u02_s2_ext02.mp3"),
    sentence("s2_ext_3", "drill", "He has small ears.", "他有小耳朵。", [
      { text: "small ears", cn: "小耳朵" },
    ], "u02_s2_ext03.mp3"),

    // ---- S3 句型 My best friend is ___.（原文→补全→扩展）----
    sentence("s3_orig_1", "warm", "Who's your best friend?", "你最好的朋友是谁？", [
      { text: "best friend", cn: "最好的朋友" },
    ], "u02_s3_orig01.mp3"),
    sentence("s3_orig_2", "warm", "Chen Jie. She's funny.", "陈杰。她很有趣。", [
      { text: "funny", cn: "有趣的" },
    ], "u02_s3_orig02.mp3"),
    sentence("s3_orig_3", "warm", "She often makes me smile.", "她经常逗我笑。", [
      { text: "smile", cn: "微笑" },
    ], "u02_s3_orig03.mp3"),
    sentence("s3_orig_4", "warm", "My best friend is John.", "我最好的朋友是约翰。", [
      { text: "best friend", cn: "最好的朋友" },
    ], "u02_s3_orig04.mp3"),
    sentence("s3_comp_1", "new", "He often helps me with English.", "他经常帮我学英语。", [
      { text: "helps", cn: "帮助" },
      { text: "English", cn: "英语" },
    ], "u02_s3_comp01.mp3"),
    sentence("s3_comp_2", "new", "She often reads books with me.", "她经常和我一起看书。", [
      { text: "reads", cn: "读" },
      { text: "books", cn: "书" },
    ], "u02_s3_comp02.mp3"),
    sentence("s3_comp_3", "new", "He often plays football with me.", "他经常和我一起踢足球。", [
      { text: "football", cn: "足球" },
    ], "u02_s3_comp03.mp3"),
    sentence("s3_ext_1", "drill", "She always makes me happy.", "她总是让我开心。", [
      { text: "happy", cn: "开心的" },
    ], "u02_s3_ext01.mp3"),
    sentence("s3_ext_2", "drill", "He often plays games with me.", "他经常和我一起玩游戏。", [
      { text: "games", cn: "游戏" },
    ], "u02_s3_ext02.mp3"),
    sentence("s3_ext_3", "drill", "She helps me with Chinese.", "她帮我学语文。", [
      { text: "Chinese", cn: "语文" },
    ], "u02_s3_ext03.mp3"),

    // ---- S6 语音 sh（单词句 + chant 首句作 drill）----
    sentence("s6_orig_1", "warm", "This is my good friend! Ha! Ha!", "这是我的好朋友！哈哈！", [
      { text: "friend", cn: "朋友" },
    ], "u02_s7_06.mp3"),
    sentence("s6_orig_2", "warm", "I have no shell. Can we share?", "我没有壳。我们可以分享吗？", [
      { text: "share", cn: "分享" },
    ], "u02_ph_share.mp3"),
    sentence("s6_drill_1", "drill", "You can share my shell!", "你可以分享我的壳！", [
      { text: "share", cn: "分享" },
    ], "u02_ph_share.mp3"),

    // ---- S7 短文（story 6 句，原文→收尾）----
    sentence("s7_orig_1", "warm", "Tell me about your good friend.", "跟我说说你的好朋友。", [
      { text: "friend", cn: "朋友" },
    ], "u02_s7_01.mp3"),
    sentence("s7_orig_2", "warm", "He has small eyes and very big ears.", "他有小眼睛和大耳朵。", [
      { text: "eyes", cn: "眼睛" },
      { text: "ears", cn: "耳朵" },
    ], "u02_s7_02.mp3"),
    sentence("s7_orig_3", "warm", "We often play games in the park.", "我们经常在公园玩游戏。", [
      { text: "games", cn: "游戏" },
      { text: "park", cn: "公园" },
    ], "u02_s7_04.mp3"),
    sentence("s7_orig_4", "warm", "Can I meet your friend? Sure.", "我能见见你的朋友吗？当然。", [
      { text: "meet", cn: "见面" },
    ], "u02_s7_05.mp3"),
    sentence("s7_ext_1", "drill", "He has short legs, but his body is very long.", "他腿短，但身体很长。", [
      { text: "short legs", cn: "短腿" },
    ], "u02_s7_03.mp3"),
    // 收尾句：复用 S7 结尾，无独立音频走浏览器朗读兜底
    sentence("s7_wrap_1", "wrap", "This is my good friend! Friends are fun.", "这是我的好朋友！朋友真有趣。", [
      { text: "friend", cn: "朋友" },
      { text: "fun", cn: "有趣" },
    ]),
  ];
}

/** 词卡：S1 vocab 6 词 + S4 activities 4 词 = 10（全部带管线配图+音频） */
function buildWords(): WordCard[] {
  let seq = 0;
  const ip = (): IpKey => {
    const key = IP_KEYS[seq % IP_KEYS.length];
    seq += 1;
    return key;
  };
  const cards: [string, string, string, string][] = [
    ["tall and strong", "又高又壮", "u02_v_tall_strong", "u02_v_tall_strong"],
    ["short and thin", "又矮又瘦", "u02_v_short_thin", "u02_v_short_thin"],
    ["long hair", "长头发", "u02_v_long_hair", "u02_v_long_hair"],
    ["short hair", "短头发", "u02_v_short_hair", "u02_v_short_hair"],
    ["kind", "善良的", "u02_v_kind", "u02_v_kind"],
    ["quiet", "安静的", "u02_v_quiet", "u02_v_quiet"],
    ["read books", "看书", "u02_act_read", "u02_act_read"],
    ["play games", "玩游戏", "u02_act_games", "u02_act_games"],
    ["play football", "踢足球", "u02_act_football", "u02_act_football"],
    ["help with English", "帮学英语", "u02_act_english", "u02_act_english"],
  ];
  return cards.map(([word, cn, img, audio]) => ({
    word,
    cn,
    ip: ip(),
    image: `./units/u02/images/${img}.webp`,
    mp3: `${audio}.mp3`,
  }));
}

/** 点唱台：U02 无独立歌曲，用 S7 课文 4 句凑成歌词 */
function buildSong(): Song {
  return {
    id: "u02-song",
    title: "My Friends",
    cn: "我的朋友",
    lines: [
      { en: "Tell me about your good friend.", cn: "跟我说说你的好朋友。" },
      { en: "He has small eyes and very big ears.", cn: "他有小眼睛和大耳朵。" },
      { en: "He has short legs, but his body is very long.", cn: "他腿短，但身体很长。" },
      { en: "We often play games in the park.", cn: "我们经常在公园玩游戏。" },
    ],
  };
}

/** 能力自检：abilities A1-A4 → SkillCheck（remedy 按 retrain_segment 映射四环节） */
function buildSkills(): SkillCheck[] {
  const skills: Omit<SkillCheck, "id">[] = [
    {
      no: 1,
      name: "说说我的朋友的外貌和性格",
      demo: "He's tall and strong.",
      task: "指着朋友图，用 He's/She's ... 描述外貌性格，至少 2 句.",
      remedy: { stage: "new", hint: "回到S2再练一练" },
    },
    {
      no: 2,
      name: "说说我和朋友一起做的事",
      demo: "We play games together.",
      task: "说 We ... together. / He/She often ... with me. 至少 2 句.",
      remedy: { stage: "drill", hint: "回到S4再练一练" },
    },
    {
      no: 3,
      name: "说说为什么 TA 是我的好朋友",
      demo: "My best friend is John.",
      task: "说 My best friend is ... He/She often ...",
      remedy: { stage: "new", hint: "回到S3再练一练" },
    },
    {
      no: 4,
      name: "读一读、拼一拼 sh 的单词",
      demo: "I have no shell. Can we share?",
      task: "指认 6 个 sh 词朗读 + 听写 3 个词",
      remedy: { stage: "drill", hint: "回到S6再练一练" },
    },
  ];
  return skills.map((s, i) => ({ ...s, id: `u02-s${i + 1}` }));
}

/** 真实 U02：字段严格对齐 WebH5 的 Unit 类型 */
export const PIPELINE_U02: Unit = {
  id: "u2",
  no: 2,
  title: "My friends",
  cn: "我的朋友",
  theme: "描述朋友的外貌性格，说说我们一起做的事",
  cards: buildCards(),
  words: buildWords(),
  song: buildSong(),
  skills: buildSkills(),
};