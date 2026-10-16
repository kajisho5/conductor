import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { Directory, File, Paths } from 'expo-file-system';
import { newId } from '@/model/id';
import { uniqueLabel } from '@/model/devices';
import { uniqueVariableName } from '@/model/buttonEdits';
import type { Show } from '@/model/types';
import { cloneButton } from '@/stores/show';
import { imageFile } from './images';
import { parseShow, ShowFileError } from './showFile';

/**
 * 書き出し・読み込み（SPEC 9 章）：`.conductor`（zip：show.json＋images/）。
 * ショー全体／ページ単位／トリガー単位。読み込みは「新しいショーとして」か「今のショーに追加」。
 */

export const EXTENSION = 'conductor';

export type ExportScope = { kind: 'show' } | { kind: 'page'; pageId: string } | { kind: 'trigger'; triggerId: string };

export interface Package {
  /** 中身の種類（読み込み時の説明に使う） */
  kind: ExportScope['kind'];
  show: Show;
}

/** 書き出す中身を絞る（ページなら、そのページと使っている機器・画像だけ） */
export function narrow(show: Show, scope: ExportScope): Show {
  if (scope.kind === 'show') return show;
  if (scope.kind === 'page') {
    const page = show.pages.find((p) => p.id === scope.pageId);
    if (!page) throw new ShowFileError('ページが見つかりません');
    const used = new Set<string>();
    const images = new Set<string>();
    for (const b of Object.values(page.buttons)) {
      for (const st of b.steps)
        for (const a of [...st.press.actions, ...st.release.actions, ...st.holds.flatMap((h) => h.actions.actions)]) used.add(a.deviceId);
      for (const f of b.feedbacks) {
        used.add(f.deviceId);
        if (f.style.imageId) images.add(f.style.imageId);
      }
      if (b.style.imageId) images.add(b.style.imageId);
    }
    return {
      ...show,
      pages: [{ ...page, number: 1 }],
      devices: show.devices.filter((d) => used.has(d.id)),
      triggers: [],
      images: show.images.filter((i) => images.has(i.id)),
    };
  }
  const t = show.triggers.find((x) => x.id === scope.triggerId);
  if (!t) throw new ShowFileError('トリガーが見つかりません');
  const used = new Set<string>([...t.actions.actions.map((a) => a.deviceId), ...t.conditions.map((c) => c.deviceId)]);
  for (const e of t.events) if ('deviceId' in e) used.add(e.deviceId);
  return { ...show, pages: [], devices: show.devices.filter((d) => used.has(d.id)), triggers: [t], images: [] };
}

export function packShow(show: Show, scope: ExportScope, readImage: (file: string) => Uint8Array | null): Uint8Array {
  const part = narrow(show, scope);
  const files: Record<string, Uint8Array> = {
    'show.json': strToU8(JSON.stringify({ ...part, exportKind: scope.kind })),
  };
  for (const img of part.images) {
    const bytes = readImage(img.file);
    if (bytes) files[img.file] = bytes;
  }
  return zipSync(files, { level: 6 });
}

export function unpack(bytes: Uint8Array): { pkg: Package; images: Record<string, Uint8Array> } {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new ShowFileError('.conductor のファイルとして読めません');
  }
  const json = files['show.json'];
  if (!json) throw new ShowFileError('ファイルの中に show.json がありません');
  const raw = strFromU8(json);
  const show = parseShow(raw);
  const kind = (JSON.parse(raw) as { exportKind?: unknown }).exportKind;
  const images: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(files)) if (k.startsWith('images/')) images[k] = v;
  return { pkg: { kind: kind === 'page' || kind === 'trigger' ? kind : 'show', show }, images };
}

/** 読み込みの前に見せる要約 */
export function describePackage(pkg: Package): string {
  const s = pkg.show;
  const kind = pkg.kind === 'page' ? 'ページ' : pkg.kind === 'trigger' ? 'トリガー' : 'ショー';
  return `${kind}「${s.name}」：ページ ${s.pages.length}・機器 ${s.devices.length}・トリガー ${s.triggers.length}・画像 ${s.images.length}`;
}

/** 新しいショーとして：ショーの ID と名前だけ変える */
export function asNewShow(pkg: Package, existingNames: string[]): Show {
  const now = new Date().toISOString();
  let name = pkg.show.name;
  if (existingNames.includes(name)) name = `${name}（読み込み）`;
  return { ...pkg.show, id: newId(), name, createdAt: now, updatedAt: now };
}

/**
 * 今のショーに追加：機器は ID が同じなら今のものを使い、無ければ名前を重ならないようにして足す。
 * ページは後ろに足し、ボタン・トリガー・変数・画像の ID は振り直す。変数名が重なる時は今のものを使う。
 */
export function mergeInto(target: Show, pkg: Package): { show: Show; imageMap: Record<string, string> } {
  const src = pkg.show;
  const deviceMap: Record<string, string> = {};
  const devices = [...target.devices];
  for (const d of src.devices) {
    const same = target.devices.find((x) => x.id === d.id);
    if (same) {
      deviceMap[d.id] = same.id;
      continue;
    }
    const id = newId();
    deviceMap[d.id] = id;
    const label = devices.some((x) => x.label.toLowerCase() === d.label.toLowerCase())
      ? uniqueLabel(d.label.replace(/-\d+$/, ''), devices)
      : d.label;
    devices.push({ ...d, id, label });
  }
  const mapDevice = (id: string) => (id === 'internal' ? id : (deviceMap[id] ?? id));

  const imageMap: Record<string, string> = {};
  const images = [...target.images];
  for (const img of src.images) {
    const id = newId();
    imageMap[img.id] = id;
    const ext = img.file.split('.').pop() ?? 'png';
    images.push({ ...img, id, file: `images/${id}.${ext}` });
  }
  const mapImage = (id: string | undefined) => (id ? (imageMap[id] ?? id) : id);

  const pages = [...target.pages];
  for (const p of src.pages) {
    const buttons: Show['pages'][number]['buttons'] = {};
    for (const [k, b] of Object.entries(p.buttons)) {
      const c = cloneButton(b);
      c.steps = c.steps.map((s) => ({
        ...s,
        press: { ...s.press, actions: s.press.actions.map((a) => ({ ...a, deviceId: mapDevice(a.deviceId) })) },
        release: { ...s.release, actions: s.release.actions.map((a) => ({ ...a, deviceId: mapDevice(a.deviceId) })) },
        holds: s.holds.map((h) => ({
          ...h,
          actions: { ...h.actions, actions: h.actions.actions.map((a) => ({ ...a, deviceId: mapDevice(a.deviceId) })) },
        })),
      }));
      c.feedbacks = c.feedbacks.map((f) => ({
        ...f,
        deviceId: mapDevice(f.deviceId),
        style: { ...f.style, imageId: mapImage(f.style.imageId) },
      }));
      c.style = { ...c.style, imageId: mapImage(c.style.imageId) };
      if (!c.style.imageId) delete c.style.imageId;
      buttons[k] = c;
    }
    pages.push({ id: newId(), number: pages.length + 1, name: p.name, buttons });
  }

  const triggers = [
    ...target.triggers,
    ...src.triggers.map((t) => ({
      ...t,
      id: newId(),
      actions: { ...t.actions, actions: t.actions.actions.map((a) => ({ ...a, id: newId(), deviceId: mapDevice(a.deviceId) })) },
      conditions: t.conditions.map((c) => ({ ...c, id: newId(), deviceId: mapDevice(c.deviceId) })),
      events: t.events.map((e) => ('deviceId' in e ? { ...e, deviceId: mapDevice(e.deviceId) } : e)),
      localVariables: t.localVariables.map((v) => ({ ...v, id: newId() })),
    })),
  ];

  const customNames = target.customVariables.map((v) => v.name);
  const customVariables = [
    ...target.customVariables,
    ...src.customVariables.filter((v) => !customNames.includes(v.name)).map((v) => ({ ...v, id: newId() })),
  ];
  const exprNames = target.expressionVariables.map((v) => v.name);
  const expressionVariables = [
    ...target.expressionVariables,
    ...src.expressionVariables
      .filter((v) => !exprNames.includes(v.name))
      .map((v) => ({ ...v, id: newId(), name: uniqueVariableName(v.name, exprNames) })),
  ];

  return {
    show: { ...target, devices, pages, triggers, customVariables, expressionVariables, images, updatedAt: new Date().toISOString() },
    imageMap,
  };
}

/* ---------- ファイルとの出し入れ（端末の上で） ---------- */

export function safeFileName(name: string): string {
  return (name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'conductor').slice(0, 60);
}

/** 書き出したファイル（キャッシュ）を作って返す。共有シートは呼び出し側 */
export function writeExport(show: Show, scope: ExportScope, label: string): File {
  const bytes = packShow(show, scope, (file) => {
    const f = new File(Paths.document, 'shows', show.id, file);
    return f.exists ? f.bytesSync() : null;
  });
  const dir = new Directory(Paths.cache, 'exports');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const out = new File(dir, `${safeFileName(label)}.${EXTENSION}`);
  if (out.exists) out.delete();
  out.write(bytes);
  return out;
}

export function readPackage(uri: string): { pkg: Package; images: Record<string, Uint8Array> } {
  return unpack(new File(uri).bytesSync());
}

/** 読み込んだ画像をショーの images/ へ書く（imageMap は古い ID → 新しい ID。新しいショーとしてなら空でよい） */
export function writeImages(show: Show, images: Record<string, Uint8Array>, srcShow: Show, imageMap: Record<string, string>): void {
  for (const img of srcShow.images) {
    const bytes = images[img.file];
    if (!bytes) continue;
    const newIdOrSame = imageMap[img.id] ?? img.id;
    const asset = show.images.find((x) => x.id === newIdOrSame);
    if (!asset) continue;
    const f = imageFile(show.id, asset);
    const dir = new Directory(Paths.document, 'shows', show.id, 'images');
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    if (f.exists) f.delete();
    f.write(bytes);
  }
}
