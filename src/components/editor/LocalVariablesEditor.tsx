import { TextInput, View } from 'react-native';
import { Tap as Pressable } from '@/components/ui/Tap';
import { newLocalVariable, variableNameError } from '@/model/buttonEdits';
import type { LocalVariable } from '@/model/types';
import { color, MIN_TAP, radius, type as typeStyles } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/Buttons';
import { Segmented } from '@/components/ui/Segmented';

/**
 * ボタン変数・トリガー変数（SPEC 2.1-5：$(this:名前)）。値か式。式は上から順に計算するので、上の変数を使える。
 */
const KINDS = [
  { value: 'value', label: '値' },
  { value: 'expression', label: '式' },
] as const;

export function LocalVariablesEditor({
  variables,
  onChange,
  preview,
}: {
  variables: LocalVariable[];
  onChange: (fn: (v: LocalVariable[]) => LocalVariable[], coalesceKey?: string) => void;
  /** 今の値（分かる時だけ） */
  preview?: (v: LocalVariable) => string | undefined;
}) {
  const names = variables.map((v) => v.name);
  const update = (id: string, patch: Partial<LocalVariable>, key?: string) =>
    onChange((list) => list.map((v) => (v.id === id ? { ...v, ...patch } : v)), key);
  return (
    <View style={{ gap: 12 }}>
      {variables.length === 0 ? (
        <AppText variant="footnote" tone="label2" style={{ marginLeft: 4 }}>
          ここだけで使う変数です。文字や動作で $(this:名前) と書くと、その値になります。
        </AppText>
      ) : null}
      {variables.map((v) => {
        const err = variableNameError(v.name, names);
        const now = preview?.(v);
        return (
          <View key={v.id} style={{ backgroundColor: color.card, borderRadius: radius.card, padding: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AppText tone="label2" mono>
                $(this:
              </AppText>
              <TextInput
                value={v.name}
                onChangeText={(name) => update(v.id, { name }, `${v.id}:name`)}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="変数の名前"
                style={[
                  typeStyles.body,
                  {
                    flex: 1,
                    fontFamily: 'Menlo',
                    minHeight: MIN_TAP,
                    color: color.label,
                    backgroundColor: color.fill4,
                    borderRadius: radius.field,
                    paddingHorizontal: 10,
                    borderWidth: err ? 1.5 : 0,
                    borderColor: color.danger,
                  },
                ]}
              />
              <AppText tone="label2" mono>
                )
              </AppText>
              <IconButton
                icon="trash"
                label="この変数を削除"
                tint={color.danger}
                onPress={() => onChange((list) => list.filter((x) => x.id !== v.id))}
              />
            </View>
            {err ? (
              <AppText variant="footnote" tone="danger">
                {err}
              </AppText>
            ) : null}
            <Segmented items={KINDS} value={v.kind} onChange={(kind) => update(v.id, { kind })} accessibilityLabel="値か式か" />
            <TextInput
              value={v.value}
              onChangeText={(value) => update(v.id, { value }, `${v.id}:value`)}
              placeholder={v.kind === 'value' ? '値（$(…) も使えます）' : '式の例：$(custom:count) * 2'}
              placeholderTextColor={color.label3}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={v.kind === 'value' ? '値' : '式'}
              style={[
                typeStyles.body,
                {
                  fontFamily: 'Menlo',
                  fontSize: 15,
                  minHeight: MIN_TAP,
                  color: color.label,
                  backgroundColor: color.fill4,
                  borderRadius: radius.field,
                  paddingHorizontal: 12,
                },
              ]}
            />
            {now !== undefined ? <AppText variant="footnote" tone="label2" mono>{`今の値：${now}`}</AppText> : null}
          </View>
        );
      })}
      <Pressable
        accessibilityRole="button"
        onPress={() => onChange((list) => [...list, newLocalVariable(list.map((x) => x.name))])}
        style={({ pressed }) => ({
          minHeight: MIN_TAP,
          justifyContent: 'center',
          paddingHorizontal: 16,
          borderRadius: radius.card,
          backgroundColor: pressed ? color.fill : color.card,
        })}
      >
        <AppText tone="accent">＋ 変数を追加</AppText>
      </Pressable>
    </View>
  );
}
