import { Pressable, View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';
import type { SFSymbol } from 'expo-symbols';
import { color, MIN_TAP, radius } from '@/theme/tokens';
import { AppText } from './AppText';
import { Symbol } from './Symbol';

/** 当たり判定を 44pt にそろえるための余白（HIG：見た目が小さくても 44×44） */
export function hitSlopFor(w: number, h: number) {
  const x = Math.max(0, (MIN_TAP - w) / 2);
  const y = Math.max(0, (MIN_TAP - h) / 2);
  return { top: y, bottom: y, left: x, right: x };
}

/** 主要アクション（.prominent 相当：塗りのカプセル） */
export function ProminentButton({
  label,
  icon,
  onPress,
  style,
  accessibilityHint,
}: {
  label: string;
  icon?: SFSymbol;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        {
          minHeight: MIN_TAP,
          paddingHorizontal: 18,
          borderRadius: radius.pill,
          backgroundColor: color.accent,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      {icon ? <Symbol name={icon} size={17} tint={color.onTint} weight="semibold" /> : null}
      <AppText weight="600" style={{ color: color.onTint }}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** 塗りの薄いカプセル（盤の下の操作など） */
export function PillButton({
  label,
  icon,
  onPress,
  tint = color.accent,
  selected,
  style,
}: {
  label: string;
  icon?: SFSymbol;
  onPress: () => void;
  tint?: ColorValue;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [
        {
          minHeight: MIN_TAP,
          paddingHorizontal: 16,
          borderRadius: radius.pill,
          backgroundColor: selected ? color.accent : color.fill,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          opacity: pressed ? 0.6 : 1,
        },
        style,
      ]}
    >
      {icon ? <Symbol name={icon} size={16} tint={selected ? color.onTint : tint} weight="semibold" /> : null}
      <AppText variant="subhead" weight="600" style={{ color: selected ? color.onTint : tint }}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** 記号だけの丸ボタン（見た目も 44pt） */
export function IconButton({
  icon,
  label,
  onPress,
  tint = color.accent,
  disabledLook,
}: {
  icon: SFSymbol;
  label: string;
  onPress: () => void;
  tint?: ColorValue;
  disabledLook?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: MIN_TAP,
        height: MIN_TAP,
        borderRadius: MIN_TAP / 2,
        backgroundColor: color.fill,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed || disabledLook ? 0.5 : 1,
      })}
    >
      <Symbol name={icon} size={18} tint={tint} weight="semibold" />
    </Pressable>
  );
}

/** 小さな状態チップ（接続状況の要約など）。当たり判定は 44pt */
export function Chip({ label, tone, onPress }: { label: string; tone: 'ok' | 'warn' | 'danger' | 'gray'; onPress?: () => void }) {
  const dot = color[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={hitSlopFor(80, 28)}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={label}
      style={{
        height: 28,
        paddingHorizontal: 10,
        borderRadius: 14,
        backgroundColor: color.fill,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
      <AppText variant="footnote" weight="600">
        {label}
      </AppText>
    </Pressable>
  );
}
