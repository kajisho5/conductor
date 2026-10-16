import { Directory, File, Paths } from 'expo-file-system';
import { newId } from '@/model/id';
import type { ImageAsset, Show } from '@/model/types';

/**
 * 画像（SPEC 2.1-6・9 章）：shows/<showId>/images/<imageId>.<拡張子>。
 * 削除しても取り消しで戻せるよう、一覧から外すだけでファイルは残す（書き出しには使っている画像だけ入れる）。
 */

function imagesDir(showId: string): Directory {
  return new Directory(Paths.document, 'shows', showId, 'images');
}

export function imageFile(showId: string, asset: ImageAsset): File {
  return new File(Paths.document, 'shows', showId, asset.file);
}

const uriCache = new Map<string, string>();

/** 表示用の URI（ファイルがあることを一度確かめたら覚えておく） */
export function imageUri(show: Show, imageId: string | undefined): string | null {
  if (!imageId) return null;
  const a = show.images.find((x) => x.id === imageId);
  if (!a) return null;
  const key = `${show.id}/${a.file}`;
  const hit = uriCache.get(key);
  if (hit) return hit;
  const f = imageFile(show.id, a);
  if (!f.exists) return null;
  uriCache.set(key, f.uri);
  return f.uri;
}

function extOf(uri: string, mime?: string | null): string {
  const m = /\.([A-Za-z0-9]{2,5})(?:\?|$)/.exec(uri);
  if (m) return m[1]!.toLowerCase();
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/heic') return 'heic';
  return 'png';
}

/** 写真・ファイルから取り込む（元のファイルは写すだけで触らない） */
export function importImage(
  showId: string,
  src: { uri: string; width: number; height: number; fileName?: string | null; mimeType?: string | null },
): ImageAsset {
  const dir = imagesDir(showId);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const id = newId();
  const ext = extOf(src.fileName ?? src.uri, src.mimeType);
  const dest = new File(dir, `${id}.${ext}`);
  new File(src.uri).copySync(dest);
  const base = (src.fileName ?? '').replace(/\.[^.]+$/, '');
  return { id, name: base || '画像', file: `images/${id}.${ext}`, width: src.width, height: src.height };
}

/** ボタン・状態表示で使っている画像の ID */
export function usedImageIds(show: Show): Set<string> {
  const ids = new Set<string>();
  for (const p of show.pages) {
    for (const b of Object.values(p.buttons)) {
      if (b.style.imageId) ids.add(b.style.imageId);
      for (const f of b.feedbacks) if (f.style.imageId) ids.add(f.style.imageId);
    }
  }
  return ids;
}
