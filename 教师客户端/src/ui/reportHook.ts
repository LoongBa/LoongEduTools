/**
 * P3 content:progress 上报接线（壳内零 AI · A01 §5.1 白名单 · 零儿童数据）
 *
 * package.rs load() 会 emit "content:progress" 事件（此前无消费者，死端）；
 * 本 hook 听到事件 → 调 report_progress 本地聚合（不同步联网），
 * 启动时调一次 report_flush 冲刷离线队列（静默失败不阻断课堂）。
 */
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "./api";

export interface ContentProgressEvent {
  package_id: string;
  unit: string;
  section: string;
  detail: string;
  ts: number;
}

/** 在 App 组件内调用一次：挂 content:progress 监听 + 启动冲刷上报队列 */
export function useContentProgressReporting(): void {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;

    listen<ContentProgressEvent>("content:progress", (ev) => {
      // 本地聚合，秒级快返；失败静默（上报永远不阻断课堂）
      api.reportProgress(ev.payload).catch(() => {});
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {});

    // 启动冲刷上次未送达的离线队列（未登录时 Rust 侧静默跳过）
    api.reportFlush().catch(() => {});

    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, []);
}
