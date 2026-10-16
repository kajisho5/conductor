import { useRef } from 'react';
import { ActionSheetIOS, Platform, Pressable, Switch, TextInput, View, findNodeHandle } from 'react-native';
import type { FieldDef } from '@/drivers/types';
import type { OptionValue } from '@/model/types';
import { color, MIN_TAP, radius, type as typeStyles } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { Segmented } from '@/components/ui/Segmented';
import { Symbol } from '@/components/ui/Symbol';

/**
 * ドライバ定義の項目（FieldDef）から入力欄を作る（SPEC 7 章「設定画面を自動生成」）。
 * 動作のオプション・状態表示のオプション・機器の設定で共通。
 */

export function fieldError(field: FieldDef, value: OptionValue | undefined): string | null {
  if (value === undefined || value === '') return null;
  if (field.type === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) return '数字を入れてください';
    if (field.min !== undefined && n < field.min) return `${field.min} 以上にしてください`;
    if (field.max !== undefined && n > field.max) return `${field.max} 以下にしてください`;
  }
  if (field.type === 'text' && field.pattern && typeof value === 'string' && !value.includes('$(')) {
    try {
      if (!new RegExp(field.pattern).test(value)) return '形式が正しくありません';
    } catch {
      return null;
    }
  }
  return null;
}

export function OptionField({
  field,
  value,
  onChange,
  card = color.card,
}: {
  field: FieldDef;
  value: OptionValue | undefined;
  onChange: (v: OptionValue) => void;
  card?: typeof color.card;
}) {
  const shown = value === undefined ? field.default : typeof value === 'object' ? value.expression : value;
  const err = fieldError(field, value);
  const ref = useRef<View>(null);

  let input: React.ReactNode;
  if (field.type === 'boolean') {
    return (
      <View style={{ minHeight: MIN_TAP, flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <AppText style={{ flex: 1 }}>{field.label}</AppText>
        <Switch value={shown === true || shown === 'true'} onValueChange={onChange} accessibilityLabel={field.label} />
      </View>
    );
  } else if (field.type === 'select') {
    const choices = field.choices ?? [];
    const current = choices.find((c) => c.id === String(shown ?? '')) ?? choices[0];
    if (choices.length <= 4 && choices.every((c) => c.label.length <= 6)) {
      input = (
        <Segmented
          items={choices.map((c) => ({ value: c.id, label: c.label }))}
          value={current?.id ?? ''}
          onChange={(v) => onChange(v)}
          accessibilityLabel={field.label}
        />
      );
    } else {
      input = (
        <Pressable
          ref={ref}
          accessibilityRole="button"
          accessibilityLabel={`${field.label}、${current?.label ?? ''}`}
          onPress={() => {
            if (Platform.OS !== 'ios') return;
            const options = [...choices.map((c) => c.label), 'キャンセル'];
            ActionSheetIOS.showActionSheetWithOptions(
              {
                title: field.label,
                options,
                cancelButtonIndex: options.length - 1,
                anchor: ref.current ? (findNodeHandle(ref.current) ?? undefined) : undefined,
              },
              (i) => {
                const c = choices[i];
                if (c) onChange(c.id);
              },
            );
          }}
          style={{
            minHeight: MIN_TAP,
            borderRadius: radius.field,
            backgroundColor: card,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <AppText style={{ flex: 1 }}>{current?.label ?? ''}</AppText>
          <Symbol name="chevron.up.chevron.down" size={14} tint={color.label2} />
        </Pressable>
      );
    }
  } else {
    const multiline = field.type === 'textarea';
    input = (
      <TextInput
        value={shown === undefined ? '' : String(shown)}
        onChangeText={(t) => {
          if (field.type === 'number') {
            const n = Number(t);
            onChange(t.trim() !== '' && Number.isFinite(n) ? n : t);
          } else onChange(t);
        }}
        placeholder={field.placeholder}
        placeholderTextColor={color.label3}
        keyboardType={field.type === 'number' ? 'numbers-and-punctuation' : 'default'}
        autoCapitalize="none"
        autoCorrect={false}
        multiline={multiline}
        accessibilityLabel={field.label}
        style={[
          typeStyles.body,
          field.mono ? { fontFamily: 'Menlo', fontSize: 15 } : null,
          {
            color: color.label,
            backgroundColor: card,
            borderRadius: radius.field,
            paddingHorizontal: 14,
            paddingVertical: 11,
            minHeight: multiline ? 88 : MIN_TAP,
            textAlignVertical: multiline ? 'top' : 'center',
            borderWidth: err ? 1.5 : 0,
            borderColor: color.danger,
          },
        ]}
      />
    );
  }

  return (
    <View style={{ marginBottom: 12 }}>
      <AppText variant="footnote" tone="label2" style={{ marginLeft: 4, marginBottom: 6 }}>
        {field.label}
      </AppText>
      {input}
      {err ? (
        <AppText variant="footnote" tone="danger" style={{ marginLeft: 4, marginTop: 4 }}>
          {err}
        </AppText>
      ) : field.help ? (
        <AppText variant="footnote" tone="label2" style={{ marginLeft: 4, marginTop: 4 }}>
          {field.help}
        </AppText>
      ) : null}
    </View>
  );
}
