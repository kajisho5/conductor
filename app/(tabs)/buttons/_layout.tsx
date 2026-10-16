import { Stack } from 'expo-router';
import { color } from '@/theme/tokens';

/** ボタン：盤（index）と、compact で開くシート（ボタン編集・ページ・プリセット） */
export default function ButtonsLayout() {
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: color.bg } }}>
      <Stack.Screen name="index" options={{ title: 'ボタン' }} />
      <Stack.Screen
        name="edit"
        options={{ presentation: 'modal', title: 'ボタンを編集', contentStyle: { backgroundColor: color.group } }}
      />
      <Stack.Screen name="pages" options={{ presentation: 'modal', title: 'ページ', contentStyle: { backgroundColor: color.group } }} />
      <Stack.Screen
        name="presets"
        options={{ presentation: 'modal', title: 'プリセット', contentStyle: { backgroundColor: color.group } }}
      />
    </Stack>
  );
}
