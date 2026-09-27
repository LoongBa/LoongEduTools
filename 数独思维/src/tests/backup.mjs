// V1.2.0 备份/恢复单测：buildBackup→validateBackup round-trip、损坏/伪造拒绝、version 漂移、空档、stats 准确性。
// 直接跑真实源码（Node 26 原生 TS），不依赖浏览器。
import { buildBackup, validateBackup, BACKUP_PREFIX } from "../src/lib/backup.ts";

let failed = 0;
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} | ${name} ${extra}`);
  if (!cond) failed++;
};

// 构造一个「有真实数据」的 store（模拟练习过的用户）
function sampleStore() {
  return {
    version: 1,
    best: { 4: { ms: 30000, errors: 0, hints: 0, stars: 3, date: "2026-09-20" } },
    recent: { 4: 30000 },
    checkin: { dates: ["2026-09-20", "2026-09-21", "2026-09-22"], streak: 3 },
    history: [
      { date: "2026-09-22", level: "easy", size: 4, ms: 25000, errors: 1, hints: 0, stars: 2 },
      { date: "2026-09-21", level: "normal", size: 6, ms: 70000, errors: 2, hints: 1, stars: 2 },
    ],
    skills: { single: true },
    advSkills: {},
    mistakes: [
      { id: "m1", ts: 1729600000000, level: "easy", size: 4, board: [1, 0, 3, 4, 3, 4, 0, 2, 2, 1, 4, 3, 4, 3, 2, 1], solution: [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1], errors: 2, hints: 0, errIdx: [1] },
    ],
    favorites: [],
    daily: { date: "2026-09-22", level: "normal" },
    achievements: { first: "2026-09-20", adv1: "2026-09-22" },
    mapProgress: { completed: [{ i: 0, doneAt: 1729600000000 }] },
    settings: { sound: true },
    cur: null,
  };
}

const store = sampleStore();
const backup = buildBackup(store, "1.2.0");

// 1. round-trip：build → validate → ok 且 data 与源一致
const v1 = validateBackup(backup);
ok("buildBackup → validateBackup 通过", v1.ok, v1.ok ? "" : v1.reason);
ok("round-trip data 与源 store 一致", !v1.ok || JSON.stringify(v1.file.data) === JSON.stringify(store));
ok("备份文件名前缀", BACKUP_PREFIX === "数独思维-备份");

// 2. stats 准确性（oracle I3）：摘要与实际数组长度一致
ok("stats.history 准确", backup.stats.history === 2, `got=${backup.stats.history}`);
ok("stats.mistakes 准确", backup.stats.mistakes === 1, `got=${backup.stats.mistakes}`);
ok("stats.checkinDays 准确", backup.stats.checkinDays === 3, `got=${backup.stats.checkinDays}`);
ok("stats.achievements 准确", backup.stats.achievements === 2, `got=${backup.stats.achievements}`);

// 3. 伪 format 拒绝
const fakeFormat = { ...backup, format: "other-app-backup" };
const v2 = validateBackup(fakeFormat);
ok("伪 format 拒绝", !v2.ok && v2.reason.includes("格式标识"), v2.reason);

// 4. version 漂移拒绝（oracle I3：未来 schema 升版）
const v3 = validateBackup({ ...backup, v: 2 });
ok("备份 v=2 拒绝", !v3.ok && v3.reason.includes("版本"), v3.reason);
const v3b = validateBackup({ ...backup, data: { ...backup.data, version: 2 } });
ok("data.version=2 拒绝", !v3b.ok && v3b.reason.includes("版本"), v3b.reason);

// 5. 损坏 JSON / 非对象拒绝
const v4 = validateBackup("not-json");
ok("非对象拒绝", !v4.ok, v4.reason);
const v5 = validateBackup(null);
ok("null 拒绝", !v5.ok, v5.reason);

// 6. 元素形状校验（oracle B1）：损坏 BookItem / history / cur
const badBook = { ...backup, data: { ...backup.data, mistakes: [{ id: "x", board: "not-array", solution: [] }] } };
const v6 = validateBackup(badBook);
ok("BookItem board 非数组拒绝", !v6.ok && v6.reason.includes("盘面"), v6.reason);

const badHistory = { ...backup, data: { ...backup.data, history: [{ date: "2026-09-22" }] } }; // 缺 ms
const v7 = validateBackup(badHistory);
ok("history 元素缺 ms 拒绝", !v7.ok && v7.reason.includes("历史"), v7.reason);

const badCur = { ...backup, data: { ...backup.data, cur: { size: 4, notes: {}, puzzle: [1], solution: [], board: "bad" } } };
const v8 = validateBackup(badCur);
ok("cur.board 非数组拒绝", !v8.ok && v8.reason.includes("当前练习"), v8.reason);

// 7. __proto__ 键拒绝（纵深防御 I5）：攻击面在 load() 的 {...emptyStore(), ...parsed} 顶层合并处。
// JSON.parse 产生自有 __proto__ 键（对象字面量走原型 setter 不产生自有键）；带 version:1 以通过前置版本检查到达 hasProtoKey
const proto = { ...backup, data: JSON.parse('{"__proto__":{"pollute":true},"version":1}') };
const v9 = validateBackup(proto);
ok("__proto__ 键拒绝", !v9.ok && v9.reason.includes("异常字段"), v9.ok ? v9.reason : `ok=false reason=${v9.reason}`);

// 8. 空档 round-trip（oracle I3：新用户备份）
const empty = {
  version: 1,
  best: {},
  recent: {},
  checkin: { dates: [], streak: 0 },
  history: [],
  skills: {},
  advSkills: {},
  mistakes: [],
  favorites: [],
  daily: null,
  achievements: {},
  mapProgress: { completed: [] },
  settings: { sound: true },
  cur: null,
};
const v10 = validateBackup(buildBackup(empty, "1.2.0"));
ok("空档 store round-trip 通过", v10.ok, v10.ok ? "" : v10.reason);

// 9. 未识别字段不拒绝（oracle I5：load() 浅合并保留无害）
const extraField = { ...backup, data: { ...backup.data, someFutureField: { a: 1 } } };
const v11 = validateBackup(extraField);
ok("未识别字段不拒绝", v11.ok, v11.ok ? "" : v11.reason);

console.log(`\n备份单测 ${failed ? "FAIL " + failed : "全部通过"}`);
process.exit(failed ? 1 : 0);