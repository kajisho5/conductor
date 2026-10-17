import { demoShow } from '@/model/defaults';
import { loadInitialShow, loadShow, parseShow, saveShow, serializeShow, ShowFileError } from '@/storage/showFile';
import { startAutosave, AUTOSAVE_DELAY_MS } from '@/storage/autosave';
import { useShowStore } from '@/stores/show';
import { cellKey } from '@/model/grid';
import type { Show } from '@/model/types';

describe('保存', () => {
  it('保存して読み直すと同じ', () => {
    const s = demoShow();
    saveShow(s);
    expect(loadShow(s.id)).toEqual(s);
  });
  it('初回は空のショー（デモの機器なし）を作り、2 回目は同じものを読む', () => {
    (require('expo-file-system') as { __files: Map<string, unknown> }).__files.clear();
    const a = loadInitialShow();
    expect(a.created).toBe(true);
    expect(a.show.devices).toEqual([]);
    const b = loadInitialShow();
    expect(b.created).toBe(false);
    expect(b.show.id).toBe(a.show.id);
  });
  it('壊れたファイル・未対応の形式はエラー', () => {
    expect(() => parseShow('{')).toThrow(ShowFileError);
    expect(() => parseShow(JSON.stringify({ ...demoShow(), schemaVersion: 9 }))).toThrow('対応していない形式');
    expect(() => parseShow('null')).toThrow(ShowFileError);
    expect(parseShow(serializeShow(demoShow())).schemaVersion).toBe(1);
  });
});

describe('自動保存', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('変更から 500ms 後に 1 回だけ保存する', () => {
    const saved: Show[] = [];
    useShowStore.getState().setShow(demoShow());
    const stop = startAutosave(
      () => undefined,
      (s) => saved.push(s),
    );
    const pageId = useShowStore.getState().show!.pages[2]!.id;
    useShowStore.getState().createButton({ pageId, key: cellKey(3, 3) });
    useShowStore.getState().updateStyle({ pageId, key: cellKey(3, 3) }, { text: 'A' });
    jest.advanceTimersByTime(AUTOSAVE_DELAY_MS - 1);
    expect(saved).toHaveLength(0);
    jest.advanceTimersByTime(1);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.pages[2]!.buttons[cellKey(3, 3)]!.style.text).toBe('A');
    stop();
  });

  it('保存に失敗したら知らせる', () => {
    const errors: unknown[] = [];
    useShowStore.getState().setShow(demoShow());
    const stop = startAutosave(
      (e) => errors.push(e),
      () => {
        throw new Error('disk full');
      },
    );
    useShowStore.getState().renameShow('X');
    jest.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    expect(errors).toHaveLength(1);
    stop();
  });
});
