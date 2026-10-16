import type { ReactNode } from 'react';
import { Pressable, Switch, View, type ColorValue } from 'react-native';
import type { SFSymbol } from 'expo-symbols';
import { color, MIN_TAP, radius } from '@/theme/tokens';
import { AppText } from './AppText';
import { Symbol } from './Symbol';

/**
 * グループ化した一覧（UITableView の insetGrouped 相当）。
 * スイッチは一覧の行の中だけに置く（HIG Toggles）。
 */

export function Section({ title, footer, children, card }: { title?: string; footer?: string; children: ReactNode; card?: ColorValue }) {
  return (
    <View style={{ marginBottom: 24 }}>
      {title ? (
        <AppText variant="footnote" tone="label2" style={{ marginHorizontal: 16, marginBottom: 6 }}>
          {title}
        </AppText>
      ) : null}
      <View style={{ backgroundColor: card ?? color.groupedCard, borderRadius: radius.card, overflow: 'hidden' }}>{children}</View>
      {footer ? (
        <AppText variant="footnote" tone="label2" style={{ marginHorizontal: 16, marginTop: 6 }}>
          {footer}
        </AppText>
      ) : null}
    </View>
  );
}

export interface RowProps {
  title: string;
  subtitle?: string;
  value?: string;
  icon?: SFSymbol;
  iconTint?: ColorValue;
  tone?: 'label' | 'accent' | 'danger';
  chevron?: boolean;
  onPress?: () => void;
  right?: ReactNode;
  last?: boolean;
  accessibilityHint?: string;
}

export function Row({
  title,
  subtitle,
  value,
  icon,
  iconTint,
  tone = 'label',
  chevron,
  onPress,
  right,
  last,
  accessibilityHint,
}: RowProps) {
  const body = (
    <View style={{ minHeight: MIN_TAP, flexDirection: 'row', alignItems: 'center', paddingLeft: 16 }}>
      {icon ? <Symbol name={icon} size={20} tint={iconTint ?? color.accent} style={{ marginRight: 12 }} /> : null}
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 11,
          paddingRight: 16,
          borderBottomWidth: last ? 0 : 0.5,
          borderBottomColor: color.sep,
          minHeight: MIN_TAP,
        }}
      >
        <View style={{ flex: 1 }}>
          <AppText tone={tone}>{title}</AppText>
          {subtitle ? (
            <AppText variant="footnote" tone="label2">
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {value ? (
          <AppText tone="label2" style={{ marginLeft: 8, flexShrink: 1 }} numberOfLines={1}>
            {value}
          </AppText>
        ) : null}
        {right}
        {chevron ? <Symbol name="chevron.right" size={13} tint={color.label3} weight="semibold" style={{ marginLeft: 8 }} /> : null}
      </View>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => ({ backgroundColor: pressed ? color.fill : 'transparent' })}
    >
      {body}
    </Pressable>
  );
}

export function SwitchRow({
  title,
  subtitle,
  value,
  onValueChange,
  last,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <Row
      title={title}
      subtitle={subtitle}
      last={last}
      right={<Switch value={value} onValueChange={onValueChange} accessibilityLabel={title} />}
    />
  );
}
