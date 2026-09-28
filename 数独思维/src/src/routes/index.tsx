// 首页：hero + 四组分区（开始练习 / 每日·进阶 / 学习 / 更多）。
// 全站为单路由视图状态机：练习、教学关、徽章墙、报告、设置等都在此切换渲染。

import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Shell, CheckinBar, APP_ICON_URL } from "@/components/Shell";
import { Btn, Card, SectionGroup, TopBar, Toast, Stat } from "@/components/ui/kit";
import { Practice, suggestLevel, type StartParams, type GroupItemResult } from "@/components/Practice";
import { SkillLesson } from "@/components/SkillLesson";
import { ParentReport } from "@/components/Report";
import { Settings } from "@/components/Settings";
import { MapView } from "@/components/MapView";
import { ImportOverlay, RulesTeach } from "@/components/ImportRules";
import { ShareResultOverlay } from "@/components/Share";
import { GroupSummaryOverlay } from "@/components/GroupSummary";
import { SkillWall, AchievementWall, BookList, Calendar, WeekCard, levelName, SkillGroups } from "@/components/Walls";
import { useStore, todayStr, type BookItem, type LevelId } from "@/lib/store";
import { APP_VERSION } from "@/lib/version";
import { importMsg, PRIVACY_BADGE } from "@/lib/copy";
import { BASE_SKILLS, ADV_SKILLS, ACHIEVEMENTS, FREE_TIERS, HOME_SKILL_KEYS, MAP_LEVELS, dailyFor, skillByKey, groupOfTechniques, advSkillsFor, type MapLevel, type Technique, type TechniqueGroupId } from "@/lib/content";
import { countGiven, parseImportedText, analyzeTechniques, type Size } from "@/lib/sudoku";
import { formatMs } from "@/components/Overlay";
import { ART_HERO } from "@/lib/art";

export const Route = createFileRoute("/")({ component: Index });

type View =
  | "home"
  | "practice"
  | "lesson"
  | "map"
  | "skillwall"
  | "mistakes"
  | "favorites"
  | "achievements"
  | "report"
  | "settings"
  | "calendar";

interface FreeSel {
  size: Size;
  level: LevelId;
}

/** V1.7.0：同类专项连做会话（B5 扩展：gid + results 累积） */
interface GroupSession {
  gid: TechniqueGroupId;
  list: BookItem[];
  idx: number;
  results: GroupItemResult[];
}

const TIER_BY_LEVEL: Record<LevelId, (typeof FREE_TIERS)[number]> = {
  easy: FREE_TIERS[0],
  normal: FREE_TIERS[1],
  hard: FREE_TIERS[2],
};

function Index() {
  const { store, update } = useStore();
  const [view, setView] = useState<View>("home");
  const [params, setParams] = useState<StartParams | null>(null);
  const [lesson, setLesson] = useState<Technique | null>(null);
  const [sel, setSel] = useState<FreeSel>({ size: FREE_TIERS[1].size, level: "normal" });
  const [importing, setImporting] = useState(false);
  const [teaching, setTeaching] = useState(false);
  const [shareResult, setShareResult] = useState(false);
  const [toast, setToast] = useState("");
  /** 同类专项连做会话（V1.3.0/V1.7.0）：组内错题逐一重练，完成一题自动进下一题；results 累积每题成绩用于组内小结（B5） */
  const [groupSession, setGroupSession] = useState<GroupSession | null>(null);
  /** V1.7.0：组内成果小结浮层开关（B5） */
  const [groupSummaryOpen, setGroupSummaryOpen] = useState(false);
  /** URL 直启守卫：仅首帧处理一次 ?sd= 参数（React 19 StrictMode dev 双调用用 ref 防重） */
  const bootRef = useRef(false);

  /** URL 直启（V1.1.0）：?sd=SD{N}:<编码> → 校验通过自动进练习，失败 Toast 提示 */
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    const raw = new URLSearchParams(window.location.search).get("sd") ?? "";
    let sd = raw;
    try {
      sd = decodeURIComponent(raw); // 防分享渠道百分号编码 . / , 截断正则（oracle I1）
    } catch { /* 非合法编码就按原样走解析 */ }
    if (!sd) return;
    const parsed = parseImportedText(sd);
    if (parsed.error == null && parsed.board && parsed.size && parsed.solution) {
      start({ size: parsed.size, level: "normal", source: "import", board: parsed.board, solution: parsed.solution });
      // 清除 URL 参数：防刷新重复直启 / 链接残留（用 URL API 删参，兼容 sd 非首个参数的多参链接）
      const u = new URL(window.location.href);
      u.searchParams.delete("sd");
      window.history.replaceState({}, "", u.pathname + u.search + u.hash);
    } else {
      showToast(importMsg(parsed));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在挂载时读取一次
  }, []);

  /** 旧错题技巧画像迁移（V1.3.0 I3 + V1.4.0 I4）：打开错题本时对缺 techniques 或未用
   *  新引擎（含显性数对/X-Wing）补算过的条目一次性重算写回；migrated14 标记防无 adv
   *  技巧的旧题每次打开都重算（analyzeTechniques 结果确定性：同盘同引擎恒同结果） */
  useEffect(() => {
    if (view !== "mistakes") return;
    const pending = store.mistakes.filter((m) => !m.techniques || !m.migrated14);
    if (!pending.length) return;
    update((d) => {
      for (const m of d.mistakes) {
        if (m.techniques && m.migrated14) continue;
        try {
          m.techniques = analyzeTechniques(m.board, m.size);
          m.migrated14 = true;
        } catch { /* 单条失败跳过，下次打开再补 */ }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在进入错题本时触发一次
  }, [view]);

  /** 最近一次完成的练习记录，供「分享成绩」使用 */
  const lastRecord = useMemo(() => {
    const h = store.history[0];
    if (!h) return null;
    const fav = store.favorites.find((f) => f.size === h.size && f.level === h.level);
    const mis = store.mistakes.find((m) => m.size === h.size && m.level === h.level);
    return {
      size: h.size,
      level: h.level,
      stars: h.stars,
      ms: h.ms,
      errors: h.errors,
      hints: h.hints,
      board: (fav || mis)?.board || [],
    };
  }, [store.history, store.favorites, store.mistakes]);

  function showToast(t: string) {
    setToast(t);
    window.setTimeout(() => setToast(""), 1800);
  }

  function start(p: StartParams) {
    setParams(p);
    setView("practice");
  }

  function replay(it: BookItem) {
    start({ size: it.size, level: it.level, source: "replay", board: it.board, solution: it.solution, errIdx: it.errIdx });
  }

  /** 同类专项连做（V1.3.0）：组内题（按 groupOfTechniques 命中）逐一重练；<3 题直接全练，≥3 随机起手 */
  function startGroupPractice(gid: TechniqueGroupId) {
    const list = store.mistakes.filter((m) => groupOfTechniques(m.techniques).includes(gid));
    if (!list.length) return;
    let ordered = list;
    if (list.length >= 3) {
      const shuffled = list.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      ordered = shuffled;
    }
    setGroupSession({ gid, list: ordered, idx: 0, results: [] });
    startGroupItem(ordered[0], 0, ordered.length);
  }

  /** 开始/推进连做：当前 idx 的题 → practice。groupSession 为组游标 SSOT，params.group 为展示快照（单向派生） */
  function startGroupItem(item: BookItem, idx: number, total: number) {
    start({ size: item.size, level: item.level, source: "replay", board: item.board, solution: item.solution, errIdx: item.errIdx, inGroup: true, group: { total, idx } });
  }

  /** Practice 完成回调（V1.7.0 带成绩）：连做中累积结果并推进下一题，末题开小结浮层；非组模式回首页 */
  function handlePracticeFinish(result: GroupItemResult) {
    if (groupSession) {
      const results = [...groupSession.results, result];
      const next = groupSession.idx + 1;
      if (next < groupSession.list.length) {
        setGroupSession({ ...groupSession, idx: next, results });
        startGroupItem(groupSession.list[next], next, groupSession.list.length);
        return;
      }
      // 组结束（B1 修复）：保留 results 供小结浮层；先改 view 卸载 Practice（结算浮层随之消失），再开顶层浮层
      setGroupSession({ ...groupSession, results });
      setGroupSummaryOpen(true);
      setView("mistakes");
      return;
    }
    setView("home");
  }

  /* ---------- 子视图 ---------- */
  if (view === "practice" && params) {
    return <Practice params={params} onExit={() => { setGroupSession(null); setView("home"); }} onFinish={handlePracticeFinish} onLessonKey={openSkill} />;
  }
  if (view === "lesson" && lesson) {
    return <SkillLesson skill={lesson} onExit={() => setView("home")} onComplete={(key) => handleLessonDone(key)} />;
  }

  const litAll: Record<string, boolean> = { ...store.skills, ...store.advSkills };

  return (
    <Shell footer={<CheckinBar onOpen={() => setView("calendar")} />}>
      {toast ? <Toast text={toast} /> : null}

      {view === "home" ? (
        <HomeView
          sel={sel}
          setSel={setSel}
          onStart={start}
          onContinue={handleContinue(store.cur, start)}
          hasCur={!!store.cur}
          onDaily={() => {
            const d = dailyFor(todayStr());
            start({ size: d.size, level: d.level, source: "daily", seed: `daily:${todayStr()}` });
          }}
          onMap={() => setView("map")}
          onRules={() => setTeaching(true)}
          onLessons={() => setView("skillwall")}
          onLesson={(s) => {
            setLesson(s);
            setView("lesson");
          }}
          onMistakes={() => setView("mistakes")}
          onFavorites={() => setView("favorites")}
          onAchievements={() => setView("achievements")}
          onReport={() => setView("report")}
          onSettings={() => setView("settings")}
          onImport={() => setImporting(true)}
          onShareResult={() => setShareResult(true)}
          litCount={Object.keys(litAll).length}
        />
      ) : null}

      {view === "map" ? (
        <>
          <TopBar onBack={() => setView("home")} title="🗺️ 训练地图" meta="10 级阶梯 · 完成一级解锁下一级" />
          <MapView
            completed={store.mapProgress.completed}
            onPick={(lv: MapLevel) => start({ size: lv.size, level: lv.level, source: "map", mapIndex: lv.i, seed: `map:${lv.i}:${todayStr()}` })}
            onBack={() => setView("home")}
          />
        </>
      ) : null}

      {view === "skillwall" ? (
        <>
          <TopBar onBack={() => setView("home")} title="🏵️ 技巧徽章墙" meta={`已点亮 ${Object.keys(store.skills).length} / 4 基础 · ${Object.keys(store.advSkills).length} / 12 进阶`} />
          <p className="mb-2 px-1 text-[11.5px] leading-relaxed text-muted-foreground">基础技巧打圆章，进阶技巧打菱章。每一关都是「先看懂、再动手」的小步引导。</p>
          <h3 className="mb-2 mt-4 px-1 text-[13px] font-bold text-badge-base">基础技巧 · 4 关</h3>
          <SkillWall skills={BASE_SKILLS} lit={store.skills} tier="base" onPick={(k) => openSkill(k)} />
          <h3 className="mb-2 mt-5 px-1 text-[13px] font-bold text-badge-adv">进阶技巧 · 12 关</h3>
          <SkillWall skills={ADV_SKILLS} lit={store.advSkills} tier="adv" onPick={(k) => openSkill(k)} />
        </>
      ) : null}

      {view === "achievements" ? (
        <>
          <TopBar onBack={() => setView("home")} title="🏆 成就墙" meta={`已点亮 ${Object.keys(store.achievements).length} / ${ACHIEVEMENTS.length}`} />
          <AchievementWall list={ACHIEVEMENTS} unlocked={store.achievements} />
        </>
      ) : null}

      {view === "mistakes" ? (
        <>
          <TopBar onBack={() => setView("home")} title="📕 错题本" meta={`${store.mistakes.length} 题待巩固 · 重练零失误自动移出`} />
          {/* V1.3.0：技巧分组区（同类专项连做 + 教学关关联） */}
          <SkillGroups
            mistakes={store.mistakes}
            onLesson={(lessonKey) => {
              const s = skillByKey(lessonKey);
              if (s) openSkill(s.key);
            }}
            onPractice={(gid) => startGroupPractice(gid)}
            onMixedPractice={() => startGroupPractice("mixed")}
          />
          <BookList
            items={store.mistakes}
            kind="mistake"
            onReplay={replay}
            onDelete={(id) =>
              update((d) => {
                d.mistakes = d.mistakes.filter((m) => m.id !== id);
              })
            }
            onClear={() =>
              update((d) => {
                d.mistakes = [];
              })
            }
            onGoPractice={() => setView("home")}
          />
        </>
      ) : null}

      {view === "favorites" ? (
        <>
          <TopBar onBack={() => setView("home")} title="⭐ 收藏本" meta={`${store.favorites.length} 题 · 随时再来一遍`} />
          <BookList
            items={store.favorites}
            kind="favorite"
            onReplay={replay}
            onDelete={(id) =>
              update((d) => {
                d.favorites = d.favorites.filter((f) => f.id !== id);
              })
            }
            onClear={() =>
              update((d) => {
                d.favorites = [];
              })
            }
            onGoPractice={() => setView("home")}
          />
        </>
      ) : null}

      {view === "calendar" ? (
        <>
          <TopBar onBack={() => setView("home")} title="📅 打卡日历" meta={`连续 ${store.checkin.streak} 天 · 本月已练`} />
          <Calendar dates={store.checkin.dates} streak={store.checkin.streak} />
        </>
      ) : null}

      {view === "report" ? (
        <ParentReport onBack={() => setView("home")} onExport={() => window.print()} />
      ) : null}

      {view === "settings" ? <Settings onBack={() => setView("home")} /> : null}

      {/* 浮层 */}
      {importing ? (
        <ImportOverlay
          onClose={() => setImporting(false)}
          onStart={(board, size, solution) => {
            setImporting(false);
            start({ size, level: "normal", source: "import", board, solution });
          }}
        />
      ) : null}

      {teaching ? <RulesTeach onClose={() => setTeaching(false)} /> : null}

      {shareResult && lastRecord ? (
        <ShareResultOverlay
          size={lastRecord.size}
          level={levelName(lastRecord.level)}
          stars={lastRecord.stars}
          ms={lastRecord.ms}
          errors={lastRecord.errors}
          hints={lastRecord.hints}
          board={lastRecord.board}
          onClose={() => setShareResult(false)}
          onToast={showToast}
        />
      ) : null}

      {/* V1.7.0：组内成果小结（B5）——顶层浮层，组结束（setView("mistakes") 卸载 Practice）后唯一显示 */}
      {groupSummaryOpen && groupSession ? (
        <GroupSummaryOverlay
          session={groupSession}
          onBack={() => {
            setGroupSession(null);
            setGroupSummaryOpen(false);
          }}
          onAgain={() => {
            setGroupSummaryOpen(false);
            startGroupPractice(groupSession.gid);
          }}
          onHome={() => {
            setGroupSession(null);
            setGroupSummaryOpen(false);
            setView("home");
          }}
        />
      ) : null}
    </Shell>
  );

  function openSkill(key: string) {
    const s = skillByKey(key);
    if (!s) return;
    setLesson(s);
    setView("lesson");
  }

  function handleLessonDone(key: string) {
    const isAdv = key !== undefined && ADV_SKILLS.some((s) => s.key === key);
    update((d) => {
      if (isAdv) d.advSkills[key] = true;
      else d.skills[key] = true;
      if (Object.keys(d.advSkills).length >= 1 && !d.achievements.adv1) d.achievements.adv1 = todayStr();
      if (Object.keys(d.skills).length >= 4 && !d.achievements.skillAll4) d.achievements.skillAll4 = todayStr();
      if (Object.keys(d.advSkills).length >= 12 && !d.achievements.advAll12) d.achievements.advAll12 = todayStr();
    });
    setView("skillwall");
  }
}

/* ==================== 首页视图 ==================== */

function HomeView(props: {
  sel: { size: Size; level: LevelId };
  setSel: (s: { size: Size; level: LevelId }) => void;
  onStart: (p: StartParams) => void;
  onContinue: () => void;
  hasCur: boolean;
  onDaily: () => void;
  onMap: () => void;
  onRules: () => void;
  onLessons: () => void;
  onLesson: (s: Technique) => void;
  onMistakes: () => void;
  onFavorites: () => void;
  onAchievements: () => void;
  onReport: () => void;
  onSettings: () => void;
  onImport: () => void;
  onShareResult: () => void;
  litCount: number;
}) {
  const { store } = useStore();
  const { sel, setSel } = props;
  const tier = TIER_BY_LEVEL[sel.level];
  const today = todayStr();
  const dailyDone = store.daily?.date === today;
  const d = dailyFor(today);
  const homeSkills = HOME_SKILL_KEYS.map((k) => skillByKey(k)!).filter(Boolean);
  // V1.10.0 B7：首页进阶技巧盘 · 每日轮换（日期驱动零存储；grade 显式标注做龄段预期管理）
  const advSkills = advSkillsFor(today);
  // E5 连败降档：进入任一局后清除，仅本次进入首页展示
  const [suggested, setSuggested] = useState<LevelId | null>(() => suggestLevel(store.history));
  const go = (p: StartParams) => {
    setSuggested(null);
    props.onStart(p);
  };

  return (
    <div className="space-y-6 pb-4">
      {/* Hero */}
      <section className="reveal relative overflow-hidden rounded-3xl border border-border/70 bg-card p-4 shadow-soft">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-primary/12 blur-2xl" />
        <div className="relative flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[19px] font-extrabold leading-tight tracking-tight">点选填数，零门槛上手</h1>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              4 节基础技巧 + 12 节进阶技巧，配合每日挑战与训练阶梯，把推理一步步练成习惯。
            </p>
          </div>
          <img src={ART_HERO} alt="" aria-hidden className="-mb-1 mr-[-6px] h-[86px] w-[110px] shrink-0 object-contain" />
        </div>
        <div className="relative mt-3 grid grid-cols-3 gap-2">
          <Stat k="已点亮技巧" v={props.litCount} unit="/16" />
          <Stat k="连续打卡" v={store.checkin.streak} unit="天" />
          <Stat k="累计练习" v={store.history.length} unit="次" />
        </div>
        {props.hasCur && store.cur ? (
          <Btn variant="primary" size="lg" className="relative mt-3 w-full" onClick={props.onContinue}>
            ▶ 继续上次未完成的题
            <span className="tnum ml-1.5 text-[11px] font-normal opacity-80">已填 {countGiven(store.cur.board)} 格 · 已玩 {formatMs(store.cur.ms)}</span>
          </Btn>
        ) : null}
        {suggested ? (
          <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2">
            <span className="min-w-0 flex-1 text-[11px] leading-snug text-warning">最近两局都吃力，可以试试简单一档 →</span>
            <button
              type="button"
              onClick={() => {
                setSel({ ...sel, level: suggested });
                setSuggested(null);
              }}
              className="press shrink-0 rounded-full bg-warning px-3 py-1.5 text-[11px] font-bold text-warning-foreground"
            >
              从「{TIER_BY_LEVEL[suggested].name}」开始
            </button>
          </div>
        ) : null}
      </section>

      {/* ① 开始练习：三档难度各带固定规格 */}
      <SectionGroup label="PRACTICE" title="开始练习" hint="选一档难度">
        <Card pad="normal">
          <div className="grid grid-cols-3 gap-2">
            {FREE_TIERS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSel({ ...sel, level: t.id })}
                aria-pressed={sel.level === t.id}
                className={cn(
                  "press rounded-xl border px-2 py-2.5 text-center transition-colors",
                  sel.level === t.id ? "border-primary bg-primary text-primary-foreground shadow-soft" : "border-border bg-secondary text-secondary-foreground",
                )}
              >
                <span className="block text-[14px] font-bold leading-none">{t.name}</span>
                <span
                  className={cn(
                    "tnum mt-1 block rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                    sel.level === t.id ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background/70 text-muted-foreground",
                  )}
                >
                  {t.spec}
                </span>
                <span className={cn("mt-1 block text-[10px] leading-snug", sel.level === t.id ? "text-primary-foreground/80" : "text-muted-foreground")}>
                  {t.desc}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-2 px-0.5 text-[10.5px] leading-relaxed text-muted-foreground">
            每档难度已配好对应盘面大小，不用再单独选规格。想练别的尺寸，去训练地图按阶梯走。
          </p>
          <Btn
            variant="primary"
            size="lg"
            className="mt-2.5 w-full"
            onClick={() => go({ size: tier.size, level: tier.id, source: "free", seed: `free:${Date.now()}` })}
          >
            🎯 开始自由练习
          </Btn>
        </Card>
      </SectionGroup>

      {/* ② 每日 · 进阶 */}
      <SectionGroup label="DAILY" title="每日与阶梯" hint="按自己的节奏">
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => {
              setSuggested(null);
              props.onDaily();
            }}
            className={cn(
              "press reveal-up relative overflow-hidden rounded-2xl border p-3.5 text-left",
              dailyDone ? "border-success/45 bg-success/8" : "border-primary/45 bg-primary/8",
            )}
          >
            <span className="text-[18px]">{dailyDone ? "✅" : "🌤️"}</span>
            <p className="mt-1.5 text-[14px] font-bold leading-tight">每日挑战</p>
            <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground">
              今天 {d.size}×{d.size} · {levelName(d.level)}
            </p>
            <span className={cn("mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold", dailyDone ? "bg-success/15 text-success" : "bg-primary/15 text-primary")}>
              {dailyDone ? "已完成" : "去挑战"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSuggested(null);
              props.onMap();
            }}
            className="press reveal-up relative overflow-hidden rounded-2xl border border-border bg-card p-3.5 text-left"
            data-reveal-delay={60}
          >
            <span className="text-[18px]">🗺️</span>
            <p className="mt-1.5 text-[14px] font-bold leading-tight">训练地图</p>
            <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground">10 级阶梯 · 已到第 {nextMapLevel(store.mapProgress.completed)} 级</p>
            <span className="mt-2 inline-block rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-secondary-foreground">查看进度</span>
          </button>
        </div>
        <WeekCard
          dates={store.checkin.dates}
          title="本周打卡"
          bigNumber={`${store.checkin.streak} 天`}
          statusText={dailyDone ? "今日已完成，继续保持" : "今日还没练，来一道就点亮"}
        />
      </SectionGroup>

      {/* ③ 学习 */}
      <SectionGroup label="LEARN" title="学习与技巧" hint="先看懂再动手">
        <div className="grid grid-cols-2 gap-2.5">
          <Btn variant="secondary" size="md" onClick={props.onRules}>
            📖 规则教学
          </Btn>
          <Btn variant="secondary" size="md" onClick={props.onLessons}>
            🏵️ 全部技巧
          </Btn>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {homeSkills.map((s, i) => {
            const lit = !!store.skills[s.key];
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => props.onLesson(s)}
                className="press reveal-up rounded-2xl border border-border bg-card p-3 text-left"
                data-reveal-delay={i * 40}
              >
                <span className="flex items-center gap-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-badge-base/15 text-[16px]">{s.emoji}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-bold leading-tight">{s.name}</span>
                    <span className="mt-0.5 block text-[10px] leading-none text-muted-foreground">{lit ? "✅ 已点亮 · 可复习" : `🎯 ${s.grade} 适龄`}</span>
                  </span>
                </span>
                <p className="mt-1.5 line-clamp-2 text-[10.5px] leading-snug text-muted-foreground">{s.brief}</p>
              </button>
            );
          })}
        </div>
        {/* V1.10.0 B7：进阶技巧盘 · 每日轮换（回应 V1.5.0 触达率遗留；标题行右对齐跳转 skillwall） */}
        <div className="mb-2 mt-4 flex items-baseline justify-between px-1">
          <h3 className="text-[13px] font-bold text-badge-adv">✨ 进阶技巧 · 今日 2 个</h3>
          <button type="button" onClick={props.onLessons} className="text-[10.5px] font-semibold text-muted-foreground">
            全部 12 个 ›
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {advSkills.map((s, i) => {
            const lit = !!store.advSkills[s.key];
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => props.onLesson(s)}
                className="press reveal-up rounded-2xl border border-border bg-card p-3 text-left"
                data-reveal-delay={i * 40}
              >
                <span className="flex items-center gap-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-badge-adv/15 text-[16px]">{s.emoji}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-bold leading-tight">{s.name}</span>
                    <span className="mt-0.5 block text-[10px] leading-none text-muted-foreground">{lit ? "✅ 已点亮 · 可复习" : `🎯 ${s.grade} 适龄`}</span>
                  </span>
                </span>
                <p className="mt-1.5 line-clamp-2 text-[10.5px] leading-snug text-muted-foreground">{s.brief}</p>
              </button>
            );
          })}
        </div>
      </SectionGroup>

      {/* ④ 更多：按「记录 / 家长与素材 / 偏好」三档分级，不再同质平铺 */}
      <SectionGroup label="MORE" title="记录与设置" hint="数据只在本机">
        <div className="grid grid-cols-3 gap-2.5">
          <Tile emoji="📕" label="错题本" badge={store.mistakes.length} onClick={props.onMistakes} delay={0} />
          <Tile emoji="⭐" label="收藏本" badge={store.favorites.length} onClick={props.onFavorites} delay={40} />
          <Tile emoji="🏆" label="成就墙" badge={Object.keys(store.achievements).length} onClick={props.onAchievements} delay={80} />
        </div>
        <div className="mt-2.5 space-y-1.5">
          <RowItem emoji="📊" label="家长报告" desc="本周表现 · 可导出打印" onClick={props.onReport} delay={120} />
          <RowItem emoji="📥" label="导入题目" desc="粘贴题面直接练" onClick={props.onImport} delay={160} />
          <RowItem emoji="📤" label="分享成绩" desc="生成成绩长图" onClick={props.onShareResult} delay={200} />
        </div>
        <button
          type="button"
          onClick={props.onSettings}
          className="press reveal-up mt-2.5 flex w-full items-center gap-2.5 rounded-2xl border border-dashed border-border bg-card/50 px-3.5 py-2.5 text-left"
          data-reveal-delay={240}
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-secondary text-[14px]">🎨</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-semibold leading-none">外观设置</span>
            <span className="mt-1 block text-[10.5px] leading-none text-muted-foreground">主题方案 · 深浅模式</span>
          </span>
          <span aria-hidden className="text-[13px] text-muted-foreground/60">›</span>
        </button>
      </SectionGroup>

      <p className="px-1 text-center text-[10.5px] leading-relaxed text-muted-foreground">
        {PRIVACY_BADGE}
      </p>
      <p className="px-1 text-center text-[10px] leading-relaxed text-muted-foreground/70">
        数独思维 · 版本 V{APP_VERSION}
      </p>
    </div>
  );
}

function RowItem({ emoji, label, desc, onClick, delay = 0 }: { emoji: string; label: string; desc: string; onClick: () => void; delay?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press reveal-up flex w-full items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2.5 text-left"
      data-reveal-delay={delay}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-secondary text-[14px]">{emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold leading-none">{label}</span>
        <span className="mt-1 block truncate text-[10.5px] leading-none text-muted-foreground">{desc}</span>
      </span>
      <span aria-hidden className="text-[13px] text-muted-foreground/60">›</span>
    </button>
  );
}

function Tile({ emoji, label, badge, onClick, delay = 0, hidden = false }: { emoji: string; label: string; badge?: number; onClick: () => void; delay?: number; hidden?: boolean }) {
  if (hidden) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="press reveal-up relative rounded-2xl border border-border bg-card p-3 text-center"
      data-reveal-delay={delay}
    >
      <span className="block text-[20px] leading-none">{emoji}</span>
      <span className="mt-1.5 block text-[11.5px] font-semibold leading-none">{label}</span>
      {badge ? <span className="tnum absolute right-1.5 top-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">{badge}</span> : null}
    </button>
  );
}

/* ==================== 辅助 ==================== */

function nextMapLevel(completed: { i: number }[]): number {
  const set = new Set(completed.map((c) => c.i));
  for (let i = 0; i < MAP_LEVELS.length; i++) if (!set.has(i)) return i + 1;
  return MAP_LEVELS.length;
}

function handleContinue(cur: ReturnType<typeof useStore>["store"]["cur"], onStart: (p: StartParams) => void) {
  return () => {
    if (!cur) return;
    onStart({ size: cur.size, level: cur.level, source: cur.source, mapIndex: cur.mapIndex });
  };
}
