import { useRef } from 'react';
import { Switch, View } from 'react-native';
import { Tap as Pressable } from '@/components/ui/Tap';
import { describeFeedback, deviceLabel, driverIdOf } from '@/engine/describe';
import { getFeedbackDef } from '@/drivers/registry';
import { newFeedback } from '@/model/buttonEdits';
import type { FeedbackRule, Show } from '@/model/types';
import { color, MIN_TAP, radius } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/Buttons';
import { OptionField } from './OptionField';
import { pickFeedback } from './pickers';

/**
 * 条件の一覧（トリガーの「条件」。SPEC 2.1-4：すべて満たす時だけ）。
 * 機器の状態・変数の比較・式から選ぶ。見た目の上書きは無い（ボタンの状態表示とは別）。
 */
export function ConditionsEditor({
  conditions,
  show,
  onChange,
}: {
  conditions: FeedbackRule[];
  show: Show;
  onChange: (fn: (c: FeedbackRule[]) => FeedbackRule[], coalesceKey?: string) => void;
}) {
  const addRef = useRef<View>(null);
  const update = (id: string, fn: (c: FeedbackRule) => FeedbackRule, key?: string) =>
    onChange((list) => list.map((c) => (c.id === id ? fn(c) : c)), key);
  return (
    <View style={{ gap: 12 }}>
      {conditions.map((c) => {
        const def = getFeedbackDef(driverIdOf(show, c.deviceId), c.definitionId);
        const d = describeFeedback(c, show);
        return (
          <View key={c.id} style={{ backgroundColor: color.card, borderRadius: radius.card, padding: 14, opacity: c.enabled ? 1 : 0.6 }}>
            <AppText variant="footnote" tone="label2">
              {`${deviceLabel(show, c.deviceId)}・${def?.name ?? c.definitionId}`}
            </AppText>
            <AppText weight="600" style={{ marginBottom: 10 }}>
              {d.condition}
            </AppText>
            {(def?.options ?? []).map((f) => (
              <OptionField
                key={f.id}
                field={f}
                value={c.options[f.id]}
                card={color.fill4}
                onChange={(v) => update(c.id, (x) => ({ ...x, options: { ...x.options, [f.id]: v } }), `${c.id}:${f.id}`)}
              />
            ))}
            <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: MIN_TAP }}>
              <AppText style={{ flex: 1 }}>当てはまらない時を条件にする</AppText>
              <Switch
                value={c.invert}
                onValueChange={(invert) => update(c.id, (x) => ({ ...x, invert }))}
                accessibilityLabel="当てはまらない時を条件にする"
              />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Switch
                value={c.enabled}
                onValueChange={(enabled) => update(c.id, (x) => ({ ...x, enabled }))}
                accessibilityLabel="この条件を有効にする"
              />
              <AppText variant="subhead" tone="label2" style={{ flex: 1 }}>
                有効
              </AppText>
              <IconButton
                icon="trash"
                label="この条件を削除"
                tint={color.danger}
                onPress={() => onChange((list) => list.filter((x) => x.id !== c.id))}
              />
            </View>
          </View>
        );
      })}
      <Pressable
        ref={addRef}
        accessibilityRole="button"
        onPress={() =>
          pickFeedback(show, addRef.current, (deviceId, def, options) => {
            const fb = { ...newFeedback(deviceId, def.id, options), style: {} };
            onChange((list) => [...list, fb]);
          })
        }
        style={({ pressed }) => ({
          minHeight: MIN_TAP,
          justifyContent: 'center',
          paddingHorizontal: 16,
          borderRadius: radius.card,
          backgroundColor: pressed ? color.fill : color.card,
        })}
      >
        <AppText tone="accent">＋ 条件を追加</AppText>
      </Pressable>
    </View>
  );
}
