import { useState } from 'react';
import { View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSizeClass } from '@/hooks/useSizeClass';
import { addTrigger, newTrigger } from '@/model/triggers';
import { useShowStore } from '@/stores/show';
import { color } from '@/theme/tokens';
import { EmptyState } from '@/components/ui/EmptyState';
import { TriggerEditor } from '@/components/triggers/TriggerEditor';
import { TriggerList } from '@/components/triggers/TriggerList';

/**
 * トリガー（SPEC 2.1-4、docs/design 08・22）
 * - regular：左に一覧、右に編集
 * - compact：一覧 → タップで編集画面へ
 */
export default function TriggersScreen() {
  const show = useShowStore((s) => s.show);
  const regular = useSizeClass() === 'regular';
  const [selected, setSelected] = useState<string | null>(null);
  if (!show) return null;

  const add = () => {
    const t = newTrigger(show);
    useShowStore.getState().mutateShow((s) => addTrigger(s, t));
    if (regular) setSelected(t.id);
    else router.push({ pathname: '/triggers/[id]', params: { id: t.id } });
  };
  const header = (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button icon="plus" accessibilityLabel="トリガーを追加" onPress={add} />
    </Stack.Toolbar>
  );

  if (show.triggers.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon="bolt.fill"
          title="トリガーはまだありません"
          message="「時刻になったら」「機器が切れたら」などのきっかけで、動作を自動で実行します。アプリが前面にある間だけ動きます。"
          actionLabel="トリガーを追加"
          onAction={add}
        />
      </>
    );
  }

  if (!regular) {
    return (
      <>
        {header}
        <TriggerList show={show} onSelect={(id) => router.push({ pathname: '/triggers/[id]', params: { id } })} />
      </>
    );
  }

  const current = show.triggers.find((t) => t.id === selected) ?? show.triggers[0]!;
  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {header}
      <View style={{ width: 380, borderRightWidth: 0.5, borderRightColor: color.sep }}>
        <TriggerList show={show} selectedId={current.id} onSelect={setSelected} />
      </View>
      <View style={{ flex: 1 }}>
        <TriggerEditor key={current.id} show={show} trigger={current} onDeleted={() => setSelected(null)} />
      </View>
    </View>
  );
}
