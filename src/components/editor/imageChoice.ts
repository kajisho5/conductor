import type { View } from 'react-native';
import type { Show } from '@/model/types';
import { pickImages } from '@/components/ImagesContent';
import { sheet } from './sheet';

/** 画像を選ぶ：なし／取り込み済みの画像／写真から取り込む（取り込んだ 1 枚目を選ぶ） */
export function chooseImage(show: Show, anchor: View | null, onPick: (imageId: string | undefined) => void, noneLabel = 'なし'): void {
  sheet(
    '画像',
    [
      { label: noneLabel, run: () => onPick(undefined) },
      ...show.images.map((img) => ({ label: img.name, run: () => onPick(img.id) })),
      {
        label: '写真から取り込む…',
        run: () => {
          void pickImages(show).then((added) => {
            if (added[0]) onPick(added[0].id);
          });
        },
      },
    ],
    anchor,
  );
}
