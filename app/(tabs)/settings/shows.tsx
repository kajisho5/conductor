import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { useShowStore } from '@/stores/show';
import { createShow, deleteShowFiles, duplicateShowFiles, listShows, type ShowSummary } from '@/storage/shows';
import { loadShow } from '@/storage/showFile';
import { switchToShow } from '@/storage/session';
import { color, MIN_TAP } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/Buttons';
import { Section } from '@/components/ui/Group';
import { Symbol } from '@/components/ui/Symbol';
import { sheet } from '@/components/editor/sheet';

/** ショーの一覧（SPEC 2.1-7）：切替・新規・複製・削除。名前の変更は設定の「名前」 */
export default function ShowsScreen() {
  const current = useShowStore((s) => s.show);
  const [shows, setShows] = useState<ShowSummary[]>([]);
  const reload = useCallback(() => setShows(listShows()), []);
  useFocusEffect(reload);

  const open = (id: string) => {
    if (id === current?.id) return;
    try {
      const s = loadShow(id);
      if (s) switchToShow(s);
      reload();
    } catch (e) {
      Alert.alert('開けませんでした', e instanceof Error ? e.message : String(e));
    }
  };

  const add = () => {
    Alert.prompt(
      '新しいショー',
      '名前を入れてください',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '作成',
          onPress: (name?: string) => {
            const s = createShow(name?.trim() || '新しいショー');
            switchToShow(s);
            reload();
          },
        },
      ],
      'plain-text',
    );
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Stack.Screen options={{ headerRight: () => <IconButton icon="plus" label="新しいショー" onPress={add} /> }} />
      <Section footer="ショーは 1 現場ぶんの設定一式です。切り替えると機器に接続し直します。">
        {shows.map((s, i) => (
          <ShowRow
            key={s.id}
            s={s}
            current={s.id === current?.id}
            last={i === shows.length - 1}
            onOpen={() => open(s.id)}
            onDuplicate={() => {
              const src = s.id === current?.id ? current : loadShow(s.id);
              if (src) duplicateShowFiles(src);
              reload();
            }}
            onDelete={() =>
              Alert.alert(`「${s.name}」を削除しますか？`, 'ボタン・機器・トリガー・画像がすべて消え、元に戻せません。', [
                { text: 'キャンセル', style: 'cancel' },
                {
                  text: '削除',
                  style: 'destructive',
                  onPress: () => {
                    deleteShowFiles(s.id);
                    reload();
                  },
                },
              ])
            }
          />
        ))}
      </Section>
    </ScrollView>
  );
}

function ShowRow({
  s,
  current,
  last,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  s: ShowSummary;
  current: boolean;
  last: boolean;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<View>(null);
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityState={{ selected: current }}
      accessibilityLabel={`${s.name}${current ? '、開いています' : ''}`}
      style={({ pressed }) => ({ backgroundColor: pressed ? color.fill4 : 'transparent' })}
    >
      <View
        style={{
          minHeight: 64,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 16,
          paddingRight: 8,
          gap: 12,
          borderBottomWidth: last ? 0 : 0.5,
          borderBottomColor: color.sep,
        }}
      >
        <View style={{ width: 22 }}>{current ? <Symbol name="checkmark" size={17} tint={color.accent} weight="semibold" /> : null}</View>
        <View style={{ flex: 1, paddingVertical: 10 }}>
          <AppText weight={current ? '600' : '400'} numberOfLines={1}>
            {s.name}
          </AppText>
          <AppText variant="footnote" tone="label2">{`ページ ${s.pages}・機器 ${s.devices}・${s.updatedAt.slice(0, 10)}`}</AppText>
        </View>
        <View ref={ref} collapsable={false} style={{ minHeight: MIN_TAP, justifyContent: 'center' }}>
          <IconButton
            icon="ellipsis"
            label={`${s.name} の操作`}
            onPress={() =>
              sheet(
                s.name,
                [{ label: '複製', run: onDuplicate }, ...(current ? [] : [{ label: '削除', destructive: true, run: onDelete }])],
                ref.current,
              )
            }
          />
        </View>
      </View>
    </Pressable>
  );
}
