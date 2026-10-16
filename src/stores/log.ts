import { create } from 'zustand';

/**
 * ログ（SPEC 2.1-7・13）：エラー／警告／情報／詳細。保存はせず、最新 1000 件だけ持つ。
 * 【推測】【不明】の通信仕様を実機で確かめるため、送受信の中身もここに残す（詳細レベル）。
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogEntry {
  id: number;
  ts: number;
  level: LogLevel;
  /** 機器名・「内部」・「保存」など */
  source: string;
  /** 機器のログを絞り込むための ID（機器以外は空） */
  deviceId?: string;
  message: string;
}

export const LOG_LIMIT = 1000;

export const LEVEL_ORDER: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export const LEVEL_LABEL: Record<LogLevel, string> = { error: 'エラー', warn: '警告', info: '情報', debug: '詳細' };

interface LogState {
  entries: LogEntry[];
  add: (level: LogLevel, source: string, message: string, deviceId?: string) => void;
  clear: () => void;
}

let nextId = 1;

export const useLogStore = create<LogState>((set, get) => ({
  entries: [],
  add: (level, source, message, deviceId) => {
    const e: LogEntry = { id: nextId++, ts: Date.now(), level, source, message, deviceId };
    const entries = get().entries;
    set({ entries: entries.length >= LOG_LIMIT ? [...entries.slice(entries.length - LOG_LIMIT + 1), e] : [...entries, e] });
  },
  clear: () => set({ entries: [] }),
}));

export function log(level: LogLevel, source: string, message: string, deviceId?: string): void {
  useLogStore.getState().add(level, source, message, deviceId);
}

export function filterLogs(entries: LogEntry[], max: LogLevel, deviceId?: string): LogEntry[] {
  return entries.filter((e) => LEVEL_ORDER[e.level] <= LEVEL_ORDER[max] && (!deviceId || e.deviceId === deviceId));
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/** 書き出し用のテキスト */
export function logsToText(entries: LogEntry[]): string {
  return entries.map((e) => `${formatTime(e.ts)} [${LEVEL_LABEL[e.level]}] ${e.source}: ${e.message}`).join('\n');
}
