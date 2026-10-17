import { requireOptionalNativeModule, type EventSubscription, type NativeModule } from 'expo-modules-core';

/**
 * conductor-panel の JS インターフェース（SPEC 2.5 Stream Deck）。ネイティブ（Swift / IOKit）は ios/ 配下。
 * jest・Android・iPhone ではモジュールが無いか isSupported() が false。
 */

export interface PanelInfo {
  id: string;
  /** シリアル番号（読めなければ ''） */
  serial: string;
  /** 製品番号（USB の idProduct。機種を決める） */
  productId: number;
  /** 機種名（ドライバが返す名前） */
  product: string;
  keyCount: number;
  rows: number;
  columns: number;
  keyWidth: number;
  keyHeight: number;
}

export type PanelKeyState = 'none' | 'pressing' | 'sent' | 'failed';

/** キー 1 つ分の表示。色は '#RRGGBB'（ボタンの内容の色） */
export interface PanelKey {
  index: number;
  text: string;
  textColor: string;
  backgroundColor: string;
  /** file:// の画像。無ければ '' */
  imageUri: string;
  state: PanelKeyState;
  offline: boolean;
  /** 0 で自動 */
  fontSize: number;
  /** ボタンの無いマス（黒） */
  empty: boolean;
}

export type PanelErrorKind = 'entitlement' | 'open' | 'driver' | 'driver-version';

export type ConductorPanelEvents = {
  onPanelsChanged: (ev: { panels: PanelInfo[] }) => void;
  onKey: (ev: { id: string; index: number; pressed: boolean }) => void;
  onPanelError: (ev: { kind: PanelErrorKind; message: string }) => void;
};

export interface ConductorPanel {
  /** iPad なら true（M1 以降かどうかはドライバが見つかるかで分かる） */
  isSupported(): boolean;
  /** メーカーの接続アプリが入っているか */
  isDriverAppInstalled(): Promise<boolean>;
  /** つながっているボタン盤を探し始める（つないだ・外した時に onPanelsChanged） */
  start(): Promise<void>;
  stop(): Promise<void>;
  listPanels(): Promise<PanelInfo[]>;
  /** 変わったキーだけ描き直す（同じ内容は送らない） */
  setKeys(id: string, keys: PanelKey[]): Promise<void>;
  /** 0–100 */
  setBrightness(id: string, percent: number): Promise<void>;
  addListener<K extends keyof ConductorPanelEvents>(event: K, listener: ConductorPanelEvents[K]): EventSubscription;
}

type NativeShape = NativeModule<ConductorPanelEvents> & Omit<ConductorPanel, 'addListener'>;

let cached: ConductorPanel | null | undefined;

export function getConductorPanel(): ConductorPanel | null {
  if (cached !== undefined) return cached;
  const native = requireOptionalNativeModule<NativeShape>('ConductorPanel');
  cached = native ? (native as unknown as ConductorPanel) : null;
  return cached;
}

/** テスト用：実装を差し替える */
export function setConductorPanelForTesting(impl: ConductorPanel | null | undefined): void {
  cached = impl;
}
