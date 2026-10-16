import { create } from 'zustand';

/**
 * 保存しない実行時の状態（SPEC 5 章末・10 章）：機器の状態、ボタンの押下表現、本番のロック、表示中のページ。
 */

export type DeviceStatus = 'connected' | 'connecting' | 'reconnecting' | 'error' | 'disabled';

/** 押下表現の段階（SPEC 4 章） */
export type PressPhase = 'idle' | 'pressing' | 'sent' | 'failed' | 'running';

export interface PressVisual {
  phase: PressPhase;
  /** 同じ段階が続けて起きてもアニメーションを出し直すための通し番号 */
  seq: number;
  /** 「送れなかった」の ⚠ を次に送れるまで残す（SPEC 4 章） */
  warn: boolean;
}

interface RuntimeState {
  deviceStatus: Record<string, DeviceStatus>;
  /** 機器ごとの最後のエラー（機器一覧・診断に出す） */
  deviceError: Record<string, string | undefined>;
  /** 機器ごとの状態値（変数・状態表示の元） */
  deviceValues: Record<string, Record<string, string>>;
  press: Record<string, PressVisual>;
  /** ボタンごとの現在のステップ（0 始まり） */
  stepIndex: Record<string, number>;
  /** 表示中のページ番号（本番・ボタン画面で共通、1 始まり） */
  pageNumber: number;
  locked: boolean;
  /** 自分で作る変数の今の値（名前 → 値）。「再起動後も保持」のものは state.json に保存 */
  customValues: Record<string, string>;

  setDeviceStatus: (id: string, s: DeviceStatus, error?: string) => void;
  setDeviceValues: (id: string, values: Record<string, string>) => void;
  setDeviceValue: (id: string, key: string, value: string) => void;
  getDeviceValue: (id: string, key: string) => string | undefined;
  setPress: (buttonId: string, phase: PressPhase) => void;
  setStep: (buttonId: string, index: number) => void;
  setPageNumber: (n: number) => void;
  setLocked: (v: boolean) => void;
  setCustomValue: (name: string, value: string) => void;
  setCustomValues: (values: Record<string, string>) => void;
}

export const useRuntimeStore = create<RuntimeState>((set, get) => ({
  deviceStatus: {},
  deviceError: {},
  deviceValues: {},
  press: {},
  stepIndex: {},
  pageNumber: 1,
  locked: false,
  customValues: {},

  setDeviceStatus: (id, s, error) => {
    const st = get();
    if (st.deviceStatus[id] === s && st.deviceError[id] === error) return;
    set({ deviceStatus: { ...st.deviceStatus, [id]: s }, deviceError: { ...st.deviceError, [id]: error } });
  },
  setDeviceValues: (id, values) => {
    const cur = get().deviceValues[id] ?? {};
    if (Object.entries(values).every(([k, v]) => cur[k] === v)) return;
    set({ deviceValues: { ...get().deviceValues, [id]: { ...cur, ...values } } });
  },
  setDeviceValue: (id, key, value) => {
    const cur = get().deviceValues[id] ?? {};
    set({ deviceValues: { ...get().deviceValues, [id]: { ...cur, [key]: value } } });
  },
  getDeviceValue: (id, key) => get().deviceValues[id]?.[key],
  setPress: (buttonId, phase) => {
    const prev = get().press[buttonId];
    const warn = phase === 'failed' ? true : phase === 'sent' ? false : (prev?.warn ?? false);
    set({ press: { ...get().press, [buttonId]: { phase, seq: (prev?.seq ?? 0) + 1, warn } } });
  },
  setStep: (buttonId, index) => set({ stepIndex: { ...get().stepIndex, [buttonId]: index } }),
  setPageNumber: (n) => set({ pageNumber: n }),
  setLocked: (v) => set({ locked: v }),
  setCustomValue: (name, value) => {
    if (get().customValues[name] === value) return;
    set({ customValues: { ...get().customValues, [name]: value } });
  },
  setCustomValues: (customValues) => set({ customValues }),
}));
