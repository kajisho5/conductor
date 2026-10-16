import { Alert, Linking, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { getDefinition } from '@/drivers/registry';
import { duplicateDevice, labelError, usageCount } from '@/model/devices';
import type { Device, Show } from '@/model/types';
import { useRuntimeStore } from '@/stores/runtime';
import { useShowStore } from '@/stores/show';
import { filterLogs, formatTime, useLogStore } from '@/stores/log';
import { color, MIN_TAP, radius, type as typeStyles } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { Row, Section, SwitchRow } from '@/components/ui/Group';
import { OptionField } from '@/components/editor/OptionField';
import { STATUS_LABEL, STATUS_TONE } from '@/components/show/deviceSummary';

/**
 * 機器の編集（SPEC 2.1-3、docs/design 07）：名前・有効・ドライバごとの設定（定義から自動生成）・状態・変数・ログ・根拠。
 * 設定を変えると、少し待ってから接続し直す（入力のたびに切らない）。
 */
export function DeviceEditor({ show, device, onDeleted }: { show: Show; device: Device; onDeleted?: () => void }) {
  const def = getDefinition(device.driverId);
  const status = useRuntimeStore((s) => s.deviceStatus[device.id] ?? 'connecting');
  const error = useRuntimeStore((s) => s.deviceError[device.id]);
  const values = useRuntimeStore((s) => s.deviceValues[device.id]);
  const entries = useLogStore((s) => s.entries);
  const logs = filterLogs(entries, 'debug', device.id).slice(-12).reverse();
  const nameErr = labelError(device.label, show.devices, device.id);
  const store = useShowStore.getState;
  const valueKeys = Object.keys(values ?? {}).sort();

  const remove = () => {
    const n = usageCount(show, device.id);
    Alert.alert(
      `${device.label} を削除しますか？`,
      n > 0
        ? `${n} 個のボタンがこの機器を使っています。削除するとそれらの動作は送れなくなります。ボタン画面の［取り消す］で戻せます。`
        : 'ボタン画面の［取り消す］で戻せます。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: () => {
            store().deleteDevice(device.id);
            onDeleted?.();
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, marginHorizontal: 4 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color[STATUS_TONE[status]] }} />
        <View style={{ flex: 1 }}>
          <AppText weight="600">{STATUS_LABEL[status]}</AppText>
          {error && status !== 'connected' ? (
            <AppText variant="footnote" tone="label2">
              {error}
            </AppText>
          ) : null}
        </View>
      </View>

      <Section title="機器">
        <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: color.sep }}>
          <AppText variant="footnote" tone="label2" style={{ marginBottom: 6 }}>
            名前（変数では $(名前:…)）
          </AppText>
          <TextInput
            value={device.label}
            onChangeText={(label) => store().updateDevice(device.id, { label }, 'label')}
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabel="機器の名前"
            style={[
              typeStyles.body,
              {
                fontFamily: 'Menlo',
                minHeight: MIN_TAP,
                color: color.label,
                backgroundColor: color.fill4,
                borderRadius: radius.field,
                paddingHorizontal: 12,
                borderWidth: nameErr ? 1.5 : 0,
                borderColor: color.danger,
              },
            ]}
          />
          {nameErr ? (
            <AppText variant="footnote" tone="danger" style={{ marginTop: 4 }}>
              {nameErr}
            </AppText>
          ) : null}
        </View>
        <Row title="種類" value={def?.name ?? `${device.driverId}（見つかりません）`} />
        <SwitchRow title="有効" value={device.enabled} onValueChange={(enabled) => store().setDeviceEnabled(device.id, enabled)} last />
      </Section>

      {def && def.configFields.length > 0 ? (
        <Section title="接続の設定">
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            {def.configFields.map((f) => (
              <OptionField
                key={f.id}
                field={f}
                value={device.config[f.id]}
                card={color.fill4}
                onChange={(v) => store().updateDevice(device.id, { config: { ...device.config, [f.id]: v } }, `config:${f.id}`)}
              />
            ))}
          </View>
        </Section>
      ) : null}

      <Section title="値" footer={valueKeys.length > 0 ? `ボタンの文字では $(${device.label}:名前) で使えます。` : undefined}>
        {valueKeys.length === 0 ? (
          <Row title="まだ値がありません" last />
        ) : (
          valueKeys.map((k, i) => <Row key={k} title={k} value={values?.[k]} last={i === valueKeys.length - 1} />)
        )}
      </Section>

      <Section title="最近のログ">
        {logs.length === 0 ? (
          <Row title="ログはまだありません" last />
        ) : (
          logs.map((e) => (
            <View key={e.id} style={{ paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: color.sep }}>
              <AppText variant="caption" tone="label2" mono>
                {formatTime(e.ts)}
              </AppText>
              <AppText variant="footnote" tone={e.level === 'error' ? 'danger' : e.level === 'warn' ? 'warn' : 'label'} mono selectable>
                {e.message}
              </AppText>
            </View>
          ))
        )}
        <Row
          title="すべてのログを見る"
          chevron
          last
          onPress={() => router.push({ pathname: '/settings/logs', params: { device: device.id } })}
        />
      </Section>

      {def && def.evidence.length > 0 ? (
        <Section title="通信仕様の根拠">
          {def.evidence.map((ev, i) => (
            <Row
              key={ev.title}
              title={ev.title}
              subtitle={ev.note}
              value={ev.status}
              chevron={!!ev.url}
              last={i === def.evidence.length - 1}
              onPress={ev.url ? () => void Linking.openURL(ev.url!) : undefined}
            />
          ))}
        </Section>
      ) : null}

      <Section>
        <Row title="機器を複製" onPress={() => store().addDevice(duplicateDevice(device, show.devices))} />
        <Row title="機器を削除" tone="danger" last onPress={remove} />
      </Section>
    </ScrollView>
  );
}
