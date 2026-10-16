import { ActionSheetIOS, Platform, findNodeHandle, type View } from 'react-native';
import { parseKey } from '@/model/grid';
import type { ButtonModel, Page, Show } from '@/model/types';
import type { CellRef } from '@/stores/show';
import { useShowStore } from '@/stores/show';
import { useUiStore, type CellOp } from '@/stores/ui';
import { getDefinition } from '@/drivers/registry';
import { buttonFromPreset } from '@/model/presets';
import { haptic } from '@/engine/haptics';

export function positionLabel(pageNumber: number, key: string): string {
  const c = parseKey(key);
  return `ページ ${pageNumber} · ${c.row + 1}行目 ${c.col + 1}列目`;
}

/** 上部の帯（ページ/位置表示）。ボタンごとの設定が「全体の設定」なら設定 > ボタン に従う */
export function topBarText(show: Show, button: ButtonModel | undefined, pageNumber: number, key: string): string | null {
  if (!button) return null;
  const on = button.style.showTopBar === 'inherit' ? show.settings.showTopBar : button.style.showTopBar === 'show';
  if (!on) return null;
  const c = parseKey(key);
  return `${pageNumber}/${c.row + 1}.${c.col + 1}`;
}

export function currentPage(show: Show, pageNumber: number): Page {
  return show.pages.find((p) => p.number === pageNumber) ?? show.pages[0]!;
}

/** コピー／移動／入れ替えの置き先をタップした時 */
export function completeOp(op: CellOp, from: CellRef, to: CellRef): void {
  const s = useShowStore.getState();
  if (op === 'copy') s.copyButton(from, to);
  else if (op === 'move') s.moveButton(from, to);
  else s.swapButtons(from, to);
  useUiStore.getState().clearOp();
  useUiStore.getState().select(to);
}

export function deleteCell(ref: CellRef): void {
  useShowStore.getState().deleteButton(ref);
}

/**
 * 長押しメニュー（HIG Context menus：同じ操作を盤の下にも置く）。
 * iPhone はアクションシート、iPad は押したボタンを指すポップオーバー。
 */
export function openCellMenu(ref: CellRef, anchor: View | null): void {
  if (Platform.OS !== 'ios') return;
  const options = ['コピー', '移動', '入れ替え', '削除', 'キャンセル'];
  const node = anchor ? findNodeHandle(anchor) : null;
  ActionSheetIOS.showActionSheetWithOptions(
    {
      options,
      destructiveButtonIndex: 3,
      cancelButtonIndex: 4,
      anchor: node ?? undefined,
    },
    (i) => {
      const ui = useUiStore.getState();
      if (i === 0) ui.startOp('copy', ref);
      else if (i === 1) ui.startOp('move', ref);
      else if (i === 2) ui.startOp('swap', ref);
      else if (i === 3) deleteCell(ref);
    },
  );
}

/** 選んだプリセットを空きマスに置く。続けて別のマスにも置ける（終わるまで選んだまま） */
export function placePreset(show: Show, pick: { deviceId: string; presetId: string }, ref: CellRef): boolean {
  const device = show.devices.find((d) => d.id === pick.deviceId);
  const preset = device ? getDefinition(device.driverId)?.presets?.find((p) => p.id === pick.presetId) : undefined;
  if (!device || !preset) {
    useUiStore.getState().pickPreset(null);
    return false;
  }
  const ok = useShowStore.getState().placeButton(ref, buttonFromPreset(device, preset));
  if (!ok && show.settings.haptics) haptic('error');
  return ok;
}
