import { create } from 'zustand';
import { newButton, newPage } from '@/model/defaults';
import { cellKey, clampGrid, parseKey } from '@/model/grid';
import { newId } from '@/model/id';
import type { ButtonModel, ButtonStyle, Device, Page, Show, ShowSettings } from '@/model/types';

/**
 * 保存するデータ（ショー）のストア（SPEC 10 章）。変更は必ずここのアクション経由。
 * 保存はストアの外（src/storage/autosave.ts）で、変更から 500ms 後にまとめて行う。
 */

export interface CellRef {
  pageId: string;
  key: string;
}

interface ShowState {
  show: Show | null;
  /** 取り消し用の履歴（SPEC 10 章：50 手まで） */
  past: Show[];
  future: Show[];
  setShow: (show: Show) => void;
  undo: () => void;
  redo: () => void;
  /** 保存しておいた状態に戻す（取り消し可能な 1 手として積む） */
  restore: (show: Show) => void;

  createButton: (ref: CellRef) => ButtonModel | null;
  updateButton: (ref: CellRef, patch: Partial<Pick<ButtonModel, 'name' | 'notes' | 'options'>>) => void;
  updateStyle: (ref: CellRef, patch: Partial<ButtonStyle>) => void;
  /** ボタンの中身を作り替える（動作・状態表示などの編集。src/model/buttonEdits.ts の関数を渡す） */
  mutateButton: (ref: CellRef, recipe: (b: ButtonModel) => ButtonModel, coalesceKey?: string) => void;
  addDevice: (device: Device) => void;
  updateDevice: (deviceId: string, patch: Partial<Omit<Device, 'id'>>, coalesceKey?: string) => void;
  deleteDevice: (deviceId: string) => void;
  deleteButton: (ref: CellRef) => void;
  copyButton: (from: CellRef, to: CellRef) => void;
  moveButton: (from: CellRef, to: CellRef) => void;
  swapButtons: (a: CellRef, b: CellRef) => void;

  addPage: () => Page | null;
  renamePage: (pageId: string, name: string) => void;
  deletePage: (pageId: string) => void;
  duplicatePage: (pageId: string) => void;
  clearPage: (pageId: string) => void;
  movePage: (pageId: string, delta: -1 | 1) => void;

  setGrid: (columns: number, rows: number) => void;
  setDeviceEnabled: (deviceId: string, enabled: boolean) => void;
  updateSettings: (patch: Partial<ShowSettings>) => void;
  renameShow: (name: string) => void;
}

function touch(show: Show): Show {
  return { ...show, updatedAt: new Date().toISOString() };
}

function mapPage(show: Show, pageId: string, fn: (p: Page) => Page): Show {
  return touch({ ...show, pages: show.pages.map((p) => (p.id === pageId ? fn(p) : p)) });
}

function renumber(pages: Page[]): Page[] {
  return pages.map((p, i) => (p.number === i + 1 ? p : { ...p, number: i + 1 }));
}

/** 別のマスへ写す時は ID を振り直す（同じ ID のボタンが 2 つにならないように） */
export function cloneButton(b: ButtonModel): ButtonModel {
  const copy = JSON.parse(JSON.stringify(b)) as ButtonModel;
  copy.id = newId();
  copy.steps = copy.steps.map((s) => ({
    ...s,
    id: newId(),
    press: { ...s.press, actions: s.press.actions.map((a) => ({ ...a, id: newId() })) },
    release: { ...s.release, actions: s.release.actions.map((a) => ({ ...a, id: newId() })) },
    holds: s.holds.map((h) => ({
      ...h,
      id: newId(),
      actions: { ...h.actions, actions: h.actions.actions.map((a) => ({ ...a, id: newId() })) },
    })),
  }));
  copy.feedbacks = copy.feedbacks.map((f) => ({ ...f, id: newId() }));
  copy.localVariables = copy.localVariables.map((v) => ({ ...v, id: newId() }));
  return copy;
}

function getButton(show: Show, ref: CellRef): ButtonModel | undefined {
  return show.pages.find((p) => p.id === ref.pageId)?.buttons[ref.key];
}

function setButtonAt(show: Show, ref: CellRef, b: ButtonModel | undefined): Show {
  return mapPage(show, ref.pageId, (p) => {
    const buttons = { ...p.buttons };
    if (b) buttons[ref.key] = b;
    else delete buttons[ref.key];
    return { ...p, buttons };
  });
}

export const HISTORY_LIMIT = 50;
export const COALESCE_MS = 1500;

export const useShowStore = create<ShowState>((set, get) => {
  /** 変更を確定し、取り消し履歴に積む */
  let lastKey: string | null = null;
  let lastAt = 0;
  /**
   * 変更を確定し、取り消し履歴に積む。
   * 文字入力のように同じ項目への連続した変更（key が同じで 1.5 秒以内）は 1 手にまとめる。
   */
  const commit = (next: Show, key?: string): void => {
    const prev = get().show;
    const now = Date.now();
    const merge = key !== undefined && key === lastKey && now - lastAt < COALESCE_MS;
    lastKey = key ?? null;
    lastAt = now;
    if (merge) {
      set({ show: next, future: [] });
      return;
    }
    set({ show: next, past: prev ? [...get().past, prev].slice(-HISTORY_LIMIT) : get().past, future: [] });
  };
  return {
    show: null,
    past: [],
    future: [],
    setShow: (show) => set({ show, past: [], future: [] }),

    undo: () => {
      const { past, show, future } = get();
      const prev = past[past.length - 1];
      if (!prev || !show) return;
      set({ show: prev, past: past.slice(0, -1), future: [show, ...future].slice(0, HISTORY_LIMIT) });
    },

    redo: () => {
      const { past, show, future } = get();
      const next = future[0];
      if (!next || !show) return;
      set({ show: next, past: [...past, show].slice(-HISTORY_LIMIT), future: future.slice(1) });
    },

    restore: (snapshot) => {
      if (!get().show) return;
      commit(touch(snapshot));
    },

    createButton: (ref) => {
      const show = get().show;
      if (!show) return null;
      const existing = getButton(show, ref);
      if (existing) return existing;
      const b = newButton({ name: '' });
      commit(setButtonAt(show, ref, b));
      return b;
    },

    updateButton: (ref, patch) => {
      const show = get().show;
      if (!show) return;
      const b = getButton(show, ref);
      if (!b) return;
      commit(setButtonAt(show, ref, { ...b, ...patch }), `button:${b.id}:${Object.keys(patch).sort().join(',')}`);
    },

    updateStyle: (ref, patch) => {
      const show = get().show;
      if (!show) return;
      const b = getButton(show, ref);
      if (!b) return;
      commit(setButtonAt(show, ref, { ...b, style: { ...b.style, ...patch } }), `style:${b.id}:${Object.keys(patch).sort().join(',')}`);
    },

    mutateButton: (ref, recipe, coalesceKey) => {
      const show = get().show;
      if (!show) return;
      const b = getButton(show, ref);
      if (!b) return;
      const next = recipe(b);
      if (next === b) return;
      commit(setButtonAt(show, ref, next), coalesceKey ? `mutate:${b.id}:${coalesceKey}` : undefined);
    },

    addDevice: (device) => {
      const show = get().show;
      if (!show) return;
      commit(touch({ ...show, devices: [...show.devices, device] }));
    },

    updateDevice: (deviceId, patch, coalesceKey) => {
      const show = get().show;
      if (!show) return;
      commit(
        touch({ ...show, devices: show.devices.map((d) => (d.id === deviceId ? { ...d, ...patch } : d)) }),
        coalesceKey ? `device:${deviceId}:${coalesceKey}` : undefined,
      );
    },

    deleteDevice: (deviceId) => {
      const show = get().show;
      if (!show) return;
      commit(touch({ ...show, devices: show.devices.filter((d) => d.id !== deviceId) }));
    },

    deleteButton: (ref) => {
      const show = get().show;
      if (!show) return;
      commit(setButtonAt(show, ref, undefined));
    },

    copyButton: (from, to) => {
      const show = get().show;
      if (!show) return;
      const b = getButton(show, from);
      if (!b || (from.pageId === to.pageId && from.key === to.key)) return;
      commit(setButtonAt(show, to, cloneButton(b)));
    },

    moveButton: (from, to) => {
      const show = get().show;
      if (!show) return;
      const b = getButton(show, from);
      if (!b || (from.pageId === to.pageId && from.key === to.key)) return;
      const removed = setButtonAt(show, from, undefined);
      commit(setButtonAt(removed, to, b));
    },

    swapButtons: (a, b) => {
      const show = get().show;
      if (!show || (a.pageId === b.pageId && a.key === b.key)) return;
      const ba = getButton(show, a);
      const bb = getButton(show, b);
      const s1 = setButtonAt(show, a, bb);
      commit(setButtonAt(s1, b, ba));
    },

    addPage: () => {
      const show = get().show;
      if (!show) return null;
      const page = newPage(show.pages.length + 1, `ページ ${show.pages.length + 1}`);
      commit(touch({ ...show, pages: [...show.pages, page] }));
      return page;
    },

    renamePage: (pageId, name) => {
      const show = get().show;
      if (!show) return;
      commit(
        mapPage(show, pageId, (p) => ({ ...p, name })),
        `page-name:${pageId}`,
      );
    },

    deletePage: (pageId) => {
      const show = get().show;
      if (!show || show.pages.length <= 1) return;
      commit(touch({ ...show, pages: renumber(show.pages.filter((p) => p.id !== pageId)) }));
    },

    duplicatePage: (pageId) => {
      const show = get().show;
      if (!show) return;
      const idx = show.pages.findIndex((p) => p.id === pageId);
      const src = show.pages[idx];
      if (!src) return;
      const buttons: Record<string, ButtonModel> = {};
      for (const [k, b] of Object.entries(src.buttons)) buttons[k] = cloneButton(b);
      const copy: Page = { id: newId(), number: 0, name: `${src.name} のコピー`, buttons };
      const pages = [...show.pages];
      pages.splice(idx + 1, 0, copy);
      commit(touch({ ...show, pages: renumber(pages) }));
    },

    clearPage: (pageId) => {
      const show = get().show;
      if (!show) return;
      commit(mapPage(show, pageId, (p) => ({ ...p, buttons: {} })));
    },

    movePage: (pageId, delta) => {
      const show = get().show;
      if (!show) return;
      const idx = show.pages.findIndex((p) => p.id === pageId);
      const to = idx + delta;
      if (idx < 0 || to < 0 || to >= show.pages.length) return;
      const pages = [...show.pages];
      const [p] = pages.splice(idx, 1);
      if (!p) return;
      pages.splice(to, 0, p);
      commit(touch({ ...show, pages: renumber(pages) }));
    },

    setGrid: (columns, rows) => {
      const show = get().show;
      if (!show) return;
      const grid = clampGrid(columns, rows);
      // 範囲外になったボタンは消さずに残す（大きさを戻せば再び表示される）。表示はグリッドの範囲だけ
      commit(touch({ ...show, grid }));
    },

    setDeviceEnabled: (deviceId, enabled) => {
      const show = get().show;
      if (!show) return;
      commit(touch({ ...show, devices: show.devices.map((d) => (d.id === deviceId ? { ...d, enabled } : d)) }));
    },

    updateSettings: (patch) => {
      const show = get().show;
      if (!show) return;
      commit(touch({ ...show, settings: { ...show.settings, ...patch } }));
    },

    renameShow: (name) => {
      const show = get().show;
      if (!show) return;
      commit(touch({ ...show, name }), 'show-name');
    },
  };
});

/** グリッドの範囲内にあるボタンの数 */
export function visibleButtonCount(page: Page, columns: number, rows: number): number {
  return Object.keys(page.buttons).filter((k) => {
    const c = parseKey(k);
    return c.row < rows && c.col < columns;
  }).length;
}

export { cellKey };
