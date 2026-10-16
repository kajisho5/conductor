import { ScrollView, Switch, View } from 'react-native';
import { useShowStore } from '@/stores/show';
import { useRuntimeStore } from '@/stores/runtime';
import { color, MIN_TAP } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { Section } from '@/components/ui/Group';
import { EmptyState } from '@/components/ui/EmptyState';
import { STATUS_LABEL, STATUS_TONE } from '@/components/show/deviceSummary';

/**
 * 機器の一覧（SPEC 2.1-3）：名前・機種・状態・有効スイッチ。
 * M1 はデモ機器だけ（通信しない）。追加・編集・診断は実機ドライバと一緒に M2 以降。
 */
export default function DevicesScreen() {
  const show = useShowStore((s) => s.show);
  const status = useRuntimeStore((s) => s.deviceStatus);
  if (!show) return null;
  if (show.devices.length === 0) {
    return (
      <EmptyState icon="cable.connector" title="機器がありません" message="操作したい映像・音響機器を追加すると、ボタンから動かせます。" />
    );
  }
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Section footer="アプリが前面にある間だけ機器と通信します。デモ機器は通信せず、押した結果だけを再現します。">
        {show.devices.map((d, i) => {
          const s = status[d.id] ?? 'connecting';
          const model = typeof d.config.model === 'string' ? d.config.model : d.driverId;
          return (
            <View
              key={d.id}
              style={{
                minHeight: 64,
                flexDirection: 'row',
                alignItems: 'center',
                paddingLeft: 16,
                paddingRight: 16,
                gap: 12,
                borderBottomWidth: i === show.devices.length - 1 ? 0 : 0.5,
                borderBottomColor: color.sep,
              }}
              accessible
              accessibilityLabel={`${d.label}、${model}、${STATUS_LABEL[s]}`}
            >
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color[STATUS_TONE[s]] }} />
              <View style={{ flex: 1, paddingVertical: 10 }}>
                <AppText weight="600">{d.label}</AppText>
                <AppText variant="footnote" tone="label2">{`${model}・${STATUS_LABEL[s]}`}</AppText>
              </View>
              <View style={{ minHeight: MIN_TAP, justifyContent: 'center' }}>
                <Switch
                  value={d.enabled}
                  onValueChange={(v) => useShowStore.getState().setDeviceEnabled(d.id, v)}
                  accessibilityLabel={`${d.label} を有効にする`}
                />
              </View>
            </View>
          );
        })}
      </Section>
    </ScrollView>
  );
}
