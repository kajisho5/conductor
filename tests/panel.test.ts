import type { ConductorPanel, ConductorPanelEvents, PanelInfo, PanelKey } from '../modules/conductor-panel/src';
import { newButton, newPage, newShow } from '@/model/defaults';
import { cellKey } from '@/model/grid';
import type { Show } from '@/model/types';
import {
  buildKeys,
  buttonForKey,
  canPressFromPanel,
  DEFAULT_USB_PANEL,
  keyCell,
  keyFontSize,
  keyState,
  panelPageNumber,
  PanelController,
  SENT_FLASH_MS,
  usbPanelSettings,
  usePanelStore,
  type KeyInputs,
} from '@/engine/panel';
import { isPressing } from '@/engine/press';
import { useRuntimeStore } from '@/stores/runtime';
import { useShowStore } from '@/stores/show';
import { useUiStore } from '@/stores/ui';

const PANEL: PanelInfo = { id: 'DEMO-PANEL-1', product: 'DEMO-PANEL', keyCount: 15, rows: 3, columns: 5, keyWidth: 72, keyHeight: 72 };

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

describe('USB ボタン盤：キーとマスの対応（SPEC 2.5）', () => {
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
    expect(panelPageNumber(s, { ...DEFAULT_USB_PANEL }, 1)).toBe(1);
    expect(panelPageNumber(s, { ...DEFAULT_USB_PANEL, page: 2 }, 1)).toBe(2);
    expect(panelPageNumber(s, { ...DEFAULT_USB_PANEL, page: 9 }, 1)).toBe(1);
  });

  test('設定が無いショーは既定値', () => {
    const s = newShow('DEMO');
    expect(usbPanelSettings(s)).toEqual(DEFAULT_USB_PANEL);
    s.settings.usbPanel = { ...DEFAULT_USB_PANEL, brightness: 40 };
    expect(usbPanelSettings(s).brightness).toBe(40);
  });
});

describe('USB ボタン盤：キーの表示', () => {
  test('文字・色・変数・空きマス', () => {
    const s = showWithButtons();
    const keys = buildKeys(PANEL, DEFAULT_USB_PANEL, inputs(s));
    expect(keys).toHaveLength(15);
    expect(keys[0]).toMatchObject({ text: 'CAM 1', backgroundColor: '#FFD60A', textColor: '#000000', empty: false, fontSize: 0 });
    expect(keys[7]).toMatchObject({ text: '1', backgroundColor: '#0A84FF', fontSize: keyFontSize('large', 72) });
    expect(keys[1]).toMatchObject({ empty: true });
    // 決まったページ
    const p2 = buildKeys(PANEL, { ...DEFAULT_USB_PANEL, page: 2 }, inputs(s));
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
    expect(buttonForKey(s, PANEL, DEFAULT_USB_PANEL, 1, 0)?.name).toBe('A');
    expect(buttonForKey(s, PANEL, DEFAULT_USB_PANEL, 2, 0)?.name).toBe('D');
    expect(buttonForKey(s, PANEL, DEFAULT_USB_PANEL, 1, 1)).toBeUndefined();
    expect(canPressFromPanel({ ...DEFAULT_USB_PANEL, editPress: false }, false)).toBe(false);
    expect(canPressFromPanel({ ...DEFAULT_USB_PANEL, editPress: false }, true)).toBe(true);
    expect(canPressFromPanel(DEFAULT_USB_PANEL, false)).toBe(true);
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

describe('USB ボタン盤：制御', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('つないだら描き、キーで押して離す。編集中も押せるがオフなら本番だけ', async () => {
    const show = showWithButtons();
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
    useShowStore.getState().updateSettings({ usbPanel: { ...DEFAULT_USB_PANEL, editPress: false } });
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
