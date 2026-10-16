import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useSizeClass } from '@/hooks/useSizeClass';

/**
 * タブはシステムの UITabBar（Native Tabs）。iPad（regular）は sidebarAdaptable でサイドバーになる（SPEC 3.1）。
 * compact（iPhone・iPad の狭い Split View・iPhone Duo 外側）は 5 タブ：本番はボタン画面の［本番］から、画像は設定から（SPEC 3.2）。
 * どの大きさでも使える機能は同じ（HIG：iPhone Duo のどのポーズでも同じ機能）。
 * 記号は塗りの版、バッジは付けない（SPEC 15.5）。
 */
export default function TabsLayout() {
  const regular = useSizeClass() === 'regular';
  return (
    <NativeTabs sidebarAdaptable minimizeBehavior="never">
      <NativeTabs.Trigger name="buttons">
        <NativeTabs.Trigger.Icon sf="square.grid.2x2.fill" />
        <NativeTabs.Trigger.Label>ボタン</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="live" hidden={!regular}>
        <NativeTabs.Trigger.Icon sf="play.rectangle.fill" />
        <NativeTabs.Trigger.Label>本番</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="devices">
        <NativeTabs.Trigger.Icon sf="cable.connector" />
        <NativeTabs.Trigger.Label>機器</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="triggers">
        <NativeTabs.Trigger.Icon sf="bolt.fill" />
        <NativeTabs.Trigger.Label>トリガー</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="variables">
        <NativeTabs.Trigger.Icon sf="dollarsign" />
        <NativeTabs.Trigger.Label>変数</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="images" hidden={!regular}>
        <NativeTabs.Trigger.Icon sf="photo.on.rectangle" />
        <NativeTabs.Trigger.Label>画像</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf="gearshape.fill" />
        <NativeTabs.Trigger.Label>設定</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
