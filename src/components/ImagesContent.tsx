import { useShowStore } from '@/stores/show';
import { EmptyState } from '@/components/ui/EmptyState';

/** 画像（SPEC 2.1-6）。取り込み・一覧は M4 */
export function ImagesContent() {
  const count = useShowStore((s) => s.show?.images.length ?? 0);
  return (
    <EmptyState
      icon="photo.on.rectangle"
      title={count === 0 ? '画像はまだありません' : `${count} 枚の画像`}
      message="写真やファイルから取り込んだ画像を、ボタンの見た目や状態表示で使えます。"
    />
  );
}
