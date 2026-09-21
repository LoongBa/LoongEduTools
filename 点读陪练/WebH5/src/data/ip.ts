// 原创儿童 IP（6 个朋友角色）——扁平卡通 + 暖色调 + 圆角白底，不复制教材原版角色
// 插画已本地化到 public/ip/（自 CDN 下载），不随包离线分发依赖外链
export type IpKey = "leo" | "mia" | "sam" | "nana" | "kiki" | "bubu";

export interface IpCharacter {
  key: IpKey;
  name: string;
  cn: string;
  trait: string;
  image: string;
}

export const IP_CHARACTERS: IpCharacter[] = [
  {
    key: "leo",
    name: "Leo",
    cn: "小狮 Leo",
    trait: "爱开口，声音最响亮",
    image: "/ip/ip-leo.png",
  },
  {
    key: "mia",
    name: "Mia",
    cn: "小兔 Mia",
    trait: "听得认真，喜欢跟读",
    image: "/ip/ip-mia.png",
  },
  {
    key: "sam",
    name: "Sam",
    cn: "小熊 Sam",
    trait: "爱翻词卡，慢慢说清楚",
    image: "/ip/ip-sam.png",
  },
  {
    key: "nana",
    name: "Nana",
    cn: "小鸭 Nana",
    trait: "唱歌最开心",
    image: "/ip/ip-nana.png",
  },
  {
    key: "kiki",
    name: "Kiki",
    cn: "小猴 Kiki",
    trait: "动作快，爱表演句子",
    image: "/ip/ip-kiki.png",
  },
  {
    key: "bubu",
    name: "Bubu",
    cn: "熊猫 Bubu",
    trait: "会提醒孩子休息一下",
    image: "/ip/ip-bubu.png",
  },
];

export function ipOf(key: IpKey): IpCharacter {
  return IP_CHARACTERS.find((c) => c.key === key) ?? IP_CHARACTERS[0];
}
