import { ActionSheetIOS, Platform, findNodeHandle, type View } from 'react-native';
import { defaultOptions, getDefinition, INTERNAL_DEFINITION } from '@/drivers/registry';
import type { ActionDef, FeedbackDef } from '@/drivers/types';
import type { Show } from '@/model/types';

/**
 * 「＋ 動作を追加」「＋ 状態表示を追加」の選択（SPEC 15.5：呼び出し元を指すポップオーバー。iPhone はアクションシート）。
 * 1 段目で機器、2 段目でその機器の動作を選ぶ。
 */

function sheet(title: string, labels: string[], anchor: View | null, done: (i: number) => void): void {
  if (Platform.OS !== 'ios') return;
  const options = [...labels, 'キャンセル'];
  ActionSheetIOS.showActionSheetWithOptions(
    { title, options, cancelButtonIndex: options.length - 1, anchor: anchor ? (findNodeHandle(anchor) ?? undefined) : undefined },
    (i) => {
      if (i < labels.length) done(i);
    },
  );
}

export function pickAction(
  show: Show,
  anchor: View | null,
  done: (deviceId: string, def: ActionDef, options: Record<string, string | number | boolean>) => void,
): void {
  const sources = [
    ...show.devices
      .map((d) => ({ id: d.id, label: d.label, def: getDefinition(d.driverId) }))
      .filter((s) => (s.def?.actions.length ?? 0) > 0),
    { id: 'internal', label: '内部（ページ・ステップ・ロックなど）', def: INTERNAL_DEFINITION },
  ];
  sheet(
    'どの機器の動作？',
    sources.map((s) => s.label),
    anchor,
    (i) => {
      const src = sources[i];
      if (!src?.def) return;
      const actions = src.def.actions;
      // 続けてシートを出すと iPad のポップオーバーが重なって表示されないため、閉じるのを待つ
      setTimeout(() => {
        sheet(
          `${src.label} の動作`,
          actions.map((a) => a.name),
          anchor,
          (j) => {
            const a = actions[j];
            if (a) done(src.id, a, defaultOptions(a.options));
          },
        );
      }, 350);
    },
  );
}

export function pickFeedback(
  show: Show,
  anchor: View | null,
  done: (deviceId: string, def: FeedbackDef, options: Record<string, string | number | boolean>) => void,
): boolean {
  const sources = [
    ...show.devices
      .map((d) => ({ id: d.id, label: d.label, def: getDefinition(d.driverId) }))
      .filter((s) => (s.def?.feedbacks.length ?? 0) > 0),
    { id: 'internal', label: '変数・式', def: INTERNAL_DEFINITION },
  ];
  sheet(
    'どの機器の状態？',
    sources.map((s) => s.label),
    anchor,
    (i) => {
      const src = sources[i];
      if (!src?.def) return;
      const fbs = src.def.feedbacks;
      setTimeout(() => {
        sheet(
          `${src.label} の状態`,
          fbs.map((f) => f.name),
          anchor,
          (j) => {
            const f = fbs[j];
            if (f) done(src.id, f, defaultOptions(f.options));
          },
        );
      }, 350);
    },
  );
  return true;
}
