import SegmentedControl from '@react-native-segmented-control/segmented-control';
import type { StyleProp, ViewStyle } from 'react-native';

/** システムのセグメンテッドコントロール（UISegmentedControl）。項目は名詞（HIG Segmented controls） */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  style,
  accessibilityLabel,
}: {
  items: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const index = Math.max(
    0,
    items.findIndex((i) => i.value === value),
  );
  return (
    <SegmentedControl
      values={items.map((i) => i.label)}
      selectedIndex={index}
      onChange={(e) => {
        const next = items[e.nativeEvent.selectedSegmentIndex];
        if (next) onChange(next.value);
      }}
      style={[{ minHeight: 32 }, style]}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
