import { ScrollView, Switch, View } from 'react-native';
import { Tap as Pressable } from '@/components/ui/Tap';
import { describeTrigger, updateTrigger } from '@/model/triggers';
import type { Show } from '@/model/types';
import { useShowStore } from '@/stores/show';
import { color, MIN_TAP } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { Section } from '@/components/ui/Group';
import { Symbol } from '@/components/ui/Symbol';

/** トリガーの一覧（SPEC 2.1-4）：名前・有効スイッチ・きっかけの要約 */
export function TriggerList({ show, selectedId, onSelect }: { show: Show; selectedId?: string | null; onSelect: (id: string) => void }) {
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Section footer="アプリが前面にある間だけ動きます。">
        {show.triggers.map((t, i) => {
          const selected = selectedId === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => onSelect(t.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${t.name}、${t.enabled ? '有効' : '無効'}、${describeTrigger(t, show)}`}
              style={({ pressed }) => ({ backgroundColor: selected ? color.fill : pressed ? color.fill4 : 'transparent' })}
            >
              <View
                style={{
                  minHeight: 64,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  gap: 12,
                  borderBottomWidth: i === show.triggers.length - 1 ? 0 : 0.5,
                  borderBottomColor: color.sep,
                }}
              >
                <View style={{ flex: 1, paddingVertical: 10, opacity: t.enabled ? 1 : 0.5 }}>
                  <AppText weight="600" numberOfLines={1}>
                    {t.name}
                  </AppText>
                  <AppText variant="footnote" tone="label2" numberOfLines={2}>
                    {describeTrigger(t, show)}
                  </AppText>
                </View>
                <View style={{ minHeight: MIN_TAP, justifyContent: 'center' }}>
                  <Switch
                    value={t.enabled}
                    onValueChange={(enabled) => useShowStore.getState().mutateShow((s) => updateTrigger(s, t.id, { enabled }))}
                    accessibilityLabel={`${t.name} を有効にする`}
                  />
                </View>
                <Symbol name="chevron.right" size={13} tint={color.label3} weight="semibold" />
              </View>
            </Pressable>
          );
        })}
      </Section>
    </ScrollView>
  );
}
