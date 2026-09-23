// 学习数据提交信封（在线版可选能力；离线容器禁网络、不打包此模块）。
// 最小化红线：只含学习统计，无任何身份信息；clientId 为本地随机匿名标识，清空进度时一并删除。
import type { ProgressState, SelfRating } from "./store";

export interface ProgressStats {
  totalDays: number;
  streak: number;
  collected: number;
  totalWords: number;
  unitsDone: number;
}

export interface SubmitEnvelope {
  schema: "progress.submit@1";
  /** 匿名客户端标识（本地随机，非标识真人） */
  clientId: string;
  submittedAt: string; // ISO8601 带时区
  appVersion: string; // 复用 version.ts APP_VERSION
  dataStamp: string; // 复用 version.ts DATA_STAMP（服务端可判「旧数据配新内容」）
  progress: {
    stats: ProgressStats;
    days: {
      date: string;
      week: number;
      dayInWeek: number;
      stagesDone: string[];
      finished: boolean;
    }[];
    skills: { week: number; skillId: string; rating: SelfRating }[];
  };
}

/** 组装提交信封（纯函数）。stats 由调用方从 useProgress().stats 传入，避免与 store 内统计逻辑双实现。 */
export function buildSubmitEnvelope(input: {
  state: ProgressState;
  stats: ProgressStats;
  clientId: string;
  appVersion: string;
  dataStamp: string;
}): SubmitEnvelope {
  const { state, stats, clientId, appVersion, dataStamp } = input;
  return {
    schema: "progress.submit@1",
    clientId,
    submittedAt: new Date().toISOString(),
    appVersion,
    dataStamp,
    progress: {
      stats,
      days: state.days
        .filter((d) => d.finished)
        .map((d) => ({
          date: d.date,
          week: d.week,
          dayInWeek: d.dayInWeek,
          stagesDone: d.stagesDone,
          finished: d.finished,
        })),
      skills: state.skills.map((s) => ({ week: s.week, skillId: s.skillId, rating: s.rating })),
    },
  };
}

const CLIENT_ID_KEY = "dianedu.clientId";

/** 匿名客户端标识：localStorage 随机生成（非标识真人）。读取不存在时创建。 */
export function getClientId(): string {
  try {
    const hit = window.localStorage.getItem(CLIENT_ID_KEY);
    if (hit) return hit;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(CLIENT_ID_KEY, id);
    return id;
  } catch {
    return `anon-${Date.now().toString(36)}`;
  }
}

/** 删除匿名标识（与「清空本机进度」联动，保证最小化可退出）。 */
export function clearClientId(): void {
  try {
    window.localStorage.removeItem(CLIENT_ID_KEY);
  } catch {
    /* ignore */
  }
}
