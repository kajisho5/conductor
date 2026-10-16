import { useRef } from 'react';
import { ActionSheetIOS, Platform, ScrollView, TextInput, View, findNodeHandle } from 'react-native';
import { Tap as Pressable } from '@/components/ui/Tap';
import type { Show } from '@/model/types';
import { useRuntimeStore } from '@/stores/runtime';
import { useShowStore, visibleButtonCount } from '@/stores/show';
import { useUiStore } from '@/stores/ui';
import { exportAndShare } from '@/storage/session';
import { color, MIN_TAP, radius, type as typeStyles } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/Buttons';
import { Row, Section } from '@/components/ui/Group';

/**
 * ページの管理（SPEC 2.1-1、docs/design 04）。
 * 行タップで表示するページを切り替え、⋯ で並べ替え・複製・削除。破壊的操作は赤字で最下部（取り消しで戻せる）。
 */
export function PagePanel({ show, compact }: { show: Show; compact?: boolean }) {
  const pageNumber = useRuntimeStore((s) => s.pageNumber);
  const page = show.pages.find((p) => p.number === pageNumber) ?? show.pages[0]!;
  const store = useShowStore.getState;

  const goTo = (n: number) => {
    useRuntimeStore.getState().setPageNumber(n);
    useUiStore.getState().select(null);
  };

  const afterDelete = () => {
    const count = useShowStore.getState().show?.pages.length ?? 1;
    if (useRuntimeStore.getState().pageNumber > count) useRuntimeStore.getState().setPageNumber(count);
    useUiStore.getState().select(null);
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: compact ? 16 : 20, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <View style={{ backgroundColor: color.card, borderRadius: radius.card, overflow: 'hidden', marginBottom: 12 }}>
        {show.pages.map((p, i) => (
          <PageRow
            key={p.id}
            number={p.number}
            name={p.name}
            count={visibleButtonCount(p, show.grid.columns, show.grid.rows)}
            current={p.number === pageNumber}
            last={i === show.pages.length - 1}
            onPress={() => goTo(p.number)}
            onMenu={(anchor) => pageMenu(p.id, p.number, i === 0, i === show.pages.length - 1, show.pages.length, anchor, afterDelete)}
          />
        ))}
      </View>
      <Section card={color.card}>
        <Row
          title="ページを追加"
          icon="plus"
          tone="accent"
          last
          onPress={() => {
            const p = store().addPage();
            if (p) goTo(p.number);
          }}
        />
      </Section>

      <Section title="このページ" card={color.card}>
        <View
          style={{
            minHeight: MIN_TAP,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            borderBottomWidth: 0.5,
            borderBottomColor: color.sep,
          }}
        >
          <AppText style={{ marginRight: 12 }}>名前</AppText>
          <TextInput
            value={page.name}
            onChangeText={(name) => store().renamePage(page.id, name)}
            placeholder="ページ名"
            placeholderTextColor={color.label3}
            accessibilityLabel="ページ名"
            style={[typeStyles.body, { flex: 1, textAlign: 'right', color: color.label, minHeight: MIN_TAP }]}
          />
        </View>
        <Row
          title="書き出す"
          icon="square.and.arrow.up"
          onPress={() => void exportAndShare(show, { kind: 'page', pageId: page.id }, `${show.name} ${page.name}`)}
        />
        <Row title="ページを複製" onPress={() => keepCurrentPage(() => store().duplicatePage(page.id))} />
        <Row
          title="ページを空にする"
          tone="danger"
          onPress={() => {
            store().clearPage(page.id);
            useUiStore.getState().select(null);
          }}
        />
        {show.pages.length > 1 ? (
          <Row
            title="ページを削除"
            tone="danger"
            last
            onPress={() => {
              store().deletePage(page.id);
              afterDelete();
            }}
          />
        ) : null}
      </Section>
    </ScrollView>
  );
}

/** 並べ替え・複製で番号が変わっても、表示中のページはそのまま */
function keepCurrentPage(op: () => void): void {
  const before = useShowStore.getState().show;
  const id = before?.pages.find((p) => p.number === useRuntimeStore.getState().pageNumber)?.id;
  op();
  const n = useShowStore.getState().show?.pages.find((p) => p.id === id)?.number;
  if (n) useRuntimeStore.getState().setPageNumber(n);
}

function pageMenu(
  pageId: string,
  number: number,
  first: boolean,
  last: boolean,
  total: number,
  anchor: View | null,
  afterDelete: () => void,
) {
  if (Platform.OS !== 'ios') return;
  const s = useShowStore.getState();
  const items: { label: string; run: () => void; destructive?: boolean }[] = [];
  if (!first) items.push({ label: '上へ移動', run: () => keepCurrentPage(() => s.movePage(pageId, -1)) });
  if (!last) items.push({ label: '下へ移動', run: () => keepCurrentPage(() => s.movePage(pageId, 1)) });
  items.push({ label: 'ページを複製', run: () => keepCurrentPage(() => s.duplicatePage(pageId)) });
  if (total > 1)
    items.push({
      label: 'ページを削除',
      destructive: true,
      run: () => {
        s.deletePage(pageId);
        afterDelete();
      },
    });
  const options = [...items.map((i) => i.label), 'キャンセル'];
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title: `ページ ${number}`,
      options,
      cancelButtonIndex: options.length - 1,
      destructiveButtonIndex: items.findIndex((i) => i.destructive),
      anchor: anchor ? (findNodeHandle(anchor) ?? undefined) : undefined,
    },
    (i) => items[i]?.run(),
  );
}

function PageRow({
  number,
  name,
  count,
  current,
  last,
  onPress,
  onMenu,
}: {
  number: number;
  name: string;
  count: number;
  current: boolean;
  last: boolean;
  onPress: () => void;
  onMenu: (anchor: View | null) => void;
}) {
  const ref = useRef<View>(null);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`ページ ${number}、${name}、${count} ボタン${current ? '、表示中' : ''}`}
      style={({ pressed }) => ({ backgroundColor: pressed ? color.fill : 'transparent' })}
    >
      <View style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', paddingLeft: 14 }}>
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            backgroundColor: current ? color.accent : color.fill,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppText variant="subhead" weight="700" style={current ? { color: color.onTint } : undefined}>
            {String(number)}
          </AppText>
        </View>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            marginLeft: 14,
            minHeight: 60,
            borderBottomWidth: last ? 0 : 0.5,
            borderBottomColor: color.sep,
            paddingRight: 8,
          }}
        >
          <View style={{ flex: 1 }}>
            <AppText weight={current ? '600' : '400'} numberOfLines={1}>
              {name || '名前なし'}
            </AppText>
            <AppText variant="footnote" tone="label2">{`${count} ボタン`}</AppText>
          </View>
          {current ? (
            <AppText variant="footnote" tone="label2" style={{ marginRight: 4 }}>
              表示中
            </AppText>
          ) : null}
          <View ref={ref} collapsable={false}>
            <IconButton icon="ellipsis" label={`ページ ${number} の操作`} onPress={() => onMenu(ref.current)} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}
