import { create } from 'zustand';
import type { Show } from '@/model/types';
import type { CellRef } from './show';

/**
 * 画面の一時状態（保存しない）：選択中のマス、設定欄の切替、コピー/移動/入れ替えの途中、iPhone の列ブロック。
 */

export type InspectorSegment = 'button' | 'page' | 'presets';
export type InspectorTab = 'actions' | 'style' | 'feedback' | 'variables' | 'options';
export type CellOp = 'copy' | 'move' | 'swap';

interface UiState {
  selected: CellRef | null;
  segment: InspectorSegment;
  tab: InspectorTab;
  /** コピー／移動／入れ替え：元のマスを覚えて、次にタップしたマスへ */
  pending: { op: CellOp; from: CellRef } | null;
  /** compact 幅で表示中の列ブロック（0 = 1–4 列） */
  columnBlock: number;
  /** プリセットを選んで、置くマスを待っている */
  pendingPreset: { deviceId: string; presetId: string } | null;
  /** 他のアプリから開いた .conductor（読み込みの確認を出す） */
  pendingImport: string | null;
  /** プリセットタブで表示中の機器 */
  presetDeviceId: string | null;
  /** compact の編集シートを開く直前のショー（［キャンセル］でここへ戻す） */
  sheetSnapshot: Show | null;
  /** 本番画面を表示中（Stream Deckの「編集中も押せる」の判断に使う） */
  inShowMode: boolean;

  select: (ref: CellRef | null) => void;
  setSegment: (s: InspectorSegment) => void;
  setTab: (t: InspectorTab) => void;
  startOp: (op: CellOp, from: CellRef) => void;
  clearOp: () => void;
  setColumnBlock: (n: number) => void;
  setSheetSnapshot: (s: Show | null) => void;
  pickPreset: (p: { deviceId: string; presetId: string } | null) => void;
  setPresetDevice: (id: string | null) => void;
  setPendingImport: (uri: string | null) => void;
  setInShowMode: (v: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selected: null,
  segment: 'button',
  tab: 'style',
  pending: null,
  columnBlock: 0,
  sheetSnapshot: null,
  pendingPreset: null,
  presetDeviceId: null,
  pendingImport: null,
  inShowMode: false,

  select: (ref) => set({ selected: ref }),
  setSegment: (segment) => set({ segment }),
  setTab: (tab) => set({ tab }),
  startOp: (op, from) => set({ pending: { op, from }, pendingPreset: null }),
  clearOp: () => set({ pending: null }),
  setColumnBlock: (columnBlock) => set({ columnBlock }),
  setSheetSnapshot: (sheetSnapshot) => set({ sheetSnapshot }),
  pickPreset: (pendingPreset) => set({ pendingPreset, pending: null }),
  setPresetDevice: (presetDeviceId) => set({ presetDeviceId }),
  setPendingImport: (pendingImport) => set({ pendingImport }),
  setInShowMode: (inShowMode) => set({ inShowMode }),
}));

export const OP_LABEL: Record<CellOp, string> = {
  copy: 'コピー',
  move: '移動',
  swap: '入れ替え',
};
