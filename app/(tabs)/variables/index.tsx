import { useState } from 'react';
import { ScrollView, Switch, TextInput, View } from 'react-native';
import { Tap as Pressable } from '@/components/ui/Tap';
import { variableNameError } from '@/model/buttonEdits';
import {
  addCustomVariable,
  addExpressionVariable,
  removeCustomVariable,
  removeExpressionVariable,
  updateCustomVariable,
  renameCustomVariable,
  updateExpressionVariable,
} from '@/model/variables';
import type { CustomVariable, ExpressionVariable, Show } from '@/model/types';
import { useShowStore } from '@/stores/show';
import { useRuntimeStore } from '@/stores/runtime';
import { color, MIN_TAP, radius, type as typeStyles } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/Buttons';
import { Row, Section } from '@/components/ui/Group';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState } from '@/components/ui/EmptyState';
import { router } from 'expo-router';
import { useNow } from '@/components/board/useButtonView';
import { currentContext, evaluateFor, INTERNAL_VARIABLES, resolveOne, type ResolveContext } from '@/variables/resolve';

/**
 * 変数（SPEC 2.1-5、docs/design 09・22）：上で 4 種類を切り替え。
 * 自分で作る変数（名前・初期値・今の値・再起動後も保持）、式の変数（読み取り専用の値）、内部の値、機器の値。
 */

type Kind = 'custom' | 'expression' | 'internal' | 'device';
const KINDS: { value: Kind; label: string }[] = [
  { value: 'custom', label: '自分で作る' },
  { value: 'expression', label: '式' },
  { value: 'internal', label: '内部' },
  { value: 'device', label: '機器' },
];

const input = [
  typeStyles.body,
  { minHeight: MIN_TAP, color: color.label, backgroundColor: color.fill4, borderRadius: radius.field, paddingHorizontal: 12 },
];

export default function VariablesScreen() {
  const [kind, setKind] = useState<Kind>('custom');
  const show = useShowStore((s) => s.show);
  const values = useRuntimeStore((s) => s.deviceValues);
  const custom = useRuntimeStore((s) => s.customValues);
  const status = useRuntimeStore((s) => s.deviceStatus);
  const pageNumber = useRuntimeStore((s) => s.pageNumber);
  const now = useNow(kind === 'internal' || kind === 'expression');
  if (!show) return null;
  const ctx: ResolveContext = { ...currentContext(show), values, custom, status, pageNumber, now };
  const mutate = (fn: (s: Show) => Show, key?: string) => useShowStore.getState().mutateShow(fn, key);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Segmented items={KINDS} value={kind} onChange={setKind} style={{ marginBottom: 20 }} accessibilityLabel="変数の種類" />

      {kind === 'custom' ? (
        <View style={{ gap: 12 }}>
          <AppText variant="footnote" tone="label2" style={{ marginLeft: 4 }}>
            動作やトリガーから値を変えられる変数です。$(custom:名前) で使います。
          </AppText>
          {show.customVariables.map((v) => (
            <CustomCard key={v.id} v={v} show={show} current={custom[v.name]} mutate={mutate} />
          ))}
          <AddRow label="＋ 変数を追加" onPress={() => mutate(addCustomVariable)} />
        </View>
      ) : null}

      {kind === 'expression' ? (
        <View style={{ gap: 12 }}>
          <AppText variant="footnote" tone="label2" style={{ marginLeft: 4 }}>
            ほかの変数から計算される読み取り専用の値です。$(expression:名前) で使います。
          </AppText>
          {show.expressionVariables.map((v) => (
            <ExpressionCard key={v.id} v={v} show={show} ctx={ctx} mutate={mutate} />
          ))}
          <AddRow label="＋ 式の変数を追加" onPress={() => mutate(addExpressionVariable)} />
        </View>
      ) : null}

      {kind === 'internal' ? (
        <Section footer="ほかに $(internal:機器名_status) で機器の接続状態。">
          {INTERNAL_VARIABLES.map((v, i) => (
            <VarRow
              key={v.name}
              title={v.title}
              code={`$(internal:${v.name})`}
              value={resolveOne('internal', v.name, ctx) ?? ''}
              last={i === INTERNAL_VARIABLES.length - 1}
            />
          ))}
        </Section>
      ) : null}

      {kind === 'device' && show.devices.length === 0 ? (
        <EmptyState
          icon="cable.connector"
          title="機器がありません"
          message="機器を追加すると、機器から届いた値（PGM の入力など）がここに出ます。"
          actionLabel="機器を追加"
          onAction={() => router.push('/devices/add')}
        />
      ) : null}
      {kind === 'device'
        ? show.devices.map((d) => {
            const keys = Object.keys(values[d.id] ?? {})
              .filter((k) => !k.startsWith('addr_'))
              .sort();
            return (
              <Section key={d.id} title={d.label}>
                {keys.length === 0 ? (
                  <Row title="まだ値がありません" last />
                ) : (
                  keys.map((k, i) => (
                    <VarRow key={k} title={k} code={`$(${d.label}:${k})`} value={values[d.id]?.[k] ?? ''} last={i === keys.length - 1} />
                  ))
                )}
              </Section>
            );
          })
        : null}
    </ScrollView>
  );
}

function AddRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TAP,
        justifyContent: 'center',
        paddingHorizontal: 16,
        borderRadius: radius.card,
        backgroundColor: pressed ? color.fill : color.groupedCard,
      })}
    >
      <AppText tone="accent">{label}</AppText>
    </Pressable>
  );
}

type Mutate = (fn: (s: Show) => Show, key?: string) => void;

function CustomCard({ v, show, current, mutate }: { v: CustomVariable; show: Show; current: string | undefined; mutate: Mutate }) {
  const err = variableNameError(
    v.name,
    show.customVariables.map((x) => x.name),
  );
  const value = current ?? v.defaultValue;
  return (
    <View style={{ backgroundColor: color.groupedCard, borderRadius: radius.card, padding: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <AppText tone="label2" mono>
          $(custom:
        </AppText>
        <TextInput
          value={v.name}
          onChangeText={(name) => {
            // 今の値も新しい名前へ移す（名前を 1 文字変えるたびに初期値へ戻らないように）
            const rt = useRuntimeStore.getState();
            const cur = rt.customValues[v.name];
            mutate((s) => renameCustomVariable(s, v.id, name), `custom:${v.id}:name`);
            if (cur !== undefined) {
              const { [v.name]: _old, ...rest } = rt.customValues;
              rt.setCustomValues({ ...rest, [name]: cur });
            }
          }}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="変数の名前"
          style={[...input, { flex: 1, fontFamily: 'Menlo', borderWidth: err ? 1.5 : 0, borderColor: color.danger }]}
        />
        <AppText tone="label2" mono>
          )
        </AppText>
        <IconButton icon="trash" label="この変数を削除" tint={color.danger} onPress={() => mutate((s) => removeCustomVariable(s, v.id))} />
      </View>
      {err ? (
        <AppText variant="footnote" tone="danger">
          {err}
        </AppText>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <AppText style={{ width: 64 }}>初期値</AppText>
        <TextInput
          value={v.defaultValue}
          onChangeText={(defaultValue) => mutate((s) => updateCustomVariable(s, v.id, { defaultValue }), `custom:${v.id}:default`)}
          autoCapitalize="none"
          accessibilityLabel="初期値"
          style={[...input, { flex: 1 }]}
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <AppText style={{ width: 64 }}>今の値</AppText>
        <TextInput
          value={value}
          onChangeText={(t) => useRuntimeStore.getState().setCustomValue(v.name, t)}
          autoCapitalize="none"
          accessibilityLabel="今の値"
          style={[...input, { flex: 1 }]}
        />
        {current !== undefined && current !== v.defaultValue ? (
          <IconButton
            icon="arrow.counterclockwise"
            label="初期値に戻す"
            onPress={() => {
              const next = { ...useRuntimeStore.getState().customValues };
              delete next[v.name];
              useRuntimeStore.getState().setCustomValues(next);
            }}
          />
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: MIN_TAP }}>
        <AppText style={{ flex: 1 }}>再起動後も値を保持</AppText>
        <Switch
          value={v.persist}
          onValueChange={(persist) => mutate((s) => updateCustomVariable(s, v.id, { persist }))}
          accessibilityLabel="再起動後も値を保持"
        />
      </View>
    </View>
  );
}

function ExpressionCard({ v, show, ctx, mutate }: { v: ExpressionVariable; show: Show; ctx: ResolveContext; mutate: Mutate }) {
  const err = variableNameError(
    v.name,
    show.expressionVariables.map((x) => x.name),
  );
  const r = v.expression.trim() ? evaluateFor(v.expression, ctx) : null;
  return (
    <View style={{ backgroundColor: color.groupedCard, borderRadius: radius.card, padding: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <AppText tone="label2" mono>
          $(expression:
        </AppText>
        <TextInput
          value={v.name}
          onChangeText={(name) => mutate((s) => updateExpressionVariable(s, v.id, { name }), `expr:${v.id}:name`)}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="変数の名前"
          style={[...input, { flex: 1, fontFamily: 'Menlo', borderWidth: err ? 1.5 : 0, borderColor: color.danger }]}
        />
        <AppText tone="label2" mono>
          )
        </AppText>
        <IconButton
          icon="trash"
          label="この変数を削除"
          tint={color.danger}
          onPress={() => mutate((s) => removeExpressionVariable(s, v.id))}
        />
      </View>
      {err ? (
        <AppText variant="footnote" tone="danger">
          {err}
        </AppText>
      ) : null}
      <TextInput
        value={v.expression}
        onChangeText={(expression) => mutate((s) => updateExpressionVariable(s, v.id, { expression }), `expr:${v.id}:expr`)}
        placeholder="例：$(custom:count) * 2"
        placeholderTextColor={color.label3}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="式"
        style={[...input, { fontFamily: 'Menlo', fontSize: 15, paddingVertical: 11, minHeight: 66, textAlignVertical: 'top' }]}
      />
      {r ? (
        'value' in r ? (
          <AppText variant="footnote" tone="label2" mono>{`今の値：${r.value}`}</AppText>
        ) : (
          <AppText variant="footnote" tone="danger">
            {r.error}
          </AppText>
        )
      ) : null}
    </View>
  );
}

function VarRow({ title, code, value, last }: { title: string; code: string; value: string; last?: boolean }) {
  return (
    <View
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: color.sep,
        gap: 12,
      }}
      accessible
      accessibilityLabel={`${title}、${value || '値なし'}`}
    >
      <View style={{ flex: 1 }}>
        <AppText>{title}</AppText>
        <AppText variant="footnote" tone="label2" mono selectable>
          {code}
        </AppText>
      </View>
      <AppText tone="label2" mono numberOfLines={1} style={{ flexShrink: 1 }}>
        {value}
      </AppText>
    </View>
  );
}
