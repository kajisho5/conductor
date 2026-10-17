import { ScrollView, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { addStreamDeck, changeStreamDeckModel, modelShape, newStreamDeck, STREAM_DECK_MODELS, streamDecks } from '@/model/streamDeck';
import type { StreamDeckModelId } from '@/model/types';
import { panelController, usePanelStore } from '@/engine/panel';
import { useShowStore } from '@/stores/show';
import { color, MIN_TAP } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { Symbol } from '@/components/ui/Symbol';
import { Tap as Pressable } from '@/components/ui/Tap';
import { ModelGlyph } from '@/components/streamdeck/StreamDeckSettings';

/**
 * Stream Deck を追加：機種を選ぶ（SPEC 2.5.1、docs/design 13）。
 * id を渡した時は、その登録の機種を変える（覚えたシリアルは消す）。
 */
export default function StreamDeckModelScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const current = useShowStore((s) => (s.show && id ? streamDecks(s.show).find((e) => e.id === id)?.model : undefined));

  const choose = (model: StreamDeckModelId) => {
    const st = useShowStore.getState();
    const show = st.show;
    if (!show) return;
    if (id) {
      st.mutateShow((s) => changeStreamDeckModel(s, id, model));
    } else {
      const entry = newStreamDeck(show, model);
      st.mutateShow((s) => addStreamDeck(s, entry));
      usePanelStore.setState({ selectedEntryId: entry.id });
    }
    panelController.refresh();
    router.back();
  };

  return (
    <>
      <Stack.Screen options={{ title: id ? '機種を変える' : '機種を選ぶ' }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => router.back()}>キャンセル</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <AppText variant="footnote" tone="label2" style={{ marginHorizontal: 16, marginBottom: 8 }}>
          使う Stream Deck の機種を選ぶと、キーの数と並びが決まります。
        </AppText>
        <View style={{ backgroundColor: color.groupedCard, borderRadius: 12, overflow: 'hidden' }}>
          {STREAM_DECK_MODELS.map((m, i) => {
            const sel = m.id === current;
            return (
              <Pressable
                key={m.id}
                onPress={() => choose(m.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: sel }}
                accessibilityLabel={`${m.label}、${modelShape(m)}${m.note ? `、${m.note}` : ''}`}
                style={({ pressed }) => ({ backgroundColor: pressed ? color.fill : 'transparent' })}
              >
                <View style={{ minHeight: MIN_TAP + 18, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, gap: 14 }}>
                  <ModelGlyph model={m} tint={sel ? color.accent : undefined} />
                  <View
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 10,
                      paddingRight: 16,
                      borderBottomWidth: i === STREAM_DECK_MODELS.length - 1 ? 0 : 0.5,
                      borderBottomColor: color.sep,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <AppText>{m.label}</AppText>
                      <AppText variant="footnote" tone="label2">
                        {modelShape(m) + (m.note ? `・${m.note}` : '')}
                      </AppText>
                    </View>
                    {sel ? <Symbol name="checkmark" size={17} tint={color.accent} weight="semibold" /> : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
        <AppText variant="footnote" tone="label2" style={{ marginHorizontal: 16, marginTop: 8 }}>
          モジュール版・Scissor Keys は同じ形の機種を選びます。つないだ時は製品番号で機種を確かめます（違えば登録していない扱い）。
        </AppText>
      </ScrollView>
    </>
  );
}
