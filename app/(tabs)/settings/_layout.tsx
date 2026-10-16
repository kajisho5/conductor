import { Stack } from 'expo-router';
import { color } from '@/theme/tokens';

export default function Layout() {
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: color.groupedBg } }}>
      <Stack.Screen name="index" options={{ title: '設定', headerLargeTitle: true }} />
      <Stack.Screen name="images" options={{ title: '画像' }} />
      <Stack.Screen name="logs" options={{ title: 'ログ' }} />
    </Stack>
  );
}
