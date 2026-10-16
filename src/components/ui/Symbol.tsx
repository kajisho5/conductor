import { SymbolView, type SFSymbol } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';
import { color } from '@/theme/tokens';

/** SF Symbols（HIG Icons）。iOS 以外・テストでは何も描かない */
export function Symbol({
  name,
  size = 20,
  tint = color.label,
  weight,
  style,
}: {
  name: SFSymbol;
  size?: number;
  tint?: ColorValue;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={tint}
      weight={weight}
      resizeMode="scaleAspectFit"
      style={[{ width: size, height: size }, style]}
    />
  );
}
