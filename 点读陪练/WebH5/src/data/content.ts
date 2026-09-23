// 内容层：PEP 四上同步拓展练习（原创改写，不使用教材原版文本/角色/音频）
import type { IpKey } from "./ip";
import { PIPELINE_U01 } from "./u01Content";
import { PIPELINE_U02 } from "./u02Content";

export type Stage = "warm" | "new" | "drill" | "wrap";

export interface WordCard {
  word: string;
  cn: string;
  ip: IpKey;
  /** 管线配图的词卡图（public/units/uXX/images/*.webp）；缺省时回退 IP 角色头像 */
  image?: string;
  /** 管线 TTS 词卡音频（public/units/uXX/audio/*.mp3）；缺省时用浏览器朗读 */
  mp3?: string;
}

export interface SentenceCard {
  id: string;
  en: string;
  cn: string;
  ip: IpKey;
  /** 句中可单独点读的单词 */
  words: { text: string; cn: string }[];
  stage: Stage;
  /** 管线 TTS 生成的 mp3 文件名（public/units/u01/audio/ 下）；缺省时用浏览器朗读兜底 */
  mp3?: string;
}

export interface SongLine {
  en: string;
  cn: string;
  /** 管线 TTS 音频（public/units/uXX/audio/*.mp3）；缺省时用浏览器朗读 */
  audio?: string;
}

/** 歌曲形态：lines=逐句 TTS（旧模式）；original_song=原创儿歌整曲；textbook_lyrics=教材歌词逐句 */
export type SongKind = "lines" | "original_song" | "textbook_lyrics";

export interface Song {
  id: string;
  title: string;
  cn: string;
  /** 歌曲形态（默认 "lines"：逐句 TTS） */
  kind?: SongKind;
  /** 逐句歌词（所有形态都有；整曲模式下用于歌词展示） */
  lines: SongLine[];
  /** original_song：整曲人声 mp3（public/units/uXX/song/*.mp3） */
  audio?: string;
  /** original_song：卡拉OK伴奏 mp3 */
  instrumental?: string;
  /** 整曲时长（秒） */
  duration?: number;
  /** original_song：每句时间戳（与 lines 对齐；无则退化为逐句播放） */
  timeline?: { start: number; end: number }[];
}

/** public/units/uXX/song/song.json 原始结构（与歌曲生产 SOP 对齐） */
export interface SongJson {
  title?: string;
  unit?: string;
  type?: "original_song" | "textbook_lyrics";
  audio_type?: string;
  audio?: string;
  instrumental?: string;
  duration?: number;
  lyrics?: {
    en?: string;
    zh?: string;
    start?: number;
    end?: number;
    audio?: string;
  }[];
  /** 教材歌词跟读（并行任务产出）：逐句 TTS，audio 为 textbook/ 下相对路径 */
  lines?: {
    en?: string;
    zh?: string;
    audio?: string;
    chant_id?: string;
  }[];
  chants?: { id?: string; name?: string; line_count?: number }[];
}

export interface SkillCheck {
  id: string;
  no: number;
  name: string;
  demo: string;
  task: string;
  /** 「需要帮助」时映射的补练位置 */
  remedy: { stage: Stage; hint: string };
}

export interface Unit {
  id: string;
  no: number;
  title: string;
  cn: string;
  theme: string;
  cards: SentenceCard[];
  words: WordCard[];
  /** 主歌（原创儿歌优先；无则教材跟读）。点唱台列表请用 songs ?? [song] */
  song: Song;
  /** 完整歌曲列表（原创儿歌 + 教材跟读，并行任务的点唱台产物） */
  songs?: Song[];
  skills: SkillCheck[];
}

const STAGE_LABEL: Record<Stage, string> = {
  warm: "开场复习",
  new: "新学",
  drill: "巩固",
  wrap: "收尾",
};

export const STAGES: Stage[] = ["warm", "new", "drill", "wrap"];

export function stageLabel(s: Stage) {
  return STAGE_LABEL[s];
}

/** 句中一个可点读（或纯空白）的片段 */
export interface SentencePart {
  text: string;
  clickable: boolean;
  cn?: string;
  /** 单词点读走管线 mp3（public/units/uXX/audio/*.mp3）；缺省时回退设备朗读 */
  mp3?: string;
}

/** 句中可单独点读的单词（含可选 mp3） */
export interface SentenceWord {
  text: string;
  cn: string;
  mp3?: string;
}

/** 把英文句子切成可逐词点读的片段；命中 words[] 的片段会带上中文释义与 mp3 */
export function splitSentence(
  en: string,
  words: SentenceWord[] = [],
): SentencePart[] {
  // 词组（如 each other / pencil case）以空格连接，取首词做索引；
  // 含空格的键不参与回填，避免把 other 这类碎片标成词组释义
  const dict = new Map<string, { cn?: string; mp3?: string }>();
  words.forEach((w) => {
    const head = w.text.toLowerCase().split(" ")[0];
    if (!w.text.includes(" ") && !dict.has(head)) dict.set(head, { cn: w.cn, mp3: w.mp3 });
  });

  return en.split(/(\s+)/).flatMap<SentencePart>((piece) => {
    if (/^\s+$/.test(piece)) return [{ text: piece, clickable: false }];
    const bare = piece.replace(/[.,!?;:]/g, "");
    if (!bare) return [{ text: piece, clickable: false }];
    const hit = dict.get(bare.toLowerCase());
    return [{ text: piece, clickable: true, ...(hit?.cn ? { cn: hit.cn } : {}), ...(hit?.mp3 ? { mp3: hit.mp3 } : {}) }];
  });
}

/** 固定乱序：连线题右列不能与左列同序，否则等于送分 */
export function shuffled<T>(list: T[], seed: number): T[] {
  const out = [...list];
  let s = seed * 9301 + 49297;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function card(
  id: string,
  stage: Stage,
  ip: IpKey,
  en: string,
  cn: string,
  words: { text: string; cn: string }[],
): SentenceCard {
  return { id, stage, ip, en, cn, words };
}

// 真实 U01 之外的 5 个示例占位单元（保留以便恢复）；正式内容逐单元接入后移除
const EXAMPLE_UNITS: Unit[] = [
  {
    id: "u1",
    no: 1,
    title: "My Classroom",
    cn: "我们的教室",
    theme: "说说教室里有什么",
    cards: [
      card("u1-1", "warm", "sam", "This is our classroom.", "这是我们的教室。", [
        { text: "classroom", cn: "教室" },
      ]),
      card("u1-2", "warm", "mia", "I see a blackboard and two doors.", "我看到一块黑板和两扇门。", [
        { text: "blackboard", cn: "黑板" },
        { text: "doors", cn: "门" },
      ]),
      card("u1-3", "new", "leo", "Where is my schoolbag?", "我的书包在哪里？", [
        { text: "schoolbag", cn: "书包" },
      ]),
      card("u1-4", "new", "leo", "It is near the window.", "它在窗户旁边。", [
        { text: "near", cn: "在……旁边" },
        { text: "window", cn: "窗户" },
      ]),
      card("u1-5", "new", "kiki", "Let's clean the desks and chairs.", "我们来擦桌子和椅子吧。", [
        { text: "clean", cn: "擦干净" },
        { text: "desks", cn: "桌子" },
        { text: "chairs", cn: "椅子" },
      ]),
      card("u1-6", "drill", "nana", "Put the light under the picture.", "把灯放在图画下面。", [
        { text: "light", cn: "灯" },
        { text: "picture", cn: "图画" },
      ]),
      card("u1-7", "drill", "bubu", "The fan is on the wall.", "风扇在墙上。", [
        { text: "fan", cn: "风扇" },
        { text: "wall", cn: "墙" },
      ]),
      card("u1-8", "wrap", "mia", "Our classroom is clean and bright.", "我们的教室又干净又明亮。", [
        { text: "clean", cn: "干净的" },
        { text: "bright", cn: "明亮的" },
      ]),
    ],
    words: [
      { word: "classroom", cn: "教室", ip: "sam" },
      { word: "blackboard", cn: "黑板", ip: "leo" },
      { word: "window", cn: "窗户", ip: "mia" },
      { word: "door", cn: "门", ip: "kiki" },
      { word: "desk", cn: "桌子", ip: "nana" },
      { word: "chair", cn: "椅子", ip: "bubu" },
      { word: "schoolbag", cn: "书包", ip: "leo" },
      { word: "light", cn: "灯", ip: "mia" },
      { word: "picture", cn: "图画", ip: "sam" },
      { word: "wall", cn: "墙", ip: "kiki" },
      { word: "fan", cn: "风扇", ip: "nana" },
      { word: "clean", cn: "打扫干净", ip: "bubu" },
    ],
    song: {
      id: "u1-song",
      title: "Where Is My Schoolbag?",
      cn: "我的书包在哪里",
      lines: [
        { en: "Where is my schoolbag?", cn: "我的书包在哪里？" },
        { en: "It is under the chair.", cn: "它在椅子下面。" },
        { en: "Where is your blue pen?", cn: "你的蓝笔在哪里？" },
        { en: "It is on the desk.", cn: "它在桌子上。" },
        { en: "Clean the window, wipe the door,", cn: "擦擦窗户擦擦门，" },
        { en: "our classroom, tidy and fair!", cn: "我们的教室真整齐！" },
      ],
    },
    skills: [
      {
        id: "u1-s1",
        no: 1,
        name: "说出教室里的东西",
        demo: "I see a blackboard and two doors.",
        task: "指着家里的一个地方，说 3 句「I see a …」。",
        remedy: { stage: "warm", hint: "回到开场复习的第 1、2 张句卡再听一遍。" },
      },
      {
        id: "u1-s2",
        no: 2,
        name: "用 near / on / under 说位置",
        demo: "It is near the window.",
        task: "拿一个小物件，换三个位置各说一句。",
        remedy: { stage: "new", hint: "回到新学第 4 张与巩固第 6、7 张句卡。" },
      },
      {
        id: "u1-s3",
        no: 3,
        name: "问一句「Where is …?」",
        demo: "Where is my schoolbag?",
        task: "主动问家长两句「Where is …?»，并回答对方。",
        remedy: { stage: "new", hint: "回到新学第 3 张句卡，配合点唱台第一段歌词。" },
      },
      {
        id: "u1-s4",
        no: 4,
        name: "说一句夸教室的话",
        demo: "Our classroom is clean and bright.",
        task: "用自己的话说一句「我的房间是 …」。",
        remedy: { stage: "wrap", hint: "回到收尾第 8 张句卡，跟读两遍。" },
      },
    ],
  },
  {
    id: "u2",
    no: 2,
    title: "My Friends",
    cn: "我的朋友",
    theme: "描述朋友的样子和爱好",
    cards: [
      card("u2-1", "warm", "leo", "He is tall and strong.", "他又高又壮。", [
        { text: "tall", cn: "高的" },
        { text: "strong", cn: "强壮的" },
      ]),
      card("u2-2", "warm", "mia", "She has big eyes and long hair.", "她有大眼睛和长头发。", [
        { text: "eyes", cn: "眼睛" },
        { text: "hair", cn: "头发" },
      ]),
      card("u2-3", "new", "sam", "My friend is quiet.", "我的朋友很安静。", [
        { text: "quiet", cn: "安静的" },
      ]),
      card("u2-4", "new", "kiki", "He has glasses and a friendly smile.", "他戴眼镜，笑容友好。", [
        { text: "glasses", cn: "眼镜" },
        { text: "smile", cn: "微笑" },
      ]),
      card("u2-5", "new", "nana", "She likes reading and playing football.", "她喜欢读书和踢足球。", [
        { text: "reading", cn: "读书" },
        { text: "football", cn: "足球" },
      ]),
      card("u2-6", "drill", "bubu", "Who is that boy with a red cap?", "那个戴红帽子的男孩是谁？", [
        { text: "boy", cn: "男孩" },
        { text: "cap", cn: "帽子" },
      ]),
      card("u2-7", "drill", "leo", "We help each other every day.", "我们每天互相帮助。", [
        { text: "help", cn: "帮助" },
        { text: "each other", cn: "互相" },
      ]),
      card("u2-8", "wrap", "mia", "A good friend is kind and funny.", "好朋友善良又有趣。", [
        { text: "kind", cn: "善良的" },
        { text: "funny", cn: "有趣的" },
      ]),
    ],
    words: [
      { word: "tall", cn: "高的", ip: "leo" },
      { word: "short", cn: "矮的", ip: "bubu" },
      { word: "strong", cn: "强壮的", ip: "leo" },
      { word: "quiet", cn: "安静的", ip: "sam" },
      { word: "friendly", cn: "友好的", ip: "mia" },
      { word: "glasses", cn: "眼镜", ip: "sam" },
      { word: "hair", cn: "头发", ip: "mia" },
      { word: "smile", cn: "微笑", ip: "kiki" },
      { word: "football", cn: "足球", ip: "nana" },
      { word: "reading", cn: "读书", ip: "sam" },
      { word: "kind", cn: "善良的", ip: "bubu" },
      { word: "funny", cn: "有趣的", ip: "kiki" },
    ],
    song: {
      id: "u2-song",
      title: "My Friend Is Kind",
      cn: "我的朋友很善良",
      lines: [
        { en: "My friend is kind, my friend is true,", cn: "我的朋友善良又真诚，" },
        { en: "he helps me in everything I do.", cn: "他做什么都帮着我。" },
        { en: "Tall or short, or big or small,", cn: "高个矮个，大块小块，" },
        { en: "my best friend smiles through it all!", cn: "我最好的朋友总是笑！" },
      ],
    },
    skills: [
      {
        id: "u2-s1",
        no: 1,
        name: "描述一个新朋友的样子",
        demo: "He has glasses and a friendly smile.",
        task: "看一张新人物图，自己说 3 句描述。",
        remedy: { stage: "new", hint: "回到新学第 3、4 张句卡，先跟读再说。" },
      },
      {
        id: "u2-s2",
        no: 2,
        name: "说朋友的爱好",
        demo: "She likes reading and playing football.",
        task: "说一句你和你朋友各自喜欢什么。",
        remedy: { stage: "new", hint: "回到新学第 5 张句卡，换词替换练习。" },
      },
      {
        id: "u2-s3",
        no: 3,
        name: "组合句表达（外貌 + 性格）",
        demo: "He is tall and strong. He is friendly too.",
        task: "把两句话合成一段，说给家长听。",
        remedy: { stage: "drill", hint: "回到巩固第 6、7 张句卡，再补一次收尾第 8 张。" },
      },
      {
        id: "u2-s4",
        no: 4,
        name: "问「Who is …?」",
        demo: "Who is that boy with a red cap?",
        task: "问家长两句 Who is…，并回答一句。",
        remedy: { stage: "drill", hint: "回到巩固第 6 张句卡，配合点唱台第二段。" },
      },
    ],
  },
  {
    id: "u3",
    no: 3,
    title: "My Schoolbag",
    cn: "我的书包",
    theme: "数一数、说一说书包里有什么",
    cards: [
      card("u3-1", "warm", "nana", "What is in my schoolbag?", "我的书包里有什么？", [
        { text: "schoolbag", cn: "书包" },
      ]),
      card("u3-2", "warm", "sam", "I have three books and one pencil case.", "我有三本书和一个铅笔盒。", [
        { text: "books", cn: "书" },
        { text: "pencil case", cn: "铅笔盒" },
      ]),
      card("u3-3", "new", "kiki", "How many rulers do you have?", "你有几把尺子？", [
        { text: "rulers", cn: "尺子" },
      ]),
      card("u3-4", "new", "leo", "I have two. Do you want one?", "我有两把。你想要一把吗？", [
        { text: "two", cn: "两个" },
        { text: "want", cn: "想要" },
      ]),
      card("u3-5", "new", "mia", "My storybook is next to the keys.", "我的故事书就在钥匙旁边。", [
        { text: "storybook", cn: "故事书" },
        { text: "keys", cn: "钥匙" },
      ]),
      card("u3-6", "drill", "bubu", "An English book, a maths book and a candy.", "一本英语书、一本数学书和一颗糖。", [
        { text: "English", cn: "英语" },
        { text: "maths", cn: "数学" },
        { text: "candy", cn: "糖果" },
      ]),
      card("u3-7", "drill", "nana", "Open your bag and show me, please.", "请打开书包给我看看。", [
        { text: "open", cn: "打开" },
        { text: "show", cn: "给……看" },
      ]),
      card("u3-8", "wrap", "sam", "Everything is in the right place.", "每样东西都在该在的位置。", [
        { text: "everything", cn: "每样东西" },
        { text: "place", cn: "位置" },
      ]),
    ],
    words: [
      { word: "schoolbag", cn: "书包", ip: "nana" },
      { word: "book", cn: "书", ip: "sam" },
      { word: "pencil", cn: "铅笔", ip: "kiki" },
      { word: "pen", cn: "钢笔", ip: "leo" },
      { word: "ruler", cn: "尺子", ip: "mia" },
      { word: "eraser", cn: "橡皮", ip: "bubu" },
      { word: "crayon", cn: "蜡笔", ip: "kiki" },
      { word: "key", cn: "钥匙", ip: "nana" },
      { word: "candy", cn: "糖果", ip: "leo" },
      { word: "notebook", cn: "笔记本", ip: "sam" },
      { word: "storybook", cn: "故事书", ip: "mia" },
      { word: "maths book", cn: "数学书", ip: "bubu" },
    ],
    song: {
      id: "u3-song",
      title: "One, Two, Three Books",
      cn: "一二三，数书本",
      lines: [
        { en: "One, two, three books in my bag,", cn: "一、二、三，三本书在我包里，" },
        { en: "four, five rulers — what a drag!", cn: "四把五把尺子——真调皮！" },
        { en: "Zip it up and carry it high,", cn: "拉上拉链，把它举高高，" },
        { en: "my schoolbag is light, oh my!", cn: "我的书包好轻呀，哇！" },
      ],
    },
    skills: [
      {
        id: "u3-s1",
        no: 1,
        name: "数出书包里的东西",
        demo: "I have three books and one pencil case.",
        task: "整理一次书包，边理边说数量。",
        remedy: { stage: "warm", hint: "回到开场复习第 2 张句卡，跟读两遍。" },
      },
      {
        id: "u3-s2",
        no: 2,
        name: "问 How many …?",
        demo: "How many rulers do you have?",
        task: "问家长两次数量的问题，并回答一次。",
        remedy: { stage: "new", hint: "回到新学第 3、4 张句卡。" },
      },
      {
        id: "u3-s3",
        no: 3,
        name: "说清物品的位置",
        demo: "My storybook is next to the keys.",
        task: "把三样东西摆好，各说一句它在哪。",
        remedy: { stage: "new", hint: "回到新学第 5 张与巩固第 7 张句卡。" },
      },
      {
        id: "u3-s4",
        no: 4,
        name: "收拾并说明整理好了",
        demo: "Everything is in the right place.",
        task: "收拾完书包后说一句英文总结。",
        remedy: { stage: "wrap", hint: "回到收尾第 8 张句卡，跟读一遍。" },
      },
    ],
  },
  {
    id: "u4",
    no: 4,
    title: "My Home",
    cn: "我的家",
    theme: "介绍家里的房间",
    cards: [
      card("u4-1", "warm", "leo", "This is my home. It is small but warm.", "这是我的家，它小但很暖。", [
        { text: "home", cn: "家" },
        { text: "warm", cn: "温暖的" },
      ]),
      card("u4-2", "warm", "mia", "In the living room, we watch and talk.", "在客厅里，我们看电视、聊天。", [
        { text: "living room", cn: "客厅" },
        { text: "watch", cn: "看" },
      ]),
      card("u4-3", "new", "sam", "Is this the kitchen? Yes, it is.", "这是厨房吗？是的。", [
        { text: "kitchen", cn: "厨房" },
      ]),
      card("u4-4", "new", "nana", "Dinner is ready. Come and eat!", "晚饭好了，快来吃！", [
        { text: "dinner", cn: "晚饭" },
        { text: "ready", cn: "准备好的" },
      ]),
      card("u4-5", "new", "kiki", "My bedroom has a soft bed and a lamp.", "我的卧室有软软的床和一盏灯。", [
        { text: "bedroom", cn: "卧室" },
        { text: "lamp", cn: "台灯" },
      ]),
      card("u4-6", "drill", "bubu", "The cat is behind the door.", "猫在门后面。", [
        { text: "cat", cn: "猫" },
        { text: "behind", cn: "在……后面" },
      ]),
      card("u4-7", "drill", "leo", "Where is Dad? He is in the study.", "爸爸在哪？他在书房。", [
        { text: "study", cn: "书房" },
      ]),
      card("u4-8", "wrap", "mia", "I love my home and my family.", "我爱我的家和我的家人。", [
        { text: "love", cn: "爱" },
        { text: "family", cn: "家人" },
      ]),
    ],
    words: [
      { word: "home", cn: "家", ip: "leo" },
      { word: "living room", cn: "客厅", ip: "mia" },
      { word: "kitchen", cn: "厨房", ip: "sam" },
      { word: "bedroom", cn: "卧室", ip: "kiki" },
      { word: "study", cn: "书房", ip: "bubu" },
      { word: "bathroom", cn: "卫生间", ip: "nana" },
      { word: "bed", cn: "床", ip: "bubu" },
      { word: "lamp", cn: "台灯", ip: "kiki" },
      { word: "sofa", cn: "沙发", ip: "mia" },
      { word: "fridge", cn: "冰箱", ip: "sam" },
      { word: "dinner", cn: "晚饭", ip: "nana" },
      { word: "family", cn: "家人", ip: "leo" },
    ],
    song: {
      id: "u4-song",
      title: "Rooms in My Home",
      cn: "我家的房间",
      lines: [
        { en: "Kitchen, bedroom, living room too,", cn: "厨房、卧室，还有客厅，" },
        { en: "this is my home, and this is you!", cn: "这是我的家，这个是你是你！" },
        { en: "Knock, knock, knock — come in, please,", cn: "咚咚咚——请进，" },
        { en: "dinner is ready, yum, yum, cheese!", cn: "晚饭好啦，嗯，奶酪真香！" },
      ],
    },
    skills: [
      {
        id: "u4-s1",
        no: 1,
        name: "介绍家里的房间",
        demo: "This is my home. It is small but warm.",
        task: "带家长走一圈家里，每个房间说一句英文。",
        remedy: { stage: "warm", hint: "回到开场复习第 1、2 张句卡。" },
      },
      {
        id: "u4-s2",
        no: 2,
        name: "问答「Is this the …?»",
        demo: "Is this the kitchen? Yes, it is.",
        task: "玩一次指认游戏，问三次答三次。",
        remedy: { stage: "new", hint: "回到新学第 3 张句卡，换房间名替换。" },
      },
      {
        id: "u4-s3",
        no: 3,
        name: "说人在哪个房间",
        demo: "Where is Dad? He is in the study.",
        task: "说一句家人此刻在哪个房间。",
        remedy: { stage: "drill", hint: "回到巩固第 6、7 张句卡。" },
      },
      {
        id: "u4-s4",
        no: 4,
        name: "表达对家的感受",
        demo: "I love my home and my family.",
        task: "用自己的话说一句喜欢家里的什么。",
        remedy: { stage: "wrap", hint: "回到收尾第 8 张句卡，跟读一遍。" },
      },
    ],
  },
  {
    id: "u5",
    no: 5,
    title: "Food We Like",
    cn: "我们喜欢的食物",
    theme: "点餐与表达喜好",
    cards: [
      card("u5-1", "warm", "nana", "Would you like some noodles?", "你想要些面条吗？", [
        { text: "noodles", cn: "面条" },
      ]),
      card("u5-2", "warm", "leo", "Yes, please. I would like some soup.", "好的，我想要些汤。", [
        { text: "soup", cn: "汤" },
      ]),
      card("u5-3", "new", "sam", "I like beef but I don't like chicken.", "我喜欢牛肉，不喜欢鸡肉。", [
        { text: "beef", cn: "牛肉" },
        { text: "chicken", cn: "鸡肉" },
      ]),
      card("u5-4", "new", "mia", "Have some vegetables. They are good for you.", "吃点蔬菜吧，它们对你好。", [
        { text: "vegetables", cn: "蔬菜" },
      ]),
      card("u5-5", "new", "kiki", "What would you like for dinner?", "你晚饭想吃什么？", [
        { text: "dinner", cn: "晚饭" },
      ]),
      card("u5-6", "drill", "bubu", "Pass me the bowl and the chopsticks, please.", "请把碗和筷子递给我。", [
        { text: "bowl", cn: "碗" },
        { text: "chopsticks", cn: "筷子" },
      ]),
      card("u5-7", "drill", "nana", "The milk is cold. Can I have warm milk?", "牛奶凉了，我能要温的吗？", [
        { text: "milk", cn: "牛奶" },
        { text: "cold", cn: "凉的" },
      ]),
      card("u5-8", "wrap", "leo", "Thank you for the yummy dinner!", "谢谢这顿美味的晚饭！", [
        { text: "yummy", cn: "美味的" },
        { text: "thank", cn: "感谢" },
      ]),
    ],
    words: [
      { word: "rice", cn: "米饭", ip: "bubu" },
      { word: "noodles", cn: "面条", ip: "nana" },
      { word: "beef", cn: "牛肉", ip: "leo" },
      { word: "chicken", cn: "鸡肉", ip: "kiki" },
      { word: "fish", cn: "鱼", ip: "mia" },
      { word: "egg", cn: "鸡蛋", ip: "sam" },
      { word: "soup", cn: "汤", ip: "nana" },
      { word: "milk", cn: "牛奶", ip: "mia" },
      { word: "bread", cn: "面包", ip: "sam" },
      { word: "vegetables", cn: "蔬菜", ip: "bubu" },
      { word: "bowl", cn: "碗", ip: "kiki" },
      { word: "chopsticks", cn: "筷子", ip: "leo" },
    ],
    song: {
      id: "u5-song",
      title: "Yummy, Yummy Dinner",
      cn: "美味晚餐歌",
      lines: [
        { en: "Rice and noodles, beef and fish,", cn: "米饭面条，牛肉和鱼，" },
        { en: "vegetables make you strong and quick!", cn: "蔬菜让你更强更快！" },
        { en: "Pass the bowl and pass the spoon,", cn: "递过碗来递过勺，" },
        { en: "thank you, thank you — dinner's done!", cn: "谢谢你谢谢你——吃完啦！" },
      ],
    },
    skills: [
      {
        id: "u5-s1",
        no: 1,
        name: "礼貌地要食物",
        demo: "I would like some soup.",
        task: "晚饭前用英文说要吃的两样东西。",
        remedy: { stage: "warm", hint: "回到开场复习第 1、2 张句卡。" },
      },
      {
        id: "u5-s2",
        no: 2,
        name: "说出喜欢与不喜欢",
        demo: "I like beef but I don't like chicken.",
        task: "说三样喜欢、两样不喜欢的食物。",
        remedy: { stage: "new", hint: "回到新学第 3 张句卡，做替换练习。" },
      },
      {
        id: "u5-s3",
        no: 3,
        name: "用餐时请求递东西",
        demo: "Pass me the bowl and the chopsticks, please.",
        task: "吃饭时真实地说一次「please」。",
        remedy: { stage: "drill", hint: "回到巩固第 6 张句卡。" },
      },
      {
        id: "u5-s4",
        no: 4,
        name: "表达感谢",
        demo: "Thank you for the yummy dinner!",
        task: "饭后对做饭的人说一句英文感谢。",
        remedy: { stage: "wrap", hint: "回到收尾第 8 张句卡，跟读一遍。" },
      },
    ],
  },
  {
    id: "u6",
    no: 6,
    title: "Jobs and Places",
    cn: "职业与场所",
    theme: "说说别人在哪里做什么",
    cards: [
      card("u6-1", "warm", "sam", "My aunt is a doctor. She helps people.", "我阿姨是医生，她帮助别人。", [
        { text: "doctor", cn: "医生" },
        { text: "helps", cn: "帮助" },
      ]),
      card("u6-2", "warm", "mia", "He is a driver. He drives a bus.", "他是司机，他开公交车。", [
        { text: "driver", cn: "司机" },
        { text: "bus", cn: "公交车" },
      ]),
      card("u6-3", "new", "leo", "Where does a cook work? In the kitchen.", "厨师在哪里工作？在厨房。", [
        { text: "cook", cn: "厨师" },
        { text: "kitchen", cn: "厨房" },
      ]),
      card("u6-4", "new", "kiki", "The nurse works at the hospital.", "护士在医院工作。", [
        { text: "nurse", cn: "护士" },
        { text: "hospital", cn: "医院" },
      ]),
      card("u6-5", "new", "nana", "What do you want to be? A farmer!", "你想做什么工作？农民！", [
        { text: "farmer", cn: "农民" },
      ]),
      card("u6-6", "drill", "bubu", "The police officer keeps us safe.", "警察保护我们的安全。", [
        { text: "police officer", cn: "警察" },
        { text: "safe", cn: "安全的" },
      ]),
      card("u6-7", "drill", "sam", "People work hard in the fields and offices.", "人们在田里和办公室里辛苦工作。", [
        { text: "fields", cn: "田地" },
        { text: "offices", cn: "办公室" },
      ]),
      card("u6-8", "wrap", "mia", "Every job is important. Thank you all!", "每份工作都很重要。谢谢你们！", [
        { text: "important", cn: "重要的" },
      ]),
    ],
    words: [
      { word: "doctor", cn: "医生", ip: "sam" },
      { word: "nurse", cn: "护士", ip: "mia" },
      { word: "driver", cn: "司机", ip: "leo" },
      { word: "cook", cn: "厨师", ip: "nana" },
      { word: "farmer", cn: "农民", ip: "bubu" },
      { word: "teacher", cn: "老师", ip: "kiki" },
      { word: "police officer", cn: "警察", ip: "leo" },
      { word: "worker", cn: "工人", ip: "sam" },
      { word: "hospital", cn: "医院", ip: "mia" },
      { word: "factory", cn: "工厂", ip: "bubu" },
      { word: "farm", cn: "农场", ip: "nana" },
      { word: "office", cn: "办公室", ip: "kiki" },
    ],
    song: {
      id: "u6-song",
      title: "What Do You Do?",
      cn: "你做什么工作",
      lines: [
        { en: "Doctor, driver, farmer too,", cn: "医生、司机，还有农民，" },
        { en: "cooks and nurses help me, help you!", cn: "厨师和护士帮助大家！" },
        { en: "Where do you work? Here, over there!", cn: "你在哪工作？这里，那里！" },
        { en: "every job is work of care!", cn: "每份用心做的工作都了不起！" },
      ],
    },
    skills: [
      {
        id: "u6-s1",
        no: 1,
        name: "说出家人的职业",
        demo: "My aunt is a doctor. She helps people.",
        task: "说两位家人的职业和他们做什么。",
        remedy: { stage: "warm", hint: "回到开场复习第 1、2 张句卡。" },
      },
      {
        id: "u6-s2",
        no: 2,
        name: "问答工作地点",
        demo: "Where does a cook work? In the kitchen.",
        task: "自问自答三个职业的工作地点。",
        remedy: { stage: "new", hint: "回到新学第 3、4 张句卡。" },
      },
      {
        id: "u6-s3",
        no: 3,
        name: "说自己的愿望",
        demo: "What do you want to be? A farmer!",
        task: "说一句自己长大后想做什么。",
        remedy: { stage: "new", hint: "回到新学第 5 张句卡，配合点唱台第三段。" },
      },
      {
        id: "u6-s4",
        no: 4,
        name: "评价一份工作",
        demo: "Every job is important.",
        task: "选一种工作，说一句它为什么重要。",
        remedy: { stage: "drill", hint: "回到巩固第 6、7 张句卡与收尾第 8 张。" },
      },
    ],
  },
];

/** 全部单元：运行时目录（catalog）优先；loadCatalog 前用示例占位（dev/离线无 manifest 降级）。
 *  用 let + 活绑定：main.tsx await loadCatalog() 后，各 import 点自动拿到 catalog 数据。 */
export let UNITS: Unit[] = [PIPELINE_U01, PIPELINE_U02, ...EXAMPLE_UNITS.filter((u) => u.id !== "u1" && u.id !== "u2")];

/** 首页/词卡/打印可选择的真实单元行（catalog 加载后自动来自 manifest） */
export interface UnitRow {
  id: string;
  no: number;
  title: string;
  cn: string;
}

export let UNIT_ROWS: UnitRow[] = [
  { id: PIPELINE_U01.id, no: PIPELINE_U01.no, title: PIPELINE_U01.title, cn: PIPELINE_U01.cn },
  { id: PIPELINE_U02.id, no: PIPELINE_U02.no, title: PIPELINE_U02.title, cn: PIPELINE_U02.cn },
];

export let TOTAL_WORDS = PIPELINE_U01.words.length + PIPELINE_U02.words.length;

export function unitOf(id: string): Unit {
  return UNITS.find((u) => u.id === id) ?? PIPELINE_U01;
}

// ---------------------------------------------------------------------------
// 运行时目录加载（catalog）：消灭单元硬编码
//  - fetch("units/manifest.json") → 册级+单元清单（离线自动匹配打包内容）
//  - fetch("units/<id>/content.json") → 内容包 JSON → contentToUnit() → Unit
//  - manifest/content 缺失（如纯代码 dev）→ 保持内置示例降级
// ---------------------------------------------------------------------------
import { contentToUnit, songJsonToSong, type ContentPackage } from "./fromContent";

export interface ManifestUnit {
  id: string;
  no: number;
  title: string;
  cn: string;
}

export interface ManifestGrade {
  grade_code: string;
  grade_label: string;
  units: ManifestUnit[];
}

export interface Manifest {
  schema: string;
  grades: ManifestGrade[];
}

export let MANIFEST: Manifest | null = null;

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/** 预加载目录：manifest → 各单元内容包 → 更新 UNITS/UNIT_ROWS/TOTAL_WORDS。失败静默降级。 */
export async function loadCatalog(): Promise<void> {
  const manifest = await fetchJson<Manifest>("units/manifest.json");
  if (!manifest || manifest.grades.length === 0) return; // 无 manifest：保持示例降级

  const units: Unit[] = [];
  for (const grade of manifest.grades) {
    for (const mu of grade.units) {
      const pkg = await fetchJson<ContentPackage>(`units/${mu.id}/content.json`);
      if (!pkg) continue;
      const unit = contentToUnit(pkg, mu.id, mu.no);
      // 点唱台歌曲：song.json（原创儿歌）+ textbook_lyrics.json（教材跟读）
      const [songJson, tbJson] = await Promise.all([
        fetchJson<SongJson>(`units/${mu.id}/song/song.json`),
        fetchJson<SongJson>(`units/${mu.id}/song/textbook_lyrics.json`),
      ]);
      const songs: Song[] = [];
      if (songJson && (songJson.audio || (songJson.lyrics?.length ?? 0) > 0)) {
        songs.push(songJsonToSong(songJson, mu.id));
      }
      if (tbJson && (tbJson.lines?.length ?? 0) > 0) {
        songs.push(songJsonToSong(tbJson, mu.id));
      }
      if (songs.length > 0) {
        unit.songs = songs;
        unit.song = songs.find((s) => s.kind === "original_song") ?? songs[0];
      }
      units.push(unit);
    }
  }
  if (units.length === 0) return; // 全缺内容包：保持降级

  MANIFEST = manifest;
  UNITS = units;
  UNIT_ROWS = units.map((u) => ({ id: u.id, no: u.no, title: u.title, cn: u.cn }));
  TOTAL_WORDS = units.reduce((n, u) => n + u.words.length, 0);
}

export function cardsByStage(unit: Unit, stage: Stage): SentenceCard[] {
  return unit.cards.filter((c) => c.stage === stage);
}

/** 当前册标签（如 "四年级上册"）。无 manifest 时降级默认册（四上）。 */
export function gradeLabelFor(): string {
  const label = MANIFEST?.grades?.[0]?.grade_label;
  if (!label) return "四年级上册";
  // manifest 存 "四年级上"，展示补 "册" 字
  return /上|下$/.test(label) ? `${label}册` : label;
}

/** 本册 5 个陪练日的主题（U01 两周制日程，读 05_schedule.json 含义） */
export const DAY_TITLES = [
  "一起做的事/新学家务词",
  "Can...help? 问与答",
  "问家人的职业",
  "我能做的事连起来说",
  "ch 语音+短文读一读",
];
