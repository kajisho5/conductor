import { ScrollView, Switch, View } from 'react-native';
import { Tap as Pressable } from '@/components/ui/Tap';
import { getDefinition } from '@/drivers/registry';
import type { Show } from '@/model/types';
import { useRuntimeStore } from '@/stores/runtime';
import { useShowStore } from '@/stores/show';
import { color, MIN_TAP } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { Section } from '@/components/ui/Group';
import { LocalAddressesSection } from './LocalAddresses';
import { Symbol } from '@/components/ui/Symbol';
import { STATUS_LABEL, STATUS_TONE } from '@/components/show/deviceSummary';

/** 機器の一覧（SPEC 2.1-3）：名前・種類・状態・有効スイッチ。行をタップで編集 */
export function DeviceList({ show, selectedId, onSelect }: { show: Show; selectedId?: string | null; onSelect: (id: string) => void }) {
  const status = useRuntimeStore((s) => s.deviceStatus);
  const errors = useRuntimeStore((s) => s.deviceError);
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Section footer="アプリが前面にある間だけ機器と通信します。裏に回ると接続を閉じ、戻ると接続し直します。">
        {show.devices.map((d, i) => {
          const s = status[d.id] ?? 'connecting';
          const def = getDefinition(d.driverId);
          const model = typeof d.config.model === 'string' && d.driverId === 'demo' ? d.config.model : (def?.name ?? d.driverId);
          const err = s !== 'connected' && s !== 'disabled' ? errors[d.id] : undefined;
          const selected = selectedId === d.id;
          return (
            <Pressable
              key={d.id}
              onPress={() => onSelect(d.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${d.label}、${model}、${STATUS_LABEL[s]}`}
              style={({ pressed }) => ({ backgroundColor: selected ? color.fill : pressed ? color.fill4 : 'transparent' })}
            >
              <View
                style={{
                  minHeight: 64,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  gap: 12,
                  borderBottomWidth: i === show.devices.length - 1 ? 0 : 0.5,
                  borderBottomColor: color.sep,
                }}
              >
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color[STATUS_TONE[s]] }} />
                <View style={{ flex: 1, paddingVertical: 10 }}>
                  <AppText weight="600">{d.label}</AppText>
                  <AppText variant="footnote" tone="label2" numberOfLines={1}>{`${model}・${STATUS_LABEL[s]}`}</AppText>
                  {err ? (
                    <AppText variant="footnote" tone="label2" numberOfLines={1}>
                      {err}
                    </AppText>
                  ) : null}
                </View>
                <View style={{ minHeight: MIN_TAP, justifyContent: 'center' }}>
                  <Switch
                    value={d.enabled}
                    onValueChange={(v) => useShowStore.getState().setDeviceEnabled(d.id, v)}
                    accessibilityLabel={`${d.label} を有効にする`}
                  />
                </View>
                <Symbol name="chevron.right" size={13} tint={color.label3} weight="semibold" />
              </View>
            </Pressable>
          );
        })}
      </Section>
      <LocalAddressesSection />
    </ScrollView>
  );
}
