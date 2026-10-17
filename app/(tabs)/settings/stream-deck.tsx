import { useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { StreamDeckEntry } from '@/model/types';
import { usePanelStore } from '@/engine/panel';
import { useShowStore } from '@/stores/show';
import { useSizeClass } from '@/hooks/useSizeClass';
import { color } from '@/theme/tokens';
import { StreamDeckDetail, StreamDeckList } from '@/components/streamdeck/StreamDeckSettings';

const NONE: StreamDeckEntry[] = [];

/**
 * 設定 > Stream Deck（SPEC 2.5.1、docs/design 12）。
 * regular 幅：左に一覧、右に選んだ 1 台の設定。compact 幅：一覧 → 押すと 1 台の設定へ進む。
 */
export default function StreamDeckScreen() {
  const compact = useSizeClass() === 'compact';
  const selected = usePanelStore((s) => s.selectedEntryId);
  const saved = useShowStore((s) => s.show?.settings.streamDecks);
  const entries = saved ?? NONE;
  const select = (id: string | null) => usePanelStore.setState({ selectedEntryId: id });

  // 選んでいたものが消えたら先頭を選ぶ（regular のみ）
  useEffect(() => {
    if (compact) return;
    if (!selected || !entries.some((e) => e.id === selected)) select(entries[0]?.id ?? null);
  }, [compact, selected, entries]);

  if (compact) {
    return (
      <StreamDeckList
        selectedId={null}
        onSelect={(id) => {
          select(id);
          router.push({ pathname: '/settings/stream-deck-item', params: { id } });
        }}
      />
    );
  }
  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <View style={{ width: 400, borderRightWidth: 0.5, borderRightColor: color.sep }}>
        <StreamDeckList selectedId={selected} onSelect={select} />
      </View>
      <View style={{ flex: 1 }}>
        {selected ? <StreamDeckDetail key={selected} id={selected} onDeleted={() => select(null)} /> : <StreamDeckDetail id="" />}
      </View>
    </View>
  );
}
