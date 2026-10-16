import { useShowStore } from '@/stores/show';
import type { Show } from '@/model/types';
import { useRuntimeStore } from '@/stores/runtime';
import { persistedValues } from '@/model/variables';
import { saveShow, saveState } from './showFile';

/**
 * 自動保存（SPEC 2.3・9 章）：変更から 500ms 後にまとめて保存。失敗は onError で知らせる。
 * 戻り値で購読を解除する。
 */

export const AUTOSAVE_DELAY_MS = 500;

export function startAutosave(onError: (e: unknown) => void, save: (s: Show) => void = saveShow): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: Show | null = null;

  const flush = () => {
    timer = null;
    if (!latest) return;
    const s = latest;
    latest = null;
    try {
      save(s);
    } catch (e) {
      onError(e);
    }
  };

  const unsub = useShowStore.subscribe((state, prev) => {
    if (!state.show || state.show === prev.show) return;
    // 読み込み直後（別のショーに切り替えた時）は保存し直さない
    if (prev.show && prev.show.id !== state.show.id) return;
    if (!prev.show) return;
    latest = state.show;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, AUTOSAVE_DELAY_MS);
  });

  return () => {
    unsub();
    if (timer) {
      clearTimeout(timer);
      flush();
    }
  };
}

/** アプリが裏に回る時など、待たずにすぐ保存する */
export function saveNow(onError: (e: unknown) => void): void {
  const s = useShowStore.getState().show;
  if (!s) return;
  try {
    saveShow(s);
  } catch (e) {
    onError(e);
  }
}

/** 「再起動後も値を保持」の変数を、変わってから 500ms 後に保存する */
export function startStateAutosave(
  onError: (e: unknown) => void,
  save: (showId: string, v: Record<string, string>) => void = saveState,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = '';
  const flush = () => {
    timer = null;
    const show = useShowStore.getState().show;
    if (!show) return;
    const v = persistedValues(show, useRuntimeStore.getState().customValues);
    const text = JSON.stringify(v);
    if (text === last) return;
    last = text;
    try {
      save(show.id, v);
    } catch (e) {
      onError(e);
    }
  };
  const unsub = useRuntimeStore.subscribe((s, prev) => {
    if (s.customValues === prev.customValues) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, AUTOSAVE_DELAY_MS);
  });
  return () => {
    unsub();
    if (timer) {
      clearTimeout(timer);
      flush();
    }
  };
}
