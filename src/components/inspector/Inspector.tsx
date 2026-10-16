import { View } from 'react-native';
import type { Show } from '@/model/types';
import { useUiStore, type InspectorSegment } from '@/stores/ui';
import { color } from '@/theme/tokens';
import { EmptyState } from '@/components/ui/EmptyState';
import { Segmented } from '@/components/ui/Segmented';
import { ButtonInspector } from './ButtonInspector';
import { PagePanel } from './PagePanel';

/** iPad（regular）の右の設定欄：ボタン／ページ／プリセット（SPEC 3.1） */

const SEGMENTS: { value: InspectorSegment; label: string }[] = [
  { value: 'button', label: 'ボタン' },
  { value: 'page', label: 'ページ' },
  { value: 'presets', label: 'プリセット' },
];

export function Inspector({ show, width }: { show: Show; width: number }) {
  const segment = useUiStore((s) => s.segment);
  const selected = useUiStore((s) => s.selected);
  const page = selected ? show.pages.find((p) => p.id === selected.pageId) : undefined;
  const button = selected && page ? page.buttons[selected.key] : undefined;

  return (
    <View style={{ width, backgroundColor: color.group, borderLeftWidth: 0.5, borderLeftColor: color.sep }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <Segmented
          items={SEGMENTS}
          value={segment}
          onChange={(s) => useUiStore.getState().setSegment(s)}
          accessibilityLabel="設定欄の切替"
        />
      </View>
      <View style={{ flex: 1 }}>
        {segment === 'button' ? (
          selected && button ? (
            <ButtonInspector cell={selected} button={button} show={show} />
          ) : (
            <EmptyState
              icon="square.grid.2x2"
              title="ボタンを選ぶ"
              message="左のボタン盤でマスをタップすると、ここで設定できます。空きマスをタップするとボタンを作ります。"
            />
          )
        ) : null}
        {segment === 'page' ? <PagePanel show={show} /> : null}
        {segment === 'presets' ? <PresetsPanel /> : null}
      </View>
    </View>
  );
}

export function PresetsPanel() {
  return (
    <EmptyState
      icon="square.stack.3d.up"
      title="プリセットのある機器がありません"
      message="プリセットは機器のドライバが用意する、できあいのボタンです。対応する機器を追加すると、ここに並びます。"
    />
  );
}
