import { useRef, useState } from 'react';
import { Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import { triggerEngine } from '@/engine/triggers';
import {
  addEvent,
  defaultEvent,
  duplicateTrigger,
  EVENT_LABEL,
  EVENT_TYPES,
  mapActions,
  mapConditions,
  mapTriggerVariables,
  moveTrigger,
  removeEvent,
  removeTrigger,
  setEvent,
  updateTrigger,
  WEEKDAY_LABEL,
} from '@/model/triggers';
import type { Show, Trigger, TriggerEvent } from '@/model/types';
import { useShowStore } from '@/stores/show';
import { color, MIN_TAP, radius, type as typeStyles } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { IconButton, PillButton } from '@/components/ui/Buttons';
import { Segmented } from '@/components/ui/Segmented';
import { Symbol } from '@/components/ui/Symbol';
import { ActionListEditor } from '@/components/editor/ActionListEditor';
import { ConditionsEditor } from '@/components/editor/ConditionsEditor';
import { LocalVariablesEditor } from '@/components/editor/LocalVariablesEditor';
import { sheet } from '@/components/editor/sheet';
import { exportAndShare } from '@/storage/session';

/**
 * トリガーの編集（SPEC 2.1-4、docs/design 08）：名前・メモ・有効・テスト実行、タブ「きっかけ／条件／動作／トリガー変数」。
 */

type Tab = 'events' | 'conditions' | 'actions' | 'variables';
const TABS: { value: Tab; label: string }[] = [
  { value: 'events', label: 'きっかけ' },
  { value: 'conditions', label: '条件' },
  { value: 'actions', label: '動作' },
  { value: 'variables', label: '変数' },
];

export function TriggerEditor({ show, trigger, onDeleted }: { show: Show; trigger: Trigger; onDeleted?: () => void }) {
  const [tab, setTab] = useState<Tab>('events');
  const [result, setResult] = useState<string | null>(null);
  const menuRef = useRef<View>(null);
  const mutate = (fn: (s: Show) => Show, key?: string) => useShowStore.getState().mutateShow(fn, key ? `${trigger.id}:${key}` : undefined);
  const index = show.triggers.findIndex((t) => t.id === trigger.id);

  const test = async () => {
    setResult(null);
    const r = await triggerEngine.run(trigger, 'テスト実行');
    setResult(r === 'sent' ? '動作を送りました' : r === 'failed' ? '送れなかった動作があります（ログを確認）' : '送る動作がありません');
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <View style={{ backgroundColor: color.groupedCard, borderRadius: radius.card, padding: 14, gap: 10, marginBottom: 16 }}>
        <TextInput
          value={trigger.name}
          onChangeText={(name) => mutate((s) => updateTrigger(s, trigger.id, { name }), 'name')}
          placeholder="トリガーの名前"
          placeholderTextColor={color.label3}
          accessibilityLabel="トリガーの名前"
          style={[
            typeStyles.headline,
            { minHeight: MIN_TAP, color: color.label, backgroundColor: color.fill4, borderRadius: radius.field, paddingHorizontal: 12 },
          ]}
        />
        <TextInput
          value={trigger.notes}
          onChangeText={(notes) => mutate((s) => updateTrigger(s, trigger.id, { notes }), 'notes')}
          placeholder="メモ"
          placeholderTextColor={color.label3}
          multiline
          accessibilityLabel="メモ"
          style={[
            typeStyles.subhead,
            {
              minHeight: MIN_TAP,
              color: color.label,
              backgroundColor: color.fill4,
              borderRadius: radius.field,
              paddingHorizontal: 12,
              paddingVertical: 11,
            },
          ]}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Switch
            value={trigger.enabled}
            onValueChange={(enabled) => mutate((s) => updateTrigger(s, trigger.id, { enabled }))}
            accessibilityLabel="このトリガーを有効にする"
          />
          <AppText style={{ flex: 1 }}>{trigger.enabled ? '有効' : '無効'}</AppText>
          <PillButton label="テスト" icon="play.fill" onPress={() => void test()} />
          <View ref={menuRef} collapsable={false}>
            <IconButton
              icon="ellipsis"
              label="その他の操作"
              onPress={() =>
                sheet(
                  trigger.name,
                  [
                    ...(index > 0 ? [{ label: '上へ移動', run: () => mutate((s) => moveTrigger(s, trigger.id, -1)) }] : []),
                    ...(index < show.triggers.length - 1
                      ? [{ label: '下へ移動', run: () => mutate((s) => moveTrigger(s, trigger.id, 1)) }]
                      : []),
                    {
                      label: '書き出す',
                      run: () => void exportAndShare(show, { kind: 'trigger', triggerId: trigger.id }, `${show.name} ${trigger.name}`),
                    },
                    { label: 'トリガーを複製', run: () => mutate((s) => duplicateTrigger(s, trigger.id)) },
                    {
                      label: 'トリガーを削除',
                      destructive: true,
                      run: () => {
                        mutate((s) => removeTrigger(s, trigger.id));
                        onDeleted?.();
                      },
                    },
                  ],
                  menuRef.current,
                )
              }
            />
          </View>
        </View>
        {result ? (
          <AppText variant="footnote" tone="label2" accessibilityLiveRegion="polite">
            {result}
          </AppText>
        ) : null}
      </View>

      <Segmented items={TABS} value={tab} onChange={setTab} style={{ marginBottom: 16 }} accessibilityLabel="トリガーの設定の種類" />

      {tab === 'events' ? <EventsEditor show={show} trigger={trigger} mutate={mutate} /> : null}
      {tab === 'conditions' ? (
        <View style={{ gap: 8 }}>
          <AppText variant="footnote" tone="label2" style={{ marginLeft: 4 }}>
            すべて満たす時だけ動作を実行します
          </AppText>
          <ConditionsEditor
            conditions={trigger.conditions}
            show={show}
            onChange={(fn, key) => mutate((s) => mapConditions(s, trigger.id, fn), key)}
          />
        </View>
      ) : null}
      {tab === 'actions' ? (
        <ActionListEditor
          title="動作"
          list={trigger.actions}
          show={show}
          delayFromStart={false}
          onList={(fn, key) => mutate((s) => mapActions(s, trigger.id, fn), key)}
        />
      ) : null}
      {tab === 'variables' ? (
        <View style={{ gap: 8 }}>
          <AppText variant="footnote" tone="label2" style={{ marginLeft: 4 }}>
            $(this:reason) できっかけの説明、ボタンのきっかけでは $(this:button) でボタン名も使えます
          </AppText>
          <LocalVariablesEditor
            variables={trigger.localVariables}
            onChange={(fn, key) => mutate((s) => mapTriggerVariables(s, trigger.id, fn), key)}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

type Mutate = (fn: (s: Show) => Show, key?: string) => void;

function EventsEditor({ show, trigger, mutate }: { show: Show; trigger: Trigger; mutate: Mutate }) {
  const addRef = useRef<View>(null);
  return (
    <View style={{ gap: 12 }}>
      <AppText variant="footnote" tone="label2" style={{ marginLeft: 4 }}>
        どれかが起きたら動きます。アプリが前面にある間だけ動きます。
      </AppText>
      {trigger.events.map((e, i) => (
        <EventCard
          key={`${i}:${e.type}`}
          event={e}
          show={show}
          onChange={(next, key) => mutate((s) => setEvent(s, trigger.id, i, next), key ? `event${i}:${key}` : undefined)}
          onRemove={() => mutate((s) => removeEvent(s, trigger.id, i))}
        />
      ))}
      <Pressable
        ref={addRef}
        accessibilityRole="button"
        onPress={() =>
          sheet(
            'きっかけ',
            EVENT_TYPES.map((t) => ({ label: EVENT_LABEL[t], run: () => mutate((s) => addEvent(s, trigger.id, defaultEvent(t, s))) })),
            addRef.current,
          )
        }
        style={({ pressed }) => ({
          minHeight: MIN_TAP,
          justifyContent: 'center',
          paddingHorizontal: 16,
          borderRadius: radius.card,
          backgroundColor: pressed ? color.fill : color.groupedCard,
        })}
      >
        <AppText tone="accent">＋ きっかけを追加</AppText>
      </Pressable>
    </View>
  );
}

function EventCard({
  event,
  show,
  onChange,
  onRemove,
}: {
  event: TriggerEvent;
  show: Show;
  onChange: (e: TriggerEvent, key?: string) => void;
  onRemove: () => void;
}) {
  const devRef = useRef<View>(null);
  const field = [
    typeStyles.body,
    { minHeight: MIN_TAP, color: color.label, backgroundColor: color.fill4, borderRadius: radius.field, paddingHorizontal: 12 },
  ];
  return (
    <View style={{ backgroundColor: color.groupedCard, borderRadius: radius.card, padding: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <AppText weight="600" style={{ flex: 1 }}>
          {EVENT_LABEL[event.type]}
        </AppText>
        <IconButton icon="trash" label="このきっかけを削除" tint={color.danger} onPress={onRemove} />
      </View>
      {event.type === 'variableChanged' ? (
        <TextInput
          value={event.variable}
          onChangeText={(variable) => onChange({ ...event, variable }, 'variable')}
          placeholder="$(DEMO-SW-A:pgm)"
          placeholderTextColor={color.label3}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="見張る変数"
          style={[...field, { fontFamily: 'Menlo' }]}
        />
      ) : null}
      {event.type === 'interval' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TextInput
            value={String(event.seconds)}
            onChangeText={(t) =>
              onChange({ ...event, seconds: Math.max(1, Math.min(86400, Math.round(Number(t.replace(/[^0-9]/g, '')) || 1))) }, 'seconds')
            }
            keyboardType="number-pad"
            accessibilityLabel="間隔（秒）"
            style={[...field, { minWidth: 100, textAlign: 'right', fontVariant: ['tabular-nums'] }]}
          />
          <AppText tone="label2">秒ごと</AppText>
        </View>
      ) : null}
      {event.type === 'timeOfDay' ? (
        <>
          <TextInput
            value={event.time}
            onChangeText={(time) => onChange({ ...event, time }, 'time')}
            placeholder="09:00"
            placeholderTextColor={color.label3}
            keyboardType="numbers-and-punctuation"
            accessibilityLabel="時刻（時:分）"
            style={[
              ...field,
              { fontFamily: 'Menlo', borderWidth: /^([01]\d|2[0-3]):[0-5]\d$/.test(event.time) ? 0 : 1.5, borderColor: color.danger },
            ]}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityLabel="曜日（選ばなければ毎日）">
            {WEEKDAY_LABEL.map((w, d) => {
              const on = event.weekdays.includes(d);
              return (
                <Pressable
                  key={w}
                  onPress={() =>
                    onChange({ ...event, weekdays: on ? event.weekdays.filter((x) => x !== d) : [...event.weekdays, d].sort() })
                  }
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${w}曜日`}
                  style={{
                    width: MIN_TAP,
                    height: MIN_TAP,
                    borderRadius: MIN_TAP / 2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? color.accent : color.fill,
                  }}
                >
                  <AppText weight="600" style={on ? { color: color.onTint } : undefined}>
                    {w}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          <AppText variant="footnote" tone="label2">
            曜日を選ばなければ毎日
          </AppText>
        </>
      ) : null}
      {event.type === 'deviceConnected' || event.type === 'deviceDisconnected' ? (
        <Pressable
          ref={devRef}
          accessibilityRole="button"
          onPress={() =>
            sheet(
              '機器',
              show.devices.map((d) => ({ label: d.label, run: () => onChange({ ...event, deviceId: d.id }) })),
              devRef.current,
            )
          }
          style={{
            minHeight: MIN_TAP,
            backgroundColor: color.fill4,
            borderRadius: radius.field,
            paddingHorizontal: 12,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <AppText style={{ flex: 1 }}>{show.devices.find((d) => d.id === event.deviceId)?.label ?? '機器を選ぶ'}</AppText>
          <Symbol name="chevron.up.chevron.down" size={14} tint={color.label2} />
        </Pressable>
      ) : null}
      {event.type === 'conditionTrue' || event.type === 'conditionFalse' ? (
        <AppText variant="footnote" tone="label2">
          「条件」タブの条件が、すべて満たされた時／満たされなくなった時に動きます
        </AppText>
      ) : null}
    </View>
  );
}
