import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useShowStore } from '@/stores/show';
import { streamDecks } from '@/model/streamDeck';
import { StreamDeckDetail } from '@/components/streamdeck/StreamDeckSettings';

/** 設定 > Stream Deck > 1 台（compact 幅の時に進む画面） */
export default function StreamDeckItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const name = useShowStore((s) => (s.show ? streamDecks(s.show).find((e) => e.id === id)?.name : undefined));
  return (
    <>
      <Stack.Screen options={{ title: name ?? 'Stream Deck' }} />
      <StreamDeckDetail id={id ?? ''} onDeleted={() => router.back()} />
    </>
  );
}
