import { ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { GRID_LIMITS } from '@/model/grid';
import type { ShowSettings } from '@/model/types';
import { useSizeClass } from '@/hooks/useSizeClass';
import { useShowStore } from '@/stores/show';
import { color, MIN_TAP, type as typeStyles } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/Buttons';
import { Row, Section, SwitchRow } from '@/components/ui/Group';
import { Segmented } from '@/components/ui/Segmented';
import { LocalAddressesSection } from '@/components/devices/LocalAddresses';
import { DriversSection } from '@/components/devices/DriversSection';
import { exportAndShare, pickAndImport } from '@/storage/session';
import { usePanelStore } from '@/engine/panel';

/** 設定（SPEC 2.1-7）。M1：ショー名、ボタン（グリッド・帯・状態アイコン）、本番、画像（compact）、このアプリについて */

const LOCK_ITEMS = [
  { value: 'ask', label: '毎回聞く' },
  { value: 'always', label: 'いつもロック' },
  { value: 'never', label: 'ロックしない' },
] as const;
const HOLD_ITEMS = [
  { value: '1000', label: '1.0 秒' },
  { value: '1500', label: '1.5 秒' },
  { value: '2000', label: '2.0 秒' },
  { value: '3000', label: '3.0 秒' },
] as const;
const AWAKE_ITEMS = [
  { value: 'showModeOnly', label: '本番中だけ' },
  { value: 'always', label: 'いつも' },
] as const;

export default function SettingsScreen() {
  const show = useShowStore((s) => s.show);
  const compact = useSizeClass() === 'compact';
  const panelSupported = usePanelStore((s) => s.supported);
  const panelCount = usePanelStore((s) => s.panels.length);
  if (!show) return null;
  const st = show.settings;
  const set = (patch: Partial<ShowSettings>) => useShowStore.getState().updateSettings(patch);
  const { columns, rows } = show.grid;
  const setGrid = (c: number, r: number) => useShowStore.getState().setGrid(c, r);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <LocalAddressesSection />

      <Section title="ショー">
        <View
          style={{
            minHeight: MIN_TAP,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            borderBottomWidth: 0.5,
            borderBottomColor: color.sep,
          }}
        >
          <AppText style={{ marginRight: 12 }}>名前</AppText>
          <TextInput
            value={show.name}
            onChangeText={(name) => useShowStore.getState().renameShow(name)}
            placeholder="ショー名"
            placeholderTextColor={color.label3}
            accessibilityLabel="ショー名"
            style={[typeStyles.body, { flex: 1, textAlign: 'right', color: color.label, minHeight: MIN_TAP }]}
          />
        </View>
        <Row title="ショーを切り替える" chevron onPress={() => router.push('/settings/shows')} />
        <Row
          title="このショーを書き出す"
          icon="square.and.arrow.up"
          onPress={() => void exportAndShare(show, { kind: 'show' }, show.name)}
        />
        <Row title="ファイルから読み込む" icon="square.and.arrow.down" last onPress={() => void pickAndImport()} />
      </Section>

      <Section title="ボタン" footer="範囲の外になったボタンは消えずに残り、大きさを戻すと再び表示されます。">
        <Stepper title="列" value={columns} min={GRID_LIMITS.minColumns} max={GRID_LIMITS.maxColumns} onChange={(c) => setGrid(c, rows)} />
        <Stepper title="行" value={rows} min={GRID_LIMITS.minRows} max={GRID_LIMITS.maxRows} onChange={(r) => setGrid(columns, r)} />
        <SwitchRow title="上部の帯（位置表示）" value={st.showTopBar} onValueChange={(showTopBar) => set({ showTopBar })} />
        <SwitchRow title="状態アイコン" value={st.showStatusIcons} onValueChange={(showStatusIcons) => set({ showStatusIcons })} last />
      </Section>

      <Section title="本番" footer="「ボタンの上でもスワイプで切替」をオンにすると、押してから送るまで少し待つようになります。">
        <SegmentRow title="ロック" items={LOCK_ITEMS} value={st.lockOnShowMode} onChange={(lockOnShowMode) => set({ lockOnShowMode })} />
        <SegmentRow
          title="ロック解除の長押し時間"
          items={HOLD_ITEMS}
          value={String(st.unlockHoldMs) as (typeof HOLD_ITEMS)[number]['value']}
          onChange={(v) => set({ unlockHoldMs: Number(v) })}
        />
        <SegmentRow title="スリープ防止" items={AWAKE_ITEMS} value={st.keepAwake} onChange={(keepAwake) => set({ keepAwake })} />
        <SwitchRow title="触覚" value={st.haptics} onValueChange={(haptics) => set({ haptics })} />
        <SwitchRow
          title="ボタンの上でもスワイプで切替"
          value={st.showModeSwipe}
          onValueChange={(showModeSwipe) => set({ showModeSwipe })}
          last
        />
      </Section>

      {panelSupported ? (
        <Section>
          <Row
            title="USB ボタン盤"
            icon="keyboard"
            value={panelCount > 0 ? '接続中' : 'つながっていません'}
            chevron
            last
            onPress={() => router.push('/settings/usb-panel')}
          />
        </Section>
      ) : null}

      <Section>
        {compact ? <Row title="画像" icon="photo.on.rectangle" chevron onPress={() => router.push('/settings/images')} /> : null}
        <Row title="ログ" icon="doc.text.magnifyingglass" chevron last onPress={() => router.push('/settings/logs')} />
      </Section>

      <DriversSection />

      <Section title="このアプリについて" footer="アプリが前面にある間だけ、機器との通信とトリガーが動きます。">
        <Row title="バージョン" value={Constants.expoConfig?.version ?? '不明'} />
        <Row title="オープンソースのライセンス" chevron last onPress={() => router.push('/settings/licenses')} />
      </Section>
    </ScrollView>
  );
}

function Stepper({
  title,
  value,
  min,
  max,
  onChange,
}: {
  title: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <View
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        gap: 12,
        borderBottomWidth: 0.5,
        borderBottomColor: color.sep,
      }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={title}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment' && value < max) onChange(value + 1);
        if (e.nativeEvent.actionName === 'decrement' && value > min) onChange(value - 1);
      }}
    >
      <AppText style={{ flex: 1 }}>{title}</AppText>
      {value > min ? (
        <IconButton icon="minus" label={`${title}を減らす`} onPress={() => onChange(value - 1)} />
      ) : (
        <View style={{ width: MIN_TAP }} />
      )}
      <AppText weight="600" style={{ minWidth: 28, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
        {String(value)}
      </AppText>
      {value < max ? (
        <IconButton icon="plus" label={`${title}を増やす`} onPress={() => onChange(value + 1)} />
      ) : (
        <View style={{ width: MIN_TAP }} />
      )}
    </View>
  );
}

function SegmentRow<T extends string>({
  title,
  items,
  value,
  onChange,
}: {
  title: string;
  items: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: 0.5, borderBottomColor: color.sep }}>
      <AppText>{title}</AppText>
      <Segmented items={items} value={value} onChange={onChange} accessibilityLabel={title} />
    </View>
  );
}
