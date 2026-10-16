import { Stack } from 'expo-router';
import { color } from '@/theme/tokens';

export default function Layout() {
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: color.bg } }}>
      <Stack.Screen name="index" options={{ title: '本番', headerLargeTitle: true }} />
    </Stack>
  );
}
