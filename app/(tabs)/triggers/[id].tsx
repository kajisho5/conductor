import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useShowStore } from '@/stores/show';
import { EmptyState } from '@/components/ui/EmptyState';
import { TriggerEditor } from '@/components/triggers/TriggerEditor';

/** compact のトリガー編集 */
export default function TriggerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const show = useShowStore((s) => s.show);
  const trigger = show?.triggers.find((t) => t.id === id);
  if (!show) return null;
  if (!trigger) return <EmptyState icon="bolt.fill" title="トリガーが見つかりません" message="削除された可能性があります。" />;
  return (
    <>
      <Stack.Screen options={{ title: trigger.name }} />
      <TriggerEditor show={show} trigger={trigger} onDeleted={() => router.back()} />
    </>
  );
}
