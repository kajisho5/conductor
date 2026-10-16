import type { SFSymbol } from 'expo-symbols';
import { View } from 'react-native';
import { color } from '@/theme/tokens';
import { AppText } from './AppText';
import { ProminentButton } from './Buttons';
import { Symbol } from './Symbol';

/** 空の画面：説明 1〜2 行＋次の手順のボタン（HIG Writing） */
export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: SFSymbol;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 }}>
      <Symbol name={icon} size={44} tint={color.label3} />
      <AppText variant="title2" align="center">
        {title}
      </AppText>
      <AppText tone="label2" align="center" style={{ maxWidth: 420 }}>
        {message}
      </AppText>
      {actionLabel && onAction ? <ProminentButton label={actionLabel} onPress={onAction} style={{ marginTop: 8 }} /> : null}
    </View>
  );
}
