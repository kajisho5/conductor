import { useEffect, useState } from 'react';
import { TextInput, type StyleProp, type TextStyle } from 'react-native';

/**
 * 数を入れる欄。打っている間は文字のまま持ち、入力を終えた時に範囲へ収めて確定する
 * （全部消した途端に最小値へ戻って「1」の後ろに続けて打ってしまう、を防ぐ）。
 */
export function NumberInput({
  value,
  min,
  max,
  onCommit,
  accessibilityLabel,
  style,
}: {
  value: number;
  min: number;
  max: number;
  onCommit: (v: number) => void;
  accessibilityLabel: string;
  style?: StyleProp<TextStyle>;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text.replace(/[^0-9]/g, ''));
    const v = text.trim() === '' || !Number.isFinite(n) ? value : Math.max(min, Math.min(max, Math.round(n)));
    setText(String(v));
    if (v !== value) onCommit(v);
  };
  return (
    <TextInput
      value={text}
      onChangeText={(t) => setText(t.replace(/[^0-9]/g, ''))}
      onEndEditing={commit}
      onSubmitEditing={commit}
      keyboardType="number-pad"
      accessibilityLabel={accessibilityLabel}
      style={style}
    />
  );
}
