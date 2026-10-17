import { useRef } from 'react';
import { Alert, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Stack } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import type { ImageAsset, Show } from '@/model/types';
import { useShowStore } from '@/stores/show';
import { imageFile, importImage, usedImageIds } from '@/storage/images';
import { color, radius } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { sheet } from '@/components/editor/sheet';

/**
 * 画像（SPEC 2.1-6、docs/design 10）：写真から取り込み、名前を付けて一覧で管理。ボタンの見た目・状態表示で使う。
 * 写真の選択はシステムのピッカー（写真ライブラリ全体への許可は求めない）。
 */

export async function pickImages(show: Show): Promise<ImageAsset[]> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 1 });
  if (r.canceled) return [];
  const added: ImageAsset[] = [];
  for (const a of r.assets) {
    try {
      added.push(importImage(show.id, { uri: a.uri, width: a.width, height: a.height, fileName: a.fileName, mimeType: a.mimeType }));
    } catch (e) {
      Alert.alert('取り込めませんでした', e instanceof Error ? e.message : String(e));
    }
  }
  if (added.length) useShowStore.getState().mutateShow((s) => ({ ...s, images: [...s.images, ...added] }));
  return added;
}

export function ImagesContent() {
  const show = useShowStore((s) => s.show);
  const { width } = useWindowDimensions();
  if (!show) return null;
  const add = () => void pickImages(show);
  const header = (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button icon="plus" accessibilityLabel="画像を取り込む" onPress={add} />
    </Stack.Toolbar>
  );
  if (show.images.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon="photo.on.rectangle"
          title="画像はまだありません"
          message="写真から取り込んだ画像を、ボタンの見た目や状態表示で使えます。"
          actionLabel="写真から取り込む"
          onAction={add}
        />
      </>
    );
  }
  const used = usedImageIds(show);
  const cols = Math.max(2, Math.floor((width - 32) / 160));
  const size = Math.floor((width - 32 - (cols - 1) * 12) / cols);
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      {header}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {show.images.map((img) => (
          <ImageTile key={img.id} show={show} img={img} size={Math.min(size, 220)} used={used.has(img.id)} />
        ))}
      </View>
    </ScrollView>
  );
}

function ImageTile({ show, img, size, used }: { show: Show; img: ImageAsset; size: number; used: boolean }) {
  const ref = useRef<View>(null);
  const f = imageFile(show.id, img);
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={`${img.name}、${img.width}×${img.height}${used ? '、使用中' : ''}`}
      onPress={() =>
        sheet(
          img.name,
          [
            {
              label: '名前を変える',
              run: () =>
                Alert.prompt(
                  '名前を変える',
                  undefined,
                  [
                    { text: 'キャンセル', style: 'cancel' },
                    {
                      text: '変更',
                      onPress: (name?: string) => {
                        const n = name?.trim();
                        if (n)
                          useShowStore
                            .getState()
                            .mutateShow((s) => ({ ...s, images: s.images.map((x) => (x.id === img.id ? { ...x, name: n } : x)) }));
                      },
                    },
                  ],
                  'plain-text',
                  img.name,
                ),
            },
            {
              label: used ? '削除（ボタンから外れます）' : '削除',
              destructive: true,
              run: () =>
                useShowStore.getState().mutateShow((s) => ({
                  ...s,
                  images: s.images.filter((x) => x.id !== img.id),
                  pages: s.pages.map((p) => ({
                    ...p,
                    buttons: Object.fromEntries(
                      Object.entries(p.buttons).map(([k, b]) => {
                        if (b.style.imageId !== img.id && !b.feedbacks.some((fb) => fb.style.imageId === img.id)) return [k, b];
                        const style = { ...b.style };
                        if (style.imageId === img.id) delete style.imageId;
                        const feedbacks = b.feedbacks.map((fb) => {
                          if (fb.style.imageId !== img.id) return fb;
                          const st = { ...fb.style };
                          delete st.imageId;
                          return { ...fb, style: st };
                        });
                        return [k, { ...b, style, feedbacks }];
                      }),
                    ),
                  })),
                })),
            },
          ],
          ref.current,
        )
      }
      style={{ width: size }}
    >
      <View style={{ width: size, height: size, borderRadius: radius.card, backgroundColor: color.fill, overflow: 'hidden' }}>
        {f.exists ? (
          <Image source={{ uri: f.uri }} style={{ width: size, height: size }} contentFit="contain" accessibilityIgnoresInvertColors />
        ) : null}
      </View>
      <AppText variant="footnote" numberOfLines={1} style={{ marginTop: 6 }}>
        {img.name}
      </AppText>
      <AppText variant="caption" tone="label2">{`${img.width}×${img.height}${used ? '・使用中' : ''}`}</AppText>
    </Pressable>
  );
}
