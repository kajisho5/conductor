import { TextInput, View, type TextInputProps } from 'react-native';
import { color, radius, type as typeStyles } from '@/theme/tokens';
import { AppText } from './AppText';

/** 見出し付きの入力欄（設定欄・シートで共通） */
export function Field({ label, multiline, style, ...rest }: TextInputProps & { label?: string }) {
  return (
    <View style={{ marginBottom: 16 }}>
      {label ? (
        <AppText variant="footnote" tone="label2" style={{ marginLeft: 4, marginBottom: 6 }}>
          {label}
        </AppText>
      ) : null}
      <TextInput
        {...rest}
        multiline={multiline}
        placeholderTextColor={color.label3}
        accessibilityLabel={rest.accessibilityLabel ?? label}
        style={[
          typeStyles.body,
          {
            color: color.label,
            backgroundColor: color.card,
            borderRadius: radius.field,
            paddingHorizontal: 14,
            paddingVertical: 11,
            minHeight: multiline ? 66 : 44,
            textAlignVertical: multiline ? 'top' : 'center',
          },
          style,
        ]}
      />
    </View>
  );
}
