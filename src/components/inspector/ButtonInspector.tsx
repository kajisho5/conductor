import { useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { stopButton } from '@/engine/executor';
import { testPress } from '@/engine/press';
import type { ButtonModel, Show } from '@/model/types';
import type { CellRef } from '@/stores/show';
import { useShowStore } from '@/stores/show';
import { useRuntimeStore } from '@/stores/runtime';
import { useUiStore, type InspectorTab } from '@/stores/ui';
import { color, radius, type as typeStyles } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { IconButton, PillButton } from '@/components/ui/Buttons';
import { Segmented } from '@/components/ui/Segmented';
import { ButtonFace } from '@/components/board/ButtonFace';
import { openCellMenu, positionLabel } from '@/components/board/boardHelpers';
import { useButtonView } from '@/components/board/useButtonView';
import { OptionsTab, VariablesTab } from './BehaviorTabs';
import { ActionsEditor } from './ActionsEditor';
import { FeedbackEditor } from './FeedbackEditor';
import { StyleEditor } from './StyleEditor';

/** ボタンの設定（iPad の右の設定欄・iPhone の編集シートで共通。SPEC 3.1・3.2） */

const TABS_REGULAR: { value: InspectorTab; label: string }[] = [
  { value: 'actions', label: '動作' },
  { value: 'style', label: '見た目' },
  { value: 'feedback', label: '状態表示' },
  { value: 'variables', label: '変数' },
  { value: 'options', label: 'オプション' },
];
const TABS_COMPACT: { value: InspectorTab; label: string }[] = [
  { value: 'actions', label: '動作' },
  { value: 'style', label: '見た目' },
  { value: 'feedback', label: '状態' },
  { value: 'variables', label: '変数' },
  { value: 'options', label: '設定' },
];

export function ButtonInspector({ cell, button, show, compact }: { cell: CellRef; button: ButtonModel; show: Show; compact?: boolean }) {
  const tab = useUiStore((s) => s.tab);
  const page = show.pages.find((p) => p.id === cell.pageId);
  return (
    <ScrollView
      contentContainerStyle={{ padding: compact ? 16 : 20, paddingBottom: 48 }}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <InspectorHeader cell={cell} button={button} show={show} pageNumber={page?.number ?? 1} compact={compact} />
      <Segmented
        items={compact ? TABS_COMPACT : TABS_REGULAR}
        value={tab}
        onChange={(t) => useUiStore.getState().setTab(t)}
        style={{ marginVertical: 16 }}
        accessibilityLabel="ボタンの設定の種類"
      />
      {tab === 'actions' ? <ActionsEditor key={button.id} cell={cell} button={button} show={show} /> : null}
      {tab === 'style' ? <StyleEditor cell={cell} button={button} show={show} /> : null}
      {tab === 'feedback' ? <FeedbackEditor cell={cell} button={button} show={show} /> : null}
      {tab === 'variables' ? <VariablesTab cell={cell} button={button} show={show} /> : null}
      {tab === 'options' ? <OptionsTab cell={cell} button={button} /> : null}
    </ScrollView>
  );
}

function InspectorHeader({
  cell,
  button,
  show,
  pageNumber,
  compact,
}: {
  cell: CellRef;
  button: ButtonModel;
  show: Show;
  pageNumber: number;
  compact?: boolean;
}) {
  const view = useButtonView(button, show);
  const press = useRuntimeStore((s) => s.press[button.id]);
  const [result, setResult] = useState<string | null>(null);
  const menuRef = useRef<View>(null);
  const size = compact ? 76 : 92;
  const running = press?.phase === 'running';

  const test = async () => {
    setResult(null);
    const r = await testPress(button, show);
    setResult(r === 'sent' ? '送れました' : r === 'failed' ? '送れなかった動作があります' : '送る動作がありません');
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        {view ? (
          <ButtonFace
            style={view.style}
            text={view.text}
            imageUri={view.imageUri}
            width={size}
            height={size}
            radius={compact ? 10 : 12}
            offline={view.offline}
            warn={press?.warn}
            stepCount={view.stepCount}
            stepIndex={view.stepIndex}
          />
        ) : null}
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="footnote" tone="label2">
            {positionLabel(pageNumber, cell.key)}
          </AppText>
          <AppText variant="headline" numberOfLines={1}>
            {button.name || '名前なし'}
          </AppText>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <PillButton label="テスト" icon="play.fill" onPress={() => void test()} />
            {running ? <PillButton label="停止" icon="stop.fill" tint={color.danger} onPress={() => stopButton(button.id)} /> : null}
            <View ref={menuRef}>
              <IconButton icon="ellipsis" label="その他の操作" onPress={() => openCellMenu(cell, menuRef.current)} />
            </View>
          </View>
        </View>
      </View>
      {result ? (
        <AppText
          variant="footnote"
          tone={result === '送れました' ? 'label2' : 'label'}
          style={{ marginTop: 8 }}
          accessibilityLiveRegion="polite"
        >
          {result}
        </AppText>
      ) : null}
      <TextInput
        value={button.notes}
        onChangeText={(notes) => useShowStore.getState().updateButton(cell, { notes })}
        placeholder="メモ"
        placeholderTextColor={color.label3}
        multiline
        accessibilityLabel="メモ"
        style={[
          typeStyles.subhead,
          {
            marginTop: 14,
            minHeight: 44,
            borderRadius: radius.field,
            backgroundColor: color.card,
            color: color.label,
            paddingHorizontal: 14,
            paddingVertical: 12,
          },
        ]}
      />
    </View>
  );
}
