import { Stack } from 'expo-router';
import { color } from '@/theme/tokens';

export default function Layout() {
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: color.groupedBg } }}>
      <Stack.Screen name="index" options={{ title: '変数', headerLargeTitle: true }} />
    </Stack>
  );
}
