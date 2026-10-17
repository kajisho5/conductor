import { useState } from 'react';
import { View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSizeClass } from '@/hooks/useSizeClass';
import { useShowStore } from '@/stores/show';
import { color } from '@/theme/tokens';
import { EmptyState } from '@/components/ui/EmptyState';
import { DeviceEditor } from '@/components/devices/DeviceEditor';
import { DeviceList } from '@/components/devices/DeviceList';

/**
 * 機器（SPEC 2.1-3、docs/design 07・21）
 * - regular：左に一覧、右に編集
 * - compact：一覧 → タップで編集画面へ
 * 追加はツールバーの［＋］（主要アクション）
 */
export default function DevicesScreen() {
  const show = useShowStore((s) => s.show);
  const regular = useSizeClass() === 'regular';
  const [selected, setSelected] = useState<string | null>(null);
  if (!show) return null;
  const add = () => router.push('/devices/add');
  const header = (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button icon="plus" accessibilityLabel="機器を追加" onPress={add} />
    </Stack.Toolbar>
  );

  if (show.devices.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon="cable.connector"
          title="機器がありません"
          message="操作したい映像・音響機器を追加すると、ボタンから動かせます。"
          actionLabel="機器を追加"
          onAction={add}
        />
      </>
    );
  }

  if (!regular) {
    return (
      <>
        {header}
        <DeviceList show={show} onSelect={(id) => router.push({ pathname: '/devices/[id]', params: { id } })} />
      </>
    );
  }

  const current = show.devices.find((d) => d.id === selected) ?? show.devices[0]!;
  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {header}
      <View style={{ width: 380, borderRightWidth: 0.5, borderRightColor: color.sep }}>
        <DeviceList show={show} selectedId={current.id} onSelect={setSelected} />
      </View>
      <View style={{ flex: 1 }}>
        <DeviceEditor key={current.id} show={show} device={current} onDeleted={() => setSelected(null)} />
      </View>
    </View>
  );
}
