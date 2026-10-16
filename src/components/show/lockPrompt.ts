import { ActionSheetIOS, Platform, findNodeHandle, type View } from 'react-native';
import type { ShowSettings } from '@/model/types';

/**
 * 本番に入る時の確認（SPEC 3.4）。
 * iPhone はアクションシート（キャンセルは最下部）、iPad は［本番］ボタンを指すポップオーバー。
 * 設定 > 本番 > ロック が「いつもロック／ロックしない」なら聞かずに入る。
 */

export const LOCK_TITLE = 'ロックしますか？';

export function lockMessage(unlockHoldMs: number): string {
  return `ロック中はボタンとページ切替だけ操作できます。解除は右上を ${(unlockHoldMs / 1000).toFixed(1)} 秒長押し。`;
}

export function askLock(settings: ShowSettings, anchor: View | null, enter: (locked: boolean) => void): void {
  if (settings.lockOnShowMode === 'always') {
    enter(true);
    return;
  }
  if (settings.lockOnShowMode === 'never' || Platform.OS !== 'ios') {
    enter(false);
    return;
  }
  const node = anchor ? findNodeHandle(anchor) : null;
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title: LOCK_TITLE,
      message: lockMessage(settings.unlockHoldMs),
      options: ['ロックして本番へ', 'ロックせずに本番へ', 'キャンセル'],
      cancelButtonIndex: 2,
      anchor: node ?? undefined,
    },
    (i) => {
      if (i === 0) enter(true);
      else if (i === 1) enter(false);
    },
  );
}
