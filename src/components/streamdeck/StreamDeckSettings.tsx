import { useEffect, useRef } from 'react';
import { ActionSheetIOS, Alert, Linking, ScrollView, View, findNodeHandle, type ColorValue } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { router } from 'expo-router';
import { cellKey } from '@/model/grid';
import type { Show, StreamDeckEntry } from '@/model/types';
import {
  addStreamDeck,
  modelForPanel,
  modelShape,
  newStreamDeck,
  removeStreamDeck,
  streamDeckEditPress,
  streamDeckModel,
  streamDecks,
  updateStreamDeck,
  type StreamDeckModel,
} from '@/model/streamDeck';
import { panelController, usePanelStore } from '@/engine/panel';
import { useShowStore } from '@/stores/show';
import { useRuntimeStore } from '@/stores/runtime';
import { color, MIN_TAP } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/Buttons';
import { Row, Section, SwitchRow } from '@/components/ui/Group';
import { Tap as Pressable } from '@/components/ui/Tap';
import { ButtonFace } from '@/components/board/ButtonFace';

/** 設定 > Stream Deck（SPEC 2.5・2.5.1、docs/design 12・13） */

/** メーカーの開発者資料の「はじめに」（SPEC 2.5 の根拠と同じページ） */
export const HELP_URL = 'https://docs.elgato.com/ipad/getting-started';
const BRIGHTNESS = [10, 25, 40, 55, 70, 85, 100] as const;

/** 登録した 1 台がつながっているか */
export function useEntryConnected(entryId: string): boolean {
  return usePanelStore((s) => Object.values(s.bindings).includes(entryId));
}

/** 機種の形の小さな図（40 × 28） */
export function ModelGlyph({ model, tint }: { model: StreamDeckModel; tint?: ColorValue }) {
  const gw = 40;
  const gh = 28;
  const gap = 2;
  const cell = Math.min((gw - (model.columns - 1) * gap) / model.columns, (gh - (model.rows - 1) * gap) / model.rows);
  return (
    <View
      style={{ width: gw + 8, height: gh + 8, borderRadius: 7, backgroundColor: color.fill, alignItems: 'center', justifyContent: 'center', gap }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: model.rows }, (_, r) => (
        <View key={r} style={{ flexDirection: 'row', gap }}>
          {Array.from({ length: model.columns }, (_, c) => (
            <View key={c} style={{ width: cell, height: cell, borderRadius: 1.5, backgroundColor: tint ?? color.label2 }} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** 一覧（登録していない機器の帯・登録した一覧・全体・準備） */
export function StreamDeckList({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const show = useShowStore((s) => s.show);
  const unregistered = usePanelStore((s) => s.unregistered);
  const bindings = usePanelStore((s) => s.bindings);
  const error = usePanelStore((s) => s.error);
  const driverApp = usePanelStore((s) => s.driverApp);

  useEffect(() => {
    void panelController.refreshDriverApp();
  }, []);

  if (!show) return null;
  const entries = streamDecks(show);
  const connected = new Set(Object.values(bindings));

  const register = (p: (typeof unregistered)[number]) => {
    const model = modelForPanel(p);
    if (!model) {
      router.push('/settings/stream-deck-model');
      return;
    }
    const cur = useShowStore.getState().show;
    if (!cur) return;
    const entry = newStreamDeck(cur, model.id, p.serial || undefined);
    useShowStore.getState().mutateShow((s) => addStreamDeck(s, entry));
    onSelect(entry.id);
  };

  const confirmDelete = (e: StreamDeckEntry) => {
    Alert.alert(`「${e.name}」を削除しますか？`, 'キーには何も出なくなります。', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: () => useShowStore.getState().mutateShow((s) => removeStreamDeck(s, e.id)) },
    ]);
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      {unregistered.map((p) => {
        const model = modelForPanel(p);
        return (
          <View
            key={p.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 14,
              marginBottom: 20,
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor: color.warn,
              backgroundColor: color.groupedCard,
            }}
          >
            <View style={{ flex: 1 }}>
              <AppText weight="600">登録していない Stream Deck</AppText>
              <AppText variant="footnote" tone="label2">
                {model ? `${model.short}（${model.keys} キー）がつながっています` : `${p.keyCount} キーの機器がつながっています（機種を選んでください）`}
              </AppText>
            </View>
            <Pressable
              onPress={() => register(p)}
              accessibilityRole="button"
              accessibilityLabel="登録"
              style={({ pressed }) => ({
                minHeight: MIN_TAP,
                paddingHorizontal: 18,
                borderRadius: MIN_TAP / 2,
                justifyContent: 'center',
                backgroundColor: color.accent,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <AppText weight="600" style={{ color: color.onTint }}>
                登録
              </AppText>
            </Pressable>
          </View>
        );
      })}

      <Section
        title="登録した Stream Deck"
        footer={
          error?.kind === 'entitlement'
            ? 'このアプリに Stream Deck を使う許可がありません。開発元にお知らせください。'
            : error
              ? error.message
              : entries.length > 0
                ? '左にスワイプで削除'
                : '使う Stream Deck の機種を登録すると、キーの数と並びが決まります。'
        }
      >
        {entries.map((e) => {
          const model = streamDeckModel(e.model);
          const on = connected.has(e.id);
          return (
            <ReanimatedSwipeable
              key={e.id}
              friction={2}
              rightThreshold={40}
              renderRightActions={() => (
                <Pressable
                  onPress={() => confirmDelete(e)}
                  accessibilityRole="button"
                  accessibilityLabel={`${e.name}を削除`}
                  style={{ width: 88, backgroundColor: color.danger, alignItems: 'center', justifyContent: 'center' }}
                >
                  <AppText weight="600" style={{ color: color.onTint }}>
                    削除
                  </AppText>
                </Pressable>
              )}
            >
              <View style={{ backgroundColor: selectedId === e.id ? color.fill : color.groupedCard }}>
                <Row
                  title={e.name}
                  subtitle={`${modelShape(model)}・${on ? '接続中' : 'つながっていません'}`}
                  icon={on ? 'circle.fill' : 'circle'}
                  iconTint={on ? color.ok : color.gray}
                  chevron
                  onPress={() => onSelect(e.id)}
                  accessibilityHint="この Stream Deck の設定を開きます"
                />
              </View>
            </ReanimatedSwipeable>
          );
        })}
        <Row title="Stream Deck を追加" tone="accent" last onPress={() => router.push('/settings/stream-deck-model')} />
      </Section>

      <Section title="全体" footer="オフにすると本番画面の時だけキーで押せます。">
        <SwitchRow
          title="編集中も押せる"
          value={streamDeckEditPress(show)}
          onValueChange={(v) => useShowStore.getState().updateSettings({ streamDeckEditPress: v })}
          last
        />
      </Section>

      <Section title="準備" footer="M1 以降のチップで USB-C の iPad だけで使えます。メーカーの接続アプリを入れ、iPad の設定でドライバをオンにします。">
        <Row
          title="メーカーの接続アプリ"
          icon="info.circle"
          iconTint={color.label2}
          value={driverApp === null ? '確認中' : driverApp ? '入っています' : '入っていません'}
        />
        <Row title="使い方を見る" icon="questionmark.circle" chevron last onPress={() => void Linking.openURL(HELP_URL)} />
      </Section>
    </ScrollView>
  );
}

/** 1 台の設定（名前・機種・状態・ページ・範囲・明るさ・図・削除） */
export function StreamDeckDetail({ id, onDeleted }: { id: string; onDeleted?: () => void }) {
  const show = useShowStore((s) => s.show);
  const connected = useEntryConnected(id);
  const pageRef = useRef<View>(null);
  const brightRef = useRef<View>(null);
  const entry = show ? streamDecks(show).find((e) => e.id === id) : undefined;
  if (!show || !entry) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <AppText tone="label2" align="center">
          左の一覧から Stream Deck を選ぶか、追加してください。
        </AppText>
      </View>
    );
  }
  const model = streamDeckModel(entry.model);
  const set = (patch: Partial<Omit<StreamDeckEntry, 'id'>>, coalesce?: string) => {
    useShowStore.getState().mutateShow((s) => updateStreamDeck(s, id, patch), coalesce);
    panelController.refresh();
  };
  const maxRow = Math.max(1, show.grid.rows - model.rows + 1);
  const maxCol = Math.max(1, show.grid.columns - model.columns + 1);
  const fixedPage = entry.page === 'follow' ? undefined : show.pages.find((p) => p.number === entry.page);
  const pageLabel = fixedPage ? `${fixedPage.number}  ${fixedPage.name}` : 'iPad と同じ';

  const choosePage = () => {
    const options = ['iPad と同じ', ...show.pages.map((p) => `${p.number}  ${p.name}`), 'キャンセル'];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: '表示するページ',
        options,
        cancelButtonIndex: options.length - 1,
        anchor: pageRef.current ? (findNodeHandle(pageRef.current) ?? undefined) : undefined,
      },
      (i) => {
        if (i === 0) set({ page: 'follow' });
        const p = show.pages[i - 1];
        if (p) set({ page: p.number });
      },
    );
  };

  const chooseBrightness = () => {
    const options = [...BRIGHTNESS.map((b) => `${b}%`), 'キャンセル'];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: '明るさ',
        options,
        cancelButtonIndex: options.length - 1,
        anchor: brightRef.current ? (findNodeHandle(brightRef.current) ?? undefined) : undefined,
      },
      (i) => {
        const b = BRIGHTNESS[i];
        if (b !== undefined) set({ brightness: b });
      },
    );
  };

  const rename = () => {
    Alert.prompt(
      '名前',
      undefined,
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '変更', onPress: (v?: string) => (v && v.trim() ? set({ name: v.trim() }) : undefined) },
      ],
      'plain-text',
      entry.name,
    );
  };

  const remove = () => {
    Alert.alert(`「${entry.name}」を削除しますか？`, 'キーには何も出なくなります。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          useShowStore.getState().mutateShow((s) => removeStreamDeck(s, id));
          onDeleted?.();
        },
      },
    ]);
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Section>
        <Row title="名前" value={entry.name} chevron onPress={rename} />
        <Row
          title="機種"
          value={`${model.short}（${model.keys} キー・${model.columns} × ${model.rows}）`}
          chevron
          onPress={() => router.push({ pathname: '/settings/stream-deck-model', params: { id } })}
        />
        <Row title="状態" value={connected ? '接続中・USB-C' : 'つながっていません'} last />
      </Section>

      <Section title="表示" footer="キーには、iPad のボタンと同じ文字・色・画像・状態表示が出ます。文字や色は、いつものボタン編集で変えるとすぐキーにも出ます。">
        <View ref={pageRef} collapsable={false}>
          <Row title="表示するページ" value={pageLabel} chevron onPress={choosePage} />
        </View>
        <Stepper title="何行目から" value={Math.min(entry.row, maxRow)} min={1} max={maxRow} onChange={(row) => set({ row }, `sd-row-${id}`)} />
        <Stepper title="何列目から" value={Math.min(entry.col, maxCol)} min={1} max={maxCol} onChange={(col) => set({ col }, `sd-col-${id}`)} />
        {model.keyPx > 0 ? (
          <View ref={brightRef} collapsable={false}>
            <Row title="明るさ" value={`${entry.brightness}%`} chevron last onPress={chooseBrightness} />
          </View>
        ) : null}
      </Section>

      <RangePreview show={show} entry={entry} model={model} />

      <Section>
        <Row title="この Stream Deck を削除" tone="danger" last onPress={remove} />
      </Section>
    </ScrollView>
  );
}

/** iPad のボタン盤と範囲の青い枠、その下に機種の形のキー（SPEC 2.5.1） */
function RangePreview({ show, entry, model }: { show: Show; entry: StreamDeckEntry; model: StreamDeckModel }) {
  const current = useRuntimeStore((s) => s.pageNumber);
  const pageNo = entry.page === 'follow' ? current : entry.page;
  const page = show.pages.find((p) => p.number === pageNo) ?? show.pages[0];
  const { columns, rows } = show.grid;
  const cw = 40;
  const gap = 5;
  const r0 = Math.min(entry.row, Math.max(1, rows - model.rows + 1)) - 1;
  const c0 = Math.min(entry.col, Math.max(1, columns - model.columns + 1)) - 1;
  const kw = Math.min(56, Math.floor(420 / model.columns) - 8);
  return (
    <View
      style={{ marginBottom: 24, alignItems: 'center', gap: 10 }}
      accessible
      accessibilityLabel={`iPad のボタンの ${r0 + 1} 行目 ${c0 + 1} 列目から、${model.columns} 列 ${model.rows} 行をキーに出します`}
    >
      <AppText variant="footnote" tone="label2">
        {`iPad のボタン（ページ ${page?.number ?? 1}「${page?.name ?? ''}」${entry.page === 'follow' ? '・iPad と同じ' : ''}）`}
      </AppText>
      <View style={{ gap }}>
        {Array.from({ length: rows }, (_, r) => (
          <View key={r} style={{ flexDirection: 'row', gap }}>
            {Array.from({ length: columns }, (_, c) => {
              const b = page?.buttons[cellKey(r, c)];
              const inRange = r >= r0 && r < r0 + model.rows && c >= c0 && c < c0 + model.columns;
              return (
                <View
                  key={c}
                  style={{ width: cw, height: cw, borderRadius: 6, borderWidth: inRange ? 2 : 0, borderColor: color.accent, overflow: 'hidden' }}
                >
                  {b ? (
                    <ButtonFace style={b.style} text={b.style.text.includes('$(') ? '' : b.style.text} width={cw} height={cw} radius={6} />
                  ) : (
                    <View style={{ flex: 1, backgroundColor: color.fill4 }} />
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <AppText variant="footnote" style={{ color: color.accent }}>
        青い枠＝キーに出す範囲
      </AppText>
      <View style={{ padding: 14, borderRadius: 18, backgroundColor: color.card, gap: 8 }}>
        {Array.from({ length: model.rows }, (_, r) => (
          <View key={r} style={{ flexDirection: 'row', gap: 8 }}>
            {Array.from({ length: model.columns }, (_, c) => {
              const b = page?.buttons[cellKey(r0 + r, c0 + c)];
              return b && model.keyPx > 0 ? (
                <ButtonFace key={c} style={b.style} text={b.style.text.includes('$(') ? '' : b.style.text} width={kw} height={kw} radius={8} />
              ) : (
                <View key={c} style={{ width: kw, height: kw, borderRadius: 8, backgroundColor: color.scrim, borderWidth: 1, borderColor: color.sep }} />
              );
            })}
          </View>
        ))}
      </View>
      <AppText variant="footnote" tone="label2">
        {model.keyPx > 0 ? `${model.label}（押している・送れた の表示も同じ）` : `${model.label}（絵は出ません。押す・離すだけ）`}
      </AppText>
    </View>
  );
}

function Stepper({
  title,
  value,
  min,
  max,
  onChange,
}: {
  title: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <View
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        gap: 12,
        borderBottomWidth: 0.5,
        borderBottomColor: color.sep,
      }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={title}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment' && value < max) onChange(value + 1);
        if (e.nativeEvent.actionName === 'decrement' && value > min) onChange(value - 1);
      }}
    >
      <AppText style={{ flex: 1 }}>{title}</AppText>
      {value > min ? (
        <IconButton icon="minus" label={`${title}を減らす`} onPress={() => onChange(value - 1)} />
      ) : (
        <View style={{ width: MIN_TAP }} />
      )}
      <AppText weight="600" style={{ minWidth: 28, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
        {String(value)}
      </AppText>
      {value < max ? (
        <IconButton icon="plus" label={`${title}を増やす`} onPress={() => onChange(value + 1)} />
      ) : (
        <View style={{ width: MIN_TAP }} />
      )}
    </View>
  );
}
