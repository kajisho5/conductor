import { useShowStore } from '@/stores/show';
import { EmptyState } from '@/components/ui/EmptyState';

/** トリガー（SPEC 2.1-4）。M1 は一覧の土台だけ（追加・編集・実行は M4） */
export default function TriggersScreen() {
  const count = useShowStore((s) => s.show?.triggers.length ?? 0);
  return (
    <EmptyState
      icon="bolt.fill"
      title={count === 0 ? 'トリガーはまだありません' : `${count} 件のトリガー`}
      message="「時刻になったら」「機器が切れたら」などのきっかけで、動作を自動で実行します。アプリが前面にある間だけ動きます。"
    />
  );
}
