import { router } from 'expo-router';
import type { View } from 'react-native';
import { useRuntimeStore } from '@/stores/runtime';
import { useShowStore } from '@/stores/show';
import { useUiStore } from '@/stores/ui';
import { askLock } from './lockPrompt';

/** ［本番］：ロック確認 → 全画面の本番へ（SPEC 3.4） */
export function openShow(anchor: View | null): void {
  const show = useShowStore.getState().show;
  if (!show) return;
  askLock(show.settings, anchor, (locked) => {
    useUiStore.getState().clearOp();
    useRuntimeStore.getState().setLocked(locked);
    router.push('/show');
  });
}
