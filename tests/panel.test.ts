import type { ConductorPanel, ConductorPanelEvents, PanelInfo, PanelKey } from '../modules/conductor-panel/src';
import { newButton, newPage, newShow } from '@/model/defaults';
import { cellKey } from '@/model/grid';
import type { Show, StreamDeckEntry } from '@/model/types';
import {
  addStreamDeck,
  bindPanels,
  changeStreamDeckModel,
  modelForPanel,
  newStreamDeck,
  removeStreamDeck,
  STREAM_DECK_MODELS,
  streamDeckModel,
  streamDecks,
} from '@/model/streamDeck';
import {
  buildKeys,
  buttonForKey,
  canPressFromPanel,
  keyCell,
  keyFontSize,
  keyState,
  panelPageNumber,
  PanelController,
  SENT_FLASH_MS,
  usePanelStore,
  type KeyInputs,
  type PanelLayout,
} from '@/engine/panel';
import { isPressing } from '@/engine/press';
import { useRuntimeStore } from '@/stores/runtime';
import { useShowStore } from '@/stores/show';
import { useUiStore } from '@/stores/ui';

const PANEL: PanelInfo = {
  id: 'DEMO-SERIAL-1',
  serial: 'DEMO-SERIAL-1',
  productId: 0x0080,
  product: 'DEMO-PANEL',
  keyCount: 15,
  rows: 3,
  columns: 5,
  keyWidth: 72,
  keyHeight: 72,
};
const LAYOUT: PanelLayout = { page: 'follow', row: 1, col: 1, brightness: 70 };

function showWithButtons(): Show {
  const s = newShow('DEMO');
  s.grid = { columns: 8, rows: 4 };
  const p1 = s.pages[0]!;
  p1.buttons[cellKey(0, 0)] = newButton({ name: 'A', style: { text: 'CAM 1', backgroundColor: '#FFD60A', textColor: 'auto' } });
  p1.buttons[cellKey(1, 2)] = newButton({ name: 'B', style: { text: '$(internal:page)', backgroundColor: '#0A84FF', textSize: 'large' } });
  p1.buttons[cellKey(3, 7)] = newButton({ name: 'C', style: { text: 'OUT', backgroundColor: '#FF453A' } });
  const p2 = newPage(2, '二');
  p2.buttons[cellKey(0, 0)] = newButton({ name: 'D', style: { text: 'P2', backgroundColor: '#30D158' } });
  s.pages.push(p2);
  return s;
}

function inputs(show: Show, extra?: Partial<KeyInputs>): KeyInputs {
  return {
    show,
    pageNumber: 1,
    values: {},
    status: {},
    custom: {},
    press: {},
    sentUntil: {},
    now: new Date(0),
    imageFor: () => null,
    ...extra,
  };
}

describe('Stream Deck：キーとマスの対応（SPEC 2.5）', () => {
  test('左上から盤のキー数だけ。範囲の外は null', () => {
    const grid = { columns: 8, rows: 4 };
    expect(keyCell(0, PANEL, { row: 1, col: 1 }, grid)).toEqual({ row: 0, col: 0 });
    expect(keyCell(7, PANEL, { row: 1, col: 1 }, grid)).toEqual({ row: 1, col: 2 });
    expect(keyCell(14, PANEL, { row: 1, col: 1 }, grid)).toEqual({ row: 2, col: 4 });
    expect(keyCell(15, PANEL, { row: 1, col: 1 }, grid)).toBeNull();
    // 2 行目 4 列目から：右下のキーはグリッドの外
    expect(keyCell(0, PANEL, { row: 2, col: 4 }, grid)).toEqual({ row: 1, col: 3 });
    expect(keyCell(4, PANEL, { row: 2, col: 4 }, grid)).toEqual({ row: 1, col: 7 });
    expect(keyCell(14, PANEL, { row: 3, col: 4 }, grid)).toBeNull();
  });

  test('ページ：iPad と同じ／決まったページ（消えたら iPad と同じ）', () => {
    const s = showWithButtons();
    expect(panelPageNumber(s, LAYOUT, 1)).toBe(1);
    expect(panelPageNumber(s, { ...LAYOUT, page: 2 }, 1)).toBe(2);
    expect(panelPageNumber(s, { ...LAYOUT, page: 9 }, 1)).toBe(1);
  });
});

describe('Stream Deck：機種と登録（SPEC 2.5.1）', () => {
  test('機種の表', () => {
    expect(STREAM_DECK_MODELS.map((m) => [m.id, m.keys, m.columns, m.rows])).toEqual([
      ['mini', 6, 3, 2],
      ['mk2', 15, 5, 3],
      ['neo', 8, 4, 2],
      ['plus', 8, 4, 2],
      ['xl', 32, 8, 4],
      ['plusxl', 36, 9, 4],
      ['pedal', 3, 3, 1],
    ]);
    for (const m of STREAM_DECK_MODELS) expect(m.keys).toBe(m.columns * m.rows);
  });

  test('製品番号で機種、無ければ形で（形が同じ機種が 2 つなら決めない）', () => {
    expect(modelForPanel({ productId: 0x00a5, keyCount: 15, columns: 5, rows: 3 })?.id).toBe('mk2');
    expect(modelForPanel({ productId: 0x00ba, keyCount: 32, columns: 8, rows: 4 })?.id).toBe('xl');
    expect(modelForPanel({ productId: 0xffff, keyCount: 6, columns: 3, rows: 2 })?.id).toBe('mini');
    expect(modelForPanel({ productId: 0xffff, keyCount: 8, columns: 4, rows: 2 })).toBeNull();
  });

  test('名前・追加・機種変更・削除', () => {
    let s = newShow('DEMO');
    expect(streamDecks(s)).toEqual([]);
    const a = newStreamDeck(s, 'mk2');
    s = addStreamDeck(s, a);
    const b = newStreamDeck(s, 'mk2', 'DEMO-SERIAL-9');
    s = addStreamDeck(s, b);
    expect(streamDecks(s).map((e) => e.name)).toEqual(['Stream Deck MK.2', 'Stream Deck MK.2 2']);
    expect(b).toMatchObject({ serial: 'DEMO-SERIAL-9', page: 'follow', row: 1, col: 1, brightness: 70 });
    s = changeStreamDeckModel(s, b.id, 'xl');
    expect(streamDecks(s)[1]).toMatchObject({ model: 'xl' });
    expect(streamDecks(s)[1]!.serial).toBeUndefined();
    s = removeStreamDeck(s, a.id);
    expect(streamDecks(s).map((e) => e.id)).toEqual([b.id]);
    expect(streamDeckModel('pedal').keyPx).toBe(0);
  });

  test('つないだ機器と登録の結びつけ', () => {
    const entry = (id: string, model: StreamDeckEntry['model'], serial?: string): StreamDeckEntry => ({
      id,
      name: id,
      model,
      ...(serial ? { serial } : {}),
      page: 'follow',
      row: 1,
      col: 1,
      brightness: 70,
    });
    const p = (id: string, productId: number, keyCount: number, columns: number, rows: number) => ({ id, serial: id, productId, keyCount, columns, rows });
    const entries = [entry('E1', 'mk2'), entry('E2', 'mk2', 'S-B'), entry('E3', 'mini')];
    // シリアルが合うものが先、残りは覚えていない登録へ（シリアルを覚える）
    const r1 = bindPanels(entries, [p('S-A', 0x0080, 15, 5, 3), p('S-B', 0x0080, 15, 5, 3)]);
    expect(r1.bound.get('S-B')?.id).toBe('E2');
    expect(r1.bound.get('S-A')?.id).toBe('E1');
    expect(r1.learn.get('E1')).toBe('S-A');
    expect(r1.unregistered).toEqual([]);
    // 登録していない機種・登録と違う機種
    const r2 = bindPanels(entries, [p('S-X', 0x006c, 32, 8, 4)]);
    expect(r2.bound.size).toBe(0);
    expect(r2.unregistered.map((u) => u.id)).toEqual(['S-X']);
    // 同じ機種がもう 1 台（空きの登録なし）
    const r3 = bindPanels([entry('E2', 'mk2', 'S-B')], [p('S-C', 0x0080, 15, 5, 3)]);
    expect(r3.unregistered.map((u) => u.id)).toEqual(['S-C']);
  });
});

describe('Stream Deck：キーの表示', () => {
  test('文字・色・変数・空きマス', () => {
    const s = showWithButtons();
    const keys = buildKeys(PANEL, LAYOUT, inputs(s));
    expect(keys).toHaveLength(15);
    expect(keys[0]).toMatchObject({ text: 'CAM 1', backgroundColor: '#FFD60A', textColor: '#000000', empty: false, fontSize: 0 });
    expect(keys[7]).toMatchObject({ text: '1', backgroundColor: '#0A84FF', fontSize: keyFontSize('large', 72) });
    expect(keys[1]).toMatchObject({ empty: true });
    // 決まったページ
    const p2 = buildKeys(PANEL, { ...LAYOUT, page: 2 }, inputs(s));
    expect(p2[0]).toMatchObject({ text: 'P2' });
    expect(p2[7]).toMatchObject({ empty: true });
  });

  test('押下表現：押している／送れた（短い間）／送れなかった', () => {
    expect(keyState(undefined, undefined, 0)).toBe('none');
    expect(keyState({ phase: 'pressing', seq: 1, warn: false }, undefined, 0)).toBe('pressing');
    expect(keyState({ phase: 'running', seq: 1, warn: false }, undefined, 0)).toBe('pressing');
    expect(keyState({ phase: 'sent', seq: 2, warn: false }, 100, 50)).toBe('sent');
    expect(keyState({ phase: 'sent', seq: 2, warn: false }, 100, 150)).toBe('none');
    expect(keyState({ phase: 'failed', seq: 3, warn: true }, undefined, 0)).toBe('failed');
    expect(keyState({ phase: 'idle', seq: 4, warn: true }, undefined, 0)).toBe('failed');
  });

  test('キーからボタン、押せるか', () => {
    const s = showWithButtons();
    expect(buttonForKey(s, PANEL, LAYOUT, 1, 0)?.name).toBe('A');
    expect(buttonForKey(s, PANEL, LAYOUT, 2, 0)?.name).toBe('D');
    expect(buttonForKey(s, PANEL, LAYOUT, 1, 1)).toBeUndefined();
    expect(canPressFromPanel(false, false)).toBe(false);
    expect(canPressFromPanel(false, true)).toBe(true);
    expect(canPressFromPanel(true, false)).toBe(true);
  });
});

class FakePanel implements ConductorPanel {
  listeners: { [K in keyof ConductorPanelEvents]?: ConductorPanelEvents[K][] } = {};
  sent: { id: string; keys: PanelKey[] }[] = [];
  brightness: number[] = [];
  isSupported() {
    return true;
  }
  async isDriverAppInstalled() {
    return true;
  }
  async start() {}
  async stop() {}
  async listPanels() {
    return [] as PanelInfo[];
  }
  async setKeys(id: string, keys: PanelKey[]) {
    this.sent.push({ id, keys });
  }
  async setBrightness(_id: string, percent: number) {
    this.brightness.push(percent);
  }
  addListener<K extends keyof ConductorPanelEvents>(event: K, listener: ConductorPanelEvents[K]) {
    const list = (this.listeners[event] ??= []) as ConductorPanelEvents[K][];
    list.push(listener);
    return { remove: () => list.splice(list.indexOf(listener), 1) };
  }
  emit<K extends keyof ConductorPanelEvents>(event: K, payload: Parameters<ConductorPanelEvents[K]>[0]) {
    for (const l of this.listeners[event] ?? []) (l as (p: typeof payload) => void)(payload);
  }
}

describe('Stream Deck：制御', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('登録していない機器は黒、登録すると描く', () => {
    const show = showWithButtons();
    useShowStore.getState().setShow(show);
    useRuntimeStore.getState().setPageNumber(1);
    const fake = new FakePanel();
    const ctl = new PanelController(() => fake);
    ctl.start();
    fake.emit('onPanelsChanged', { panels: [PANEL] });
    jest.advanceTimersByTime(30);
    expect(usePanelStore.getState().unregistered.map((p) => p.id)).toEqual([PANEL.id]);
    expect(fake.sent.at(-1)!.keys.every((k) => k.empty)).toBe(true);
    expect(fake.brightness).toEqual([]);
    // キーを押しても何もしない
    fake.emit('onKey', { id: PANEL.id, index: 0, pressed: true });
    expect(isPressing(show.pages[0]!.buttons[cellKey(0, 0)]!.id)).toBe(false);
    fake.emit('onKey', { id: PANEL.id, index: 0, pressed: false });
    // 登録 → 結びつき、シリアルを覚えて描く
    const cur = useShowStore.getState().show!;
    useShowStore.getState().mutateShow((s) => addStreamDeck(s, newStreamDeck(cur, 'mk2')));
    jest.advanceTimersByTime(30);
    expect(usePanelStore.getState().unregistered).toEqual([]);
    expect(streamDecks(useShowStore.getState().show!)[0]!.serial).toBe(PANEL.serial);
    expect(fake.sent.at(-1)!.keys[0]!.text).toBe('CAM 1');
    ctl.stop();
  });

  test('つないだら描き、キーで押して離す。編集中も押せるがオフなら本番だけ', async () => {
    const base = showWithButtons();
    const show = addStreamDeck(base, newStreamDeck(base, 'mk2'));
    useShowStore.getState().setShow(show);
    useRuntimeStore.getState().setPageNumber(1);
    useUiStore.getState().setInShowMode(false);
    const fake = new FakePanel();
    const ctl = new PanelController(() => fake);
    ctl.start();
    expect(usePanelStore.getState().supported).toBe(true);

    fake.emit('onPanelsChanged', { panels: [PANEL] });
    jest.advanceTimersByTime(30);
    expect(fake.sent.length).toBe(1);
    expect(fake.sent[0]!.keys[0]!.text).toBe('CAM 1');
    expect(fake.brightness).toEqual([70]);

    // ページを変えるとキーも変わる
    useRuntimeStore.getState().setPageNumber(2);
    jest.advanceTimersByTime(30);
    expect(fake.sent.at(-1)!.keys[0]!.text).toBe('P2');
    useRuntimeStore.getState().setPageNumber(1);
    jest.advanceTimersByTime(30);

    // キーを押す → ボタンを押している
    const a = show.pages[0]!.buttons[cellKey(0, 0)]!;
    fake.emit('onKey', { id: PANEL.id, index: 0, pressed: true });
    expect(isPressing(a.id)).toBe(true);
    jest.advanceTimersByTime(30);
    expect(fake.sent.at(-1)!.keys[0]!.state).toBe('pressing');
    fake.emit('onKey', { id: PANEL.id, index: 0, pressed: false });
    expect(isPressing(a.id)).toBe(false);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // 「編集中も押せる」オフ：編集中は押せない、本番では押せる
    useShowStore.getState().updateSettings({ streamDeckEditPress: false });
    fake.emit('onKey', { id: PANEL.id, index: 0, pressed: true });
    expect(isPressing(a.id)).toBe(false);
    useUiStore.getState().setInShowMode(true);
    fake.emit('onKey', { id: PANEL.id, index: 0, pressed: true });
    expect(isPressing(a.id)).toBe(true);
    // 外すと離す
    fake.emit('onPanelsChanged', { panels: [] });
    expect(isPressing(a.id)).toBe(false);

    ctl.stop();
    useUiStore.getState().setInShowMode(false);
    expect(SENT_FLASH_MS).toBeGreaterThan(0);
  });

  test('iPhone（モジュールが無い）では何もしない', () => {
    const ctl = new PanelController(() => null);
    ctl.start();
    expect(usePanelStore.getState().supported).toBe(false);
    ctl.stop();
  });
});
