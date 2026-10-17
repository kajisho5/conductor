import { AppState, type NativeEventSubscription } from 'react-native';
import { create } from 'zustand';
import {
  getConductorPanel,
  type ConductorPanel,
  type PanelErrorKind,
  type PanelInfo,
  type PanelKey,
  type PanelKeyState,
} from '../../modules/conductor-panel/src';
import { cellKey } from '@/model/grid';
import type { ButtonModel, ButtonStyle, Show, StreamDeckEntry } from '@/model/types';
import { bindPanels, streamDeckEditPress, streamDecks, type ConnectedPanel } from '@/model/streamDeck';
import { useRuntimeStore, type PressVisual } from '@/stores/runtime';
import { useShowStore } from '@/stores/show';
import { useUiStore } from '@/stores/ui';
import { imageUri } from '@/storage/images';
import { resolveText, usesClock, type ResolveContext } from '@/variables/resolve';
import { resolveStyle } from './executor';
import { pressDown, pressUp } from './press';
import { log } from '@/stores/log';

/**
 * Stream Deck（SPEC 2.5・2.5.1）。iPad のボタンの一部を、つないだ Stream Deck のキーにそのまま出し、キーの押下をボタンの押下にする。
 * - 設定で登録した機種（キーの数・並び）と、つないだ機器を製品番号・シリアルで結びつける（src/model/streamDeck.ts）
 * - 表示するページ：iPad と同じ（既定）／決まったページ。範囲：盤の何行目何列目からキーの数だけ（登録ごと）
 * - 押せるのは本番画面、または「編集中も押せる」がオンの時
 * - 登録していない機器のキーは黒。変わったキーだけネイティブで描き直す（ネイティブ側で同じ内容は送らない）
 */

/** 1 台分の表示の設定（登録の一部） */
export type PanelLayout = Pick<StreamDeckEntry, 'page' | 'row' | 'col' | 'brightness'>;

/** 「送れた」をキーに出しておく時間 */
export const SENT_FLASH_MS = 350;
/** 表示を描き直すまで待つ時間（続けて変わった時にまとめる） */
const RENDER_DELAY_MS = 16;

/** キーの番号 → ボタン盤のマス（範囲の外・グリッドの外は null） */
export function keyCell(
  index: number,
  panel: Pick<PanelInfo, 'columns' | 'rows'>,
  settings: Pick<PanelLayout, 'row' | 'col'>,
  grid: { columns: number; rows: number },
): { row: number; col: number } | null {
  if (panel.columns <= 0) return null;
  const r = Math.floor(index / panel.columns);
  const c = index % panel.columns;
  if (r >= panel.rows) return null;
  const row = r + settings.row - 1;
  const col = c + settings.col - 1;
  if (row < 0 || col < 0 || row >= grid.rows || col >= grid.columns) return null;
  return { row, col };
}

/** 表示するページの番号（決まったページが消えていたら iPad と同じに戻す） */
export function panelPageNumber(show: Show, settings: Pick<PanelLayout, 'page'>, current: number): number {
  if (settings.page !== 'follow' && show.pages.some((p) => p.number === settings.page)) return settings.page;
  return current;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  if (h.length < 6) return 0;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function keyTextColor(style: ButtonStyle): string {
  if (style.textColor !== 'auto') return style.textColor;
  return luminance(style.backgroundColor) > 0.55 ? '#000000' : '#FFFFFF';
}

/** 文字の大きさ（キーの高さに対する割合）。auto は 0（ネイティブで収まる大きさにする） */
export function keyFontSize(size: ButtonStyle['textSize'], keyHeight: number): number {
  if (size === 'auto') return 0;
  if (typeof size === 'number') return Math.max(8, Math.min(Math.round(size * 0.75), Math.round(keyHeight * 0.4)));
  const k = size === 'small' ? 0.15 : size === 'large' ? 0.26 : 0.2;
  return Math.max(8, Math.round(keyHeight * k));
}

/** 押下表現 → キーの状態（押している／送れた（短い間）／送れなかった（次に送れるまで）） */
export function keyState(press: PressVisual | undefined, sentUntil: number | undefined, now: number): PanelKeyState {
  if (!press) return 'none';
  if (press.phase === 'pressing' || press.phase === 'running') return 'pressing';
  if (press.phase === 'failed' || press.warn) return 'failed';
  if (press.phase === 'sent' && sentUntil !== undefined && now < sentUntil) return 'sent';
  return 'none';
}

export interface KeyInputs {
  show: Show;
  pageNumber: number;
  values: Record<string, Record<string, string>>;
  status: Record<string, string>;
  custom: Record<string, string>;
  press: Record<string, PressVisual>;
  sentUntil: Record<string, number>;
  now: Date;
  imageFor: (show: Show, imageId: string | undefined) => string | null;
}

export function blankKey(index: number): PanelKey {
  return { index, text: '', textColor: '#FFFFFF', backgroundColor: '#000000', imageUri: '', state: 'none', offline: false, fontSize: 0, empty: true };
}

/** キー全部の表示内容 */
export function buildKeys(panel: PanelInfo, settings: PanelLayout, input: KeyInputs): PanelKey[] {
  const { show } = input;
  const pageNo = panelPageNumber(show, settings, input.pageNumber);
  const page = show.pages.find((p) => p.number === pageNo) ?? show.pages[0];
  const keys: PanelKey[] = [];
  for (let index = 0; index < panel.keyCount; index++) {
    const cell = keyCell(index, panel, settings, show.grid);
    const button = cell && page ? page.buttons[cellKey(cell.row, cell.col)] : undefined;
    if (!button) {
      keys.push(blankKey(index));
      continue;
    }
    const ctx: ResolveContext = {
      show,
      values: input.values,
      pageNumber: pageNo,
      now: input.now,
      button,
      custom: input.custom,
      status: input.status,
    };
    const { style, offline } = resolveStyle(button, show, input.values, input.status, ctx);
    keys.push({
      index,
      text: resolveText(style.text, ctx),
      textColor: keyTextColor(style),
      backgroundColor: style.backgroundColor,
      imageUri: input.imageFor(show, style.imageId) ?? '',
      state: keyState(input.press[button.id], input.sentUntil[button.id], input.now.getTime()),
      offline,
      fontSize: keyFontSize(style.textSize, panel.keyHeight),
      empty: false,
    });
  }
  return keys;
}

/** そのキーのボタン（押した時に使う） */
export function buttonForKey(show: Show, panel: PanelInfo, settings: PanelLayout, pageNumber: number, index: number): ButtonModel | undefined {
  const cell = keyCell(index, panel, settings, show.grid);
  if (!cell) return undefined;
  const pageNo = panelPageNumber(show, settings, pageNumber);
  const page = show.pages.find((p) => p.number === pageNo);
  return page?.buttons[cellKey(cell.row, cell.col)];
}

/** 本番画面か、「編集中も押せる」がオンなら押せる */
export function canPressFromPanel(editPress: boolean, inShowMode: boolean): boolean {
  return inShowMode || editPress;
}

function toConnected(p: PanelInfo): ConnectedPanel {
  return { id: p.id, serial: p.serial, productId: p.productId, keyCount: p.keyCount, columns: p.columns, rows: p.rows };
}

function usesClockAnywhere(show: Show): boolean {
  return show.pages.some((p) =>
    Object.values(p.buttons).some(
      (b) => usesClock(b.style.text) || b.feedbacks.some((f) => usesClock(f.style.text ?? '') || usesClock(JSON.stringify(f.options))),
    ),
  );
}

// ---- 画面に出す状態 ----

interface PanelState {
  /** ネイティブのモジュールがあり、iPad である */
  supported: boolean;
  panels: PanelInfo[];
  /** つないだ機器 id → 登録 id */
  bindings: Record<string, string>;
  /** つないでいるが登録していない機器 */
  unregistered: PanelInfo[];
  /** 設定画面で選んでいる登録（regular 幅の右側） */
  selectedEntryId: string | null;
  /** 最後のつなぎ失敗（つながったら消す） */
  error: { kind: PanelErrorKind; message: string } | null;
  driverApp: boolean | null;
  setPanels: (panels: PanelInfo[]) => void;
  setError: (e: { kind: PanelErrorKind; message: string } | null) => void;
  setDriverApp: (v: boolean) => void;
}

export const usePanelStore = create<PanelState>((set) => ({
  supported: false,
  panels: [],
  bindings: {},
  unregistered: [],
  selectedEntryId: null,
  error: null,
  driverApp: null,
  setPanels: (panels) => set(panels.length > 0 ? { panels, error: null } : { panels }),
  setError: (error) => set({ error }),
  setDriverApp: (driverApp) => set({ driverApp }),
}));

// ---- 制御 ----

export class PanelController {
  private native: ConductorPanel | null = null;
  private subs: { remove(): void }[] = [];
  private appSub: NativeEventSubscription | null = null;
  private unsubs: (() => void)[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;
  private sentUntil: Record<string, number> = {};
  private lastSeq: Record<string, number> = {};
  /** 押しているキー（離す時はページが変わっていても同じボタンを離す） */
  private held = new Map<string, ButtonModel>();
  private lastBrightness: Record<string, number> = {};
  /** 黒にした登録していない機器（何度も送らない） */
  private blanked = new Set<string>();
  private gotEvent = false;

  constructor(private getNative: () => ConductorPanel | null = getConductorPanel) {}

  start(): void {
    const native = this.getNative();
    if (!native || !native.isSupported()) {
      usePanelStore.setState({ supported: false });
      return;
    }
    this.native = native;
    usePanelStore.setState({ supported: true });
    this.subs.push(
      native.addListener('onPanelsChanged', ({ panels }) => {
        this.gotEvent = true;
        const before = new Set(usePanelStore.getState().panels.map((p) => p.id));
        usePanelStore.getState().setPanels(panels);
        for (const p of panels) {
          if (!before.has(p.id)) log('info', 'Stream Deck', `つながりました（${p.product || '機種不明'}・${p.keyCount} キー・${p.columns} × ${p.rows}）`);
        }
        this.releaseHeld(new Set(panels.map((p) => p.id)));
        this.lastBrightness = {};
        this.blanked.clear();
        this.rebind();
      }),
      native.addListener('onKey', ({ id, index, pressed }) => this.onKey(id, index, pressed)),
      native.addListener('onPanelError', (e) => {
        usePanelStore.getState().setError(e);
        log('warn', 'Stream Deck', e.message);
      }),
    );
    this.unsubs.push(
      useRuntimeStore.subscribe((s, prev) => {
        if (s.press !== prev.press) this.notePress(s.press);
        if (
          s.press !== prev.press ||
          s.pageNumber !== prev.pageNumber ||
          s.deviceValues !== prev.deviceValues ||
          s.deviceStatus !== prev.deviceStatus ||
          s.customValues !== prev.customValues
        ) {
          this.schedule();
        }
      }),
      useShowStore.subscribe((s, prev) => {
        if (s.show !== prev.show) {
          if (s.show?.settings.streamDecks !== prev.show?.settings.streamDecks) this.rebind();
          this.schedule();
          this.updateClock();
        }
      }),
    );
    this.appSub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') this.releaseHeld();
      else void this.refreshDriverApp();
    });
    void this.refreshDriverApp();
    this.gotEvent = false;
    void native
      .start()
      .then(() => native.listPanels())
      .then((panels) => {
        // 探し始めた後に届いた知らせの方が新しい
        if (!this.gotEvent) usePanelStore.getState().setPanels(panels);
        this.rebind();
      })
      .catch((e: unknown) => log('warn', 'Stream Deck', `探せません：${e instanceof Error ? e.message : String(e)}`));
    this.updateClock();
  }

  stop(): void {
    this.releaseHeld();
    for (const s of this.subs) s.remove();
    this.subs = [];
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.appSub?.remove();
    this.appSub = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.clock) clearInterval(this.clock);
    this.clock = null;
    void this.native?.stop();
    this.native = null;
    usePanelStore.setState({ panels: [], bindings: {}, unregistered: [] });
  }

  /** つないだ機器と登録を結び直す。初めて結んだ機器のシリアルは登録に覚える */
  private rebind(): void {
    const show = useShowStore.getState().show;
    const panels = usePanelStore.getState().panels;
    if (!show) return;
    const { bound, unregistered, learn } = bindPanels(streamDecks(show), panels.map(toConnected));
    const bindings: Record<string, string> = {};
    for (const [panelId, entry] of bound) bindings[panelId] = entry.id;
    const unreg = panels.filter((p) => unregistered.some((u) => u.id === p.id));
    const prev = usePanelStore.getState().bindings;
    // 結びつけが変わった・外れた機器で押していたボタンは離す
    for (const k of [...this.held.keys()]) {
      const panelId = k.slice(0, k.lastIndexOf(':'));
      if (prev[panelId] !== bindings[panelId]) this.releaseHeld(undefined, panelId);
    }
    for (const id of Object.keys(bindings)) this.blanked.delete(id);
    usePanelStore.setState({ bindings, unregistered: unreg });
    if (learn.size > 0) {
      useShowStore.getState().mutateShow(
        (s) => ({
          ...s,
          settings: {
            ...s.settings,
            streamDecks: streamDecks(s).map((e) => (learn.has(e.id) ? { ...e, serial: learn.get(e.id) } : e)),
          },
        }),
        'stream-deck-serial',
      );
    }
    this.lastBrightness = {};
    this.schedule();
  }

  async refreshDriverApp(): Promise<void> {
    if (!this.native) return;
    try {
      usePanelStore.getState().setDriverApp(await this.native.isDriverAppInstalled());
    } catch {
      usePanelStore.getState().setDriverApp(false);
    }
  }

  /** 設定を変えた時など、すぐ描き直す */
  refresh(): void {
    this.lastBrightness = {};
    this.schedule();
  }

  private updateClock(): void {
    const show = useShowStore.getState().show;
    const need = !!show && usesClockAnywhere(show);
    if (need && !this.clock) this.clock = setInterval(() => this.schedule(), 1000);
    if (!need && this.clock) {
      clearInterval(this.clock);
      this.clock = null;
    }
  }

  private notePress(press: Record<string, PressVisual>): void {
    const now = Date.now();
    for (const [id, p] of Object.entries(press)) {
      if (this.lastSeq[id] === p.seq) continue;
      this.lastSeq[id] = p.seq;
      if (p.phase === 'sent') {
        this.sentUntil[id] = now + SENT_FLASH_MS;
        setTimeout(() => this.schedule(), SENT_FLASH_MS + 10);
      }
    }
  }

  private schedule(): void {
    if (!this.native || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.render();
    }, RENDER_DELAY_MS);
  }

  private render(): void {
    const native = this.native;
    const show = useShowStore.getState().show;
    const panels = usePanelStore.getState().panels;
    if (!native || !show || panels.length === 0) return;
    const { bindings } = usePanelStore.getState();
    const entries = streamDecks(show);
    const rt = useRuntimeStore.getState();
    const input: KeyInputs = {
      show,
      pageNumber: rt.pageNumber,
      values: rt.deviceValues,
      status: rt.deviceStatus,
      custom: rt.customValues,
      press: rt.press,
      sentUntil: this.sentUntil,
      now: new Date(),
      imageFor: imageUri,
    };
    for (const panel of panels) {
      const entry = entries.find((e) => e.id === bindings[panel.id]);
      if (!entry) {
        // 登録していない機器は黒にする（1 回だけ）
        if (this.blanked.has(panel.id)) continue;
        this.blanked.add(panel.id);
        const blank = Array.from({ length: panel.keyCount }, (_, i) => blankKey(i));
        void native.setKeys(panel.id, blank).catch(() => undefined);
        continue;
      }
      if (this.lastBrightness[panel.id] !== entry.brightness) {
        this.lastBrightness[panel.id] = entry.brightness;
        void native.setBrightness(panel.id, entry.brightness);
      }
      void native.setKeys(panel.id, buildKeys(panel, entry, input)).catch((e: unknown) => {
        log('warn', 'Stream Deck', `キーの表示を送れません：${e instanceof Error ? e.message : String(e)}`);
      });
    }
  }

  private onKey(id: string, index: number, pressed: boolean): void {
    const show = useShowStore.getState().show;
    const panel = usePanelStore.getState().panels.find((p) => p.id === id);
    if (!show || !panel) return;
    const k = `${id}:${index}`;
    if (!pressed) {
      const b = this.held.get(k);
      if (!b) return;
      this.held.delete(k);
      void pressUp(b, show);
      return;
    }
    const entry = streamDecks(show).find((e) => e.id === usePanelStore.getState().bindings[id]);
    if (!entry) return;
    if (!canPressFromPanel(streamDeckEditPress(show), useUiStore.getState().inShowMode)) return;
    const button = buttonForKey(show, panel, entry, useRuntimeStore.getState().pageNumber, index);
    if (!button || this.held.has(k)) return;
    this.held.set(k, button);
    pressDown(button, show);
  }

  /**
   * 押したままのボタンを離す。keep を渡すとその機器以外、panelId を渡すとその機器だけ。どちらも無ければ全部
   */
  private releaseHeld(keep?: Set<string>, panelId?: string): void {
    const show = useShowStore.getState().show;
    const out: ButtonModel[] = [];
    for (const [k, b] of [...this.held]) {
      const pid = k.slice(0, k.lastIndexOf(':'));
      if (keep && keep.has(pid)) continue;
      if (panelId !== undefined && pid !== panelId) continue;
      this.held.delete(k);
      out.push(b);
    }
    if (!show) return;
    for (const b of out) void pressUp(b, show);
  }
}

export const panelController = new PanelController();
