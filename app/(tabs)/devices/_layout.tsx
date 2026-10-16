import { Stack } from 'expo-router';
import { color } from '@/theme/tokens';

export default function Layout() {
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: color.groupedBg } }}>
      <Stack.Screen name="index" options={{ title: '機器', headerLargeTitle: true }} />
      <Stack.Screen name="[id]" options={{ title: '機器' }} />
      <Stack.Screen name="add" options={{ presentation: 'modal', title: '機器を追加' }} />
    </Stack>
  );
}
