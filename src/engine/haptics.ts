import * as Haptics from 'expo-haptics';

/** 触覚はシステムのパターンだけを使う（SPEC 4 章、HIG Playing haptics）。失敗しても動作は止めない */
export type HapticKind = 'medium' | 'heavy' | 'error' | 'success' | 'selection';

export function haptic(kind: HapticKind): void {
  let p: Promise<void>;
  switch (kind) {
    case 'medium':
      p = Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      break;
    case 'heavy':
      p = Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      break;
    case 'error':
      p = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      break;
    case 'success':
      p = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      break;
    case 'selection':
      p = Haptics.selectionAsync();
      break;
  }
  p.catch(() => undefined);
}
