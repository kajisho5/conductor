import { Text, type TextProps } from 'react-native';
import { color, type ColorToken, type as typeStyles } from '@/theme/tokens';

/** 文字はテキストスタイル＋システム色で出す（Dynamic Type に追従。HIG Typography） */
export type TextVariant = keyof typeof typeStyles;

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  tone?: ColorToken;
  weight?: '400' | '500' | '600' | '700';
  mono?: boolean;
  align?: 'left' | 'center' | 'right';
}

export function AppText({ variant = 'body', tone = 'label', weight, mono, align, style, ...rest }: AppTextProps) {
  return (
    <Text
      {...rest}
      style={[
        typeStyles[variant],
        { color: color[tone] },
        weight ? { fontWeight: weight } : null,
        mono ? { fontFamily: 'Menlo', fontVariant: ['tabular-nums'] } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
