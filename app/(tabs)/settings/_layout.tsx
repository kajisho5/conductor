import { Stack } from 'expo-router';
import { color } from '@/theme/tokens';

export default function Layout() {
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: color.groupedBg } }}>
      <Stack.Screen name="index" options={{ title: '設定', headerLargeTitle: true }} />
      <Stack.Screen name="images" options={{ title: '画像' }} />
      <Stack.Screen name="logs" options={{ title: 'ログ' }} />
      <Stack.Screen name="shows" options={{ title: 'ショー' }} />
      <Stack.Screen name="licenses" options={{ title: 'ライセンス' }} />
      <Stack.Screen name="stream-deck" options={{ title: 'Stream Deck' }} />
      <Stack.Screen name="stream-deck-item" options={{ title: 'Stream Deck' }} />
      <Stack.Screen name="stream-deck-model" options={{ presentation: 'formSheet', title: '機種を選ぶ', headerShown: true }} />
    </Stack>
  );
}
