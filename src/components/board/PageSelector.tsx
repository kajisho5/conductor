import { useRef } from 'react';
import { ActionSheetIOS, Platform, Pressable, View, findNodeHandle } from 'react-native';
import type { Show } from '@/model/types';
import { useRuntimeStore } from '@/stores/runtime';
import { useUiStore } from '@/stores/ui';
import { color, MIN_TAP, radius } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/Buttons';
import { Symbol } from '@/components/ui/Symbol';

/**
 * ツールバー中央のページ切替（docs/design 01・20）。
 * regular は左右の矢印つき。押すとページの一覧（compact は「ページを管理」「プリセット」も同じメニューから）。
 */
export function PageSelector({
  show,
  compact,
  onManagePages,
  onPresets,
}: {
  show: Show;
  compact: boolean;
  onManagePages?: () => void;
  onPresets?: () => void;
}) {
  const pageNumber = useRuntimeStore((s) => s.pageNumber);
  const page = show.pages.find((p) => p.number === pageNumber) ?? show.pages[0]!;
  const ref = useRef<View>(null);
  const count = show.pages.length;

  const go = (n: number) => {
    useRuntimeStore.getState().setPageNumber(n);
    useUiStore.getState().select(null);
  };

  const open = () => {
    if (Platform.OS !== 'ios') return;
    const extra: { label: string; run: () => void }[] = [];
    if (onManagePages) extra.push({ label: 'ページを管理', run: onManagePages });
    if (onPresets) extra.push({ label: 'プリセット', run: onPresets });
    const options = [
      ...show.pages.map((p) => `${p.number}  ${p.name}${p.number === pageNumber ? '（表示中）' : ''}`),
      ...extra.map((e) => e.label),
      'キャンセル',
    ];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'ページ',
        options,
        cancelButtonIndex: options.length - 1,
        anchor: ref.current ? (findNodeHandle(ref.current) ?? undefined) : undefined,
      },
      (i) => {
        const p = show.pages[i];
        if (p) go(p.number);
        else extra[i - show.pages.length]?.run();
      },
    );
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {compact ? null : <IconButton icon="chevron.left" label="前のページ" onPress={() => go(((pageNumber - 2 + count) % count) + 1)} />}
      <Pressable
        ref={ref}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`ページ ${page.number}、${page.name}`}
        accessibilityHint="ページを切り替えます"
        style={{
          minHeight: MIN_TAP,
          paddingHorizontal: 16,
          borderRadius: radius.pill,
          backgroundColor: color.fill,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          maxWidth: compact ? 150 : 220,
        }}
      >
        <AppText variant="subhead" weight="700">
          {String(page.number)}
        </AppText>
        <AppText variant="subhead" weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>
          {page.name}
        </AppText>
        <Symbol name="chevron.down" size={12} tint={color.label2} weight="bold" />
      </Pressable>
      {compact ? null : <IconButton icon="chevron.right" label="次のページ" onPress={() => go((pageNumber % count) + 1)} />}
    </View>
  );
}
