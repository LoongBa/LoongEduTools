// 真实 U01「Helping at home」数据适配层。
// 静态快照：转录自管线产物 build/u01/u01_content_package.json（SSOT）+ build/u01/05_schedule.json。
// 字段严格对齐 WebH5 的 Unit 类型；audio 字段值 = 管线 TTS 文件名（public/units/u01/audio/ 下的 mp3）。
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
    sentence("s0_orig_1", "warm", "We often cook together.", "我们经常一起做饭。", [
      { text: "cook", cn: "做饭" },
      { text: "together", cn: "一起" },
    ], "u01_s0_h01.mp3"),
    sentence("s0_orig_2", "warm", "We clean the room together.", "我们一起打扫房间。", [
      { text: "clean", cn: "打扫" },
      { text: "room", cn: "房间" },
    ], "u01_s0_h02.mp3"),
    sentence("s0_orig_3", "warm", "I can sweep the floor.", "我会扫地。", [
      { text: "sweep", cn: "扫" },
      { text: "floor", cn: "地板" },
    ], "u01_s0_h03.mp3"),
    sentence("s0_orig_4", "warm", "Grandpa can teach Chinese.", "爷爷会教语文。", [
      { text: "Grandpa", cn: "爷爷" },
      { text: "teach", cn: "教" },
      { text: "Chinese", cn: "语文" },
    ], "u01_s0_h04.mp3"),

    // ---- S2 句型 Can…help?（原文→补全→扩展）----
    sentence("s2_orig_1", "warm", "Can you help? Yes, I can. I can clean my room.", "你能帮忙吗？是的，我能。我能打扫我的房间。", [
      { text: "help", cn: "帮忙" },
      { text: "clean", cn: "打扫" },
      { text: "room", cn: "房间" },
    ], "u01_s2_orig01.mp3"),
    sentence("s2_comp_1", "new", "Can she help? Yes, she can. She can do some chores.", "她能帮忙吗？是的，她能。她会做家务。", [
      { text: "chores", cn: "家务" },
    ], "u01_s2_comp01.mp3"),
    sentence("s2_comp_2", "new", "Can he help? Yes, he can. He can sweep the floor.", "他能帮忙吗？是的，他能。他会扫地。", [
      { text: "sweep", cn: "扫" },
      { text: "floor", cn: "地板" },
    ], "u01_s2_comp02.mp3"),
    sentence("s2_ext_1", "drill", "Can they help? Yes, they can. They can cook dinner.", "他们能帮忙吗？是的，他们能。他们会做晚饭。", [
      { text: "cook", cn: "做饭" },
      { text: "dinner", cn: "晚饭" },
    ], "u01_s2_ext01.mp3"),
    sentence("s2_ext_2", "drill", "Can Dad help? Yes, he can. He can draw a picture.", "爸爸能帮忙吗？是的，他能。他会画画。", [
      { text: "Dad", cn: "爸爸" },
      { text: "draw", cn: "画画" },
      { text: "picture", cn: "图画" },
    ], "u01_s2_ext02.mp3"),

    // ---- S3 句型 What's …'s job?（原文→补全→扩展）----
    sentence("s3_orig_1", "warm", "What's your father's job? He's a factory worker.", "你爸爸做什么工作？他是工厂工人。", [
      { text: "father", cn: "爸爸" },
      { text: "job", cn: "工作" },
      { text: "factory worker", cn: "工厂工人" },
    ], "u01_s3_orig01.mp3"),
    sentence("s3_comp_1", "new", "What's your grandpa's job? He's a farmer.", "你爷爷做什么工作？他是农民。", [
      { text: "grandpa", cn: "爷爷" },
      { text: "farmer", cn: "农民" },
    ], "u01_s3_comp01.mp3"),
    sentence("s3_comp_2", "new", "What's your grandma's job? She's a nurse.", "你奶奶做什么工作？她是护士。", [
      { text: "grandma", cn: "奶奶" },
      { text: "nurse", cn: "护士" },
    ], "u01_s3_comp02.mp3"),
    sentence("s3_comp_3", "new", "What's your mother's job? She's an office worker.", "你妈妈做什么工作？她是办公室职员。", [
      { text: "mother", cn: "妈妈" },
      { text: "office worker", cn: "办公室职员" },
    ], "u01_s3_comp03.mp3"),
    sentence("s3_ext_1", "drill", "What's your uncle's job? He's a teacher.", "你叔叔做什么工作？他是老师。", [
      { text: "uncle", cn: "叔叔" },
      { text: "teacher", cn: "老师" },
    ], "u01_s3_ext01.mp3"),
    sentence("s3_ext_2", "drill", "What's your aunt's job? She's a writer.", "你阿姨做什么工作？她是作家。", [
      { text: "aunt", cn: "阿姨" },
      { text: "writer", cn: "作家" },
    ], "u01_s3_ext02.mp3"),
    sentence("s3_ext_3", "drill", "My father is a busy doctor.", "我爸爸是一位忙碌的医生。", [
      { text: "busy", cn: "忙碌的" },
      { text: "doctor", cn: "医生" },
    ], "u01_s3_ext03.mp3"),

    // ---- S4 句型 I can … and ….（原文→补全→扩展）----
    sentence("s4_orig_1", "warm", "What can we do for them? We can do some chores.", "我们能为他们做什么？我们可以做家务。", [
      { text: "chores", cn: "家务" },
    ], "u01_s4_orig01.mp3"),
    sentence("s4_comp_1", "new", "I can cook and clean the room.", "我会做饭和打扫房间。", [
      { text: "cook", cn: "做饭" },
      { text: "clean", cn: "打扫" },
      { text: "room", cn: "房间" },
    ], "u01_s4_comp01.mp3"),
    sentence("s4_comp_2", "new", "I can sweep the floor and make a gift.", "我会扫地和做礼物。", [
      { text: "sweep", cn: "扫" },
      { text: "floor", cn: "地板" },
      { text: "gift", cn: "礼物" },
    ], "u01_s4_comp02.mp3"),
    sentence("s4_ext_1", "drill", "I can cook for my family.", "我会为家人做饭。", [
      { text: "cook", cn: "做饭" },
      { text: "family", cn: "家人" },
    ], "u01_s4_ext01.mp3"),
    sentence("s4_ext_2", "drill", "We can draw pictures with my mum.", "我们会和妈妈一起画画。", [
      { text: "draw", cn: "画画" },
      { text: "pictures", cn: "图画" },
      { text: "mum", cn: "妈妈" },
    ], "u01_s4_ext02.mp3"),

    // ---- S6 语音 ch（原文→扩展）----
    sentence("s6_orig_1", "warm", "My grandpa can teach Chinese.", "我爷爷会教语文。", [
      { text: "teach", cn: "教" },
      { text: "Chinese", cn: "语文" },
    ], "u01_s6_orig01.mp3"),
    sentence("s6_orig_2", "warm", "He can make nice chairs.", "他会做好看的椅子。", [
      { text: "make", cn: "制作" },
      { text: "chairs", cn: "椅子" },
    ], "u01_s6_orig02.mp3"),
    sentence("s6_orig_3", "warm", "My grandma can make good lunches.", "我奶奶会做好吃的午饭。", [
      { text: "grandma", cn: "奶奶" },
      { text: "lunches", cn: "午饭" },
    ], "u01_s6_orig03.mp3"),
    sentence("s6_orig_4", "warm", "Her peaches are great!", "她的桃子很棒！", [
      { text: "peaches", cn: "桃子" },
    ], "u01_s6_orig04.mp3"),
    sentence("s6_ext_1", "drill", "The teacher teaches children in China.", "老师在中国教孩子们。", [
      { text: "teacher", cn: "老师" },
      { text: "children", cn: "孩子们" },
      { text: "China", cn: "中国" },
    ], "u01_s6_ext01.mp3"),
    sentence("s6_ext_2", "drill", "I eat lunch with my grandma in the kitchen.", "我和奶奶在厨房吃午饭。", [
      { text: "lunch", cn: "午饭" },
      { text: "kitchen", cn: "厨房" },
    ], "u01_s6_ext02.mp3"),

    // ---- S7 短文（原文→扩展→收尾）----
    sentence("s7_orig_1", "warm", "My mum is a writer.", "我妈妈是作家。", [
      { text: "mum", cn: "妈妈" },
      { text: "writer", cn: "作家" },
    ], "u01_s7_orig01.mp3"),
    sentence("s7_orig_2", "warm", "Mum is also a great cook.", "妈妈也是很棒的厨师。", [
      { text: "cook", cn: "厨师" },
    ], "u01_s7_orig02.mp3"),
    sentence("s7_orig_3", "warm", "Mum is very busy.", "妈妈很忙。", [
      { text: "busy", cn: "忙碌的" },
    ], "u01_s7_orig03.mp3"),
    sentence("s7_orig_4", "warm", "We can help her at home.", "我们可以在家里帮她。", [
      { text: "help", cn: "帮忙" },
      { text: "home", cn: "家" },
    ], "u01_s7_orig04.mp3"),
    sentence("s7_ext_1", "drill", "I want to help her at home.", "我想在家里帮她。", [
      { text: "want", cn: "想要" },
      { text: "help", cn: "帮忙" },
      { text: "home", cn: "家" },
    ], "u01_s7_ext01.mp3"),
    sentence("s7_ext_2", "drill", "I can sweep the floor and clean the room.", "我会扫地和打扫房间。", [
      { text: "sweep", cn: "扫" },
      { text: "clean", cn: "打扫" },
      { text: "room", cn: "房间" },
    ], "u01_s7_ext02.mp3"),
    sentence("s7_ext_3", "drill", "I love my family!", "我爱我的家人！", [
      { text: "love", cn: "爱" },
      { text: "family", cn: "家人" },
    ], "u01_s7_ext03.mp3"),
    // 收尾句：管线无独立音频，播放走浏览器朗读兜底
    sentence("s7_wrap_1", "wrap", "I love my family! We can help at home.", "我爱我的家人！我们能在家里帮忙。", [
      { text: "love", cn: "爱" },
      { text: "family", cn: "家人" },
      { text: "home", cn: "家" },
    ]),
  ];
}

/** 词卡：S1 vocab 全量 8 词 + 扩展层实词 2 词凑到 10 */
function buildWords(): WordCard[] {
  let seq = 0;
  const ip = (): IpKey => {
    const key = IP_KEYS[seq % IP_KEYS.length];
    seq += 1;
    return key;
  };
  const cards: [string, string][] = [
    ["farmer", "农民"],
    ["nurse", "护士"],
    ["doctor", "医生"],
    ["office worker", "办公室职员"],
    ["clean the room", "打扫房间"],
    ["sweep the floor", "扫地"],
    ["cook", "做饭"],
    ["do some chores", "做家务"],
    // 不足 ~10 时从扩展层句抽实词补足
    ["teacher", "老师"],
    ["writer", "作家"],
  ];
  return cards.map(([word, cn]) => ({ word, cn, ip: ip() }));
}

/** 点唱台：U01 无独立歌曲，用 S7 课文 4 句凑成歌词 */
function buildSong(): Song {
  return {
    id: "u01-song",
    title: "Helping at Home",
    cn: "家里的小帮手",
    lines: [
      { en: "My mum is a writer.", cn: "我妈妈是作家。" },
      { en: "Mum is also a great cook.", cn: "妈妈也是很棒的厨师。" },
      { en: "Mum is very busy.", cn: "妈妈很忙。" },
      { en: "We can help her at home.", cn: "我们可以在家里帮她。" },
    ],
  };
}

/** 能力自检：abilities A1-A4 → SkillCheck（remedy 按 retrain_segment 映射四环节） */
function buildSkills(): SkillCheck[] {
  const skills: Omit<SkillCheck, "id">[] = [
    {
      no: 1,
      name: "问一问家人的职业",
      demo: "What's your father's job? He's a factory worker.",
      task: "指着家庭树 grandpa/mum/uncle 三人，自己问 What's your ___'s job? 并自己答 He's/She's a/an ___.",
      remedy: { stage: "new", hint: "回到S3再练一练" },
    },
    {
      no: 2,
      name: "说说我和家人一起做的事",
      demo: "Can you help? Yes, I can. I can clean my room.",
      task: "看 3 张家庭活动图，用 We often ___. / I can ___. 说出 3 句.",
      remedy: { stage: "new", hint: "回到S2再练一练" },
    },
    {
      no: 3,
      name: "说说我能怎么帮家人",
      demo: "What can we do for them? We can do some chores.",
      task: "说出 I can ___ and ___. 至少 2 个组合.",
      remedy: { stage: "drill", hint: "回到S4再练一练" },
    },
    {
      no: 4,
      name: "读一读、拼一拼 ch 的单词",
      demo: "My grandpa can teach Chinese.",
      task: "指认 6 个 ch 词朗读 + 听写 3 个词",
      remedy: { stage: "new", hint: "回到S6再练一练" },
    },
  ];
  return skills.map((s, i) => ({ ...s, id: `u01-s${i + 1}` }));
}

/** 真实 U01：字段严格对齐 WebH5 的 Unit 类型 */
export const PIPELINE_U01: Unit = {
  id: "u1",
  no: 1,
  title: "Helping at home",
  cn: "家里的小帮手",
  theme: "说说和家人一起做的事、职业、能帮什么忙",
  cards: buildCards(),
  words: buildWords(),
  song: buildSong(),
  skills: buildSkills(),
};
