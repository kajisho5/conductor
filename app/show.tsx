import { router } from 'expo-router';
import { useShowStore } from '@/stores/show';
import { useRuntimeStore } from '@/stores/runtime';
import { ShowScreen } from '@/components/show/ShowScreen';

/** 本番（全画面モーダル）。ロック中は閉じられない（右上の長押しで解除してから） */
export default function ShowRoute() {
  const show = useShowStore((s) => s.show);
  if (!show) return null;
  return (
    <ShowScreen
      show={show}
      onClose={() => {
        useRuntimeStore.getState().setLocked(false);
        if (router.canGoBack()) router.back();
        else router.replace('/buttons');
      }}
    />
  );
}
