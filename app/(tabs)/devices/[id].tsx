import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useShowStore } from '@/stores/show';
import { DeviceEditor } from '@/components/devices/DeviceEditor';
import { EmptyState } from '@/components/ui/EmptyState';

/** compact の機器編集 */
export default function DeviceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const show = useShowStore((s) => s.show);
  const device = show?.devices.find((d) => d.id === id);
  if (!show) return null;
  if (!device) {
    return <EmptyState icon="cable.connector" title="機器が見つかりません" message="削除された可能性があります。" />;
  }
  return (
    <>
      <Stack.Screen options={{ title: device.label }} />
      <DeviceEditor show={show} device={device} onDeleted={() => router.back()} />
    </>
  );
}
