import { Directory, File, Paths } from 'expo-file-system';
import { newShow } from '@/model/defaults';
import type { Show } from '@/model/types';

/**
 * ショーの保存（SPEC 9 章）
 * - Documents/shows/<showId>/show.json
 * - Documents/shows/current.json … 最後に開いていたショーの ID
 * 書き込みは一時ファイル → 置き換えで、途中で落ちても前の内容が残るようにする。
 */

const ROOT = 'shows';

function showsDir(): Directory {
  return new Directory(Paths.document, ROOT);
}

function showDir(id: string): Directory {
  return new Directory(Paths.document, ROOT, id);
}

function ensureDir(dir: Directory): void {
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
}

function writeAtomic(target: File, text: string): void {
  const tmp = new File(target.uri + '.tmp');
  tmp.write(text);
  tmp.moveSync(target, { overwrite: true });
}

export class ShowFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShowFileError';
  }
}

/** 形式の確認と、将来の形式変更への変換（今は schemaVersion 1 だけ） */
export function parseShow(text: string): Show {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ShowFileError('ショーファイルを読めません（JSON の形式が正しくありません）');
  }
  if (typeof raw !== 'object' || raw === null) throw new ShowFileError('ショーファイルの中身が空です');
  const s = raw as Partial<Show>;
  if (s.schemaVersion !== 1) throw new ShowFileError(`対応していない形式です（schemaVersion: ${String(s.schemaVersion)}）`);
  if (typeof s.id !== 'string' || !Array.isArray(s.pages) || typeof s.grid !== 'object' || s.grid === null) {
    throw new ShowFileError('ショーファイルに必要な項目がありません');
  }
  return s as Show;
}

export function serializeShow(show: Show): string {
  return JSON.stringify(show);
}

export function saveShow(show: Show): void {
  ensureDir(showsDir());
  const dir = showDir(show.id);
  ensureDir(dir);
  writeAtomic(new File(dir, 'show.json'), serializeShow(show));
  writeAtomic(new File(showsDir(), 'current.json'), JSON.stringify({ showId: show.id }));
}

export function loadShow(id: string): Show | null {
  const f = new File(showDir(id), 'show.json');
  if (!f.exists) return null;
  return parseShow(f.textSync());
}

function currentShowId(): string | null {
  const f = new File(showsDir(), 'current.json');
  if (!f.exists) return null;
  try {
    const v = JSON.parse(f.textSync()) as { showId?: unknown };
    return typeof v.showId === 'string' ? v.showId : null;
  } catch {
    return null;
  }
}

/** 起動時：最後のショーを読む。無ければ空のショー（機器・ボタンなし）を作って保存する（デモの機器は入れない。2026-10-17 オーナー指示） */
export function loadInitialShow(): { show: Show; created: boolean } {
  const id = currentShowId();
  if (id) {
    const s = loadShow(id);
    if (s) return { show: s, created: false };
  }
  const first = newShow('ショー 1');
  saveShow(first);
  return { show: first, created: true };
}

/** 「再起動後も値を保持」の変数（SPEC 9 章：shows/<showId>/state.json） */
export function loadState(showId: string): Record<string, string> {
  const f = new File(showDir(showId), 'state.json');
  if (!f.exists) return {};
  try {
    const v = JSON.parse(f.textSync()) as { custom?: unknown };
    if (typeof v.custom !== 'object' || v.custom === null) return {};
    const out: Record<string, string> = {};
    for (const [k, x] of Object.entries(v.custom as Record<string, unknown>)) if (typeof x === 'string') out[k] = x;
    return out;
  } catch {
    return {};
  }
}

export function saveState(showId: string, custom: Record<string, string>): void {
  const dir = showDir(showId);
  ensureDir(showsDir());
  ensureDir(dir);
  writeAtomic(new File(dir, 'state.json'), JSON.stringify({ custom }));
}
