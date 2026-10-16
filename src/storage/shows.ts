import { Directory, File, Paths } from 'expo-file-system';
import { newShow } from '@/model/defaults';
import { newId } from '@/model/id';
import type { Show } from '@/model/types';
import { loadShow, saveShow } from './showFile';

/**
 * ショーの一覧・作成・複製・削除（SPEC 2.1-7「ショー：新規・切替・複製・名前変更・削除」）。
 * 保存場所は Documents/shows/<showId>/（show.json・state.json・images/）。
 */

export interface ShowSummary {
  id: string;
  name: string;
  updatedAt: string;
  pages: number;
  devices: number;
}

function showsDir(): Directory {
  return new Directory(Paths.document, 'shows');
}

export function listShows(): ShowSummary[] {
  const root = showsDir();
  if (!root.exists) return [];
  const out: ShowSummary[] = [];
  for (const entry of root.list()) {
    if (!(entry instanceof Directory)) continue;
    try {
      const s = loadShow(entry.name);
      if (s) out.push({ id: s.id, name: s.name, updatedAt: s.updatedAt, pages: s.pages.length, devices: s.devices.length });
    } catch {
      // 読めないショーは一覧に出さない（ファイルは消さない）
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function createShow(name: string): Show {
  const s = newShow(name);
  saveShow(s);
  return s;
}

/** 複製：ショーの ID だけ新しくする（ボタン・機器の ID はショーの中で閉じているのでそのまま）。画像・保持した変数も写す */
export function duplicateShowFiles(src: Show): Show {
  const now = new Date().toISOString();
  const copy: Show = { ...JSON.parse(JSON.stringify(src)), id: newId(), name: `${src.name} のコピー`, createdAt: now, updatedAt: now };
  saveShow(copy);
  const from = new Directory(Paths.document, 'shows', src.id);
  const to = new Directory(Paths.document, 'shows', copy.id);
  const images = new Directory(from, 'images');
  if (images.exists) images.copySync(to);
  const state = new File(from, 'state.json');
  if (state.exists) state.copySync(new File(to, 'state.json'));
  return copy;
}

export function deleteShowFiles(id: string): void {
  const dir = new Directory(Paths.document, 'shows', id);
  if (dir.exists) dir.delete();
}
