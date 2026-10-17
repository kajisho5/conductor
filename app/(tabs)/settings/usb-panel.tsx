import { useEffect, useRef } from 'react';
import { ActionSheetIOS, Linking, ScrollView, View, findNodeHandle } from 'react-native';
import type { UsbPanelSettings } from '@/model/types';
import { panelController, usbPanelSettings, usePanelStore } from '@/engine/panel';
import { useShowStore } from '@/stores/show';
import { color, MIN_TAP } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/Buttons';
import { Row, Section, SwitchRow } from '@/components/ui/Group';

/** 設定 > Stream Deck（SPEC 2.5、docs/design 12-ipad-usb-panel） */

/** メーカーの開発者資料の「はじめに」（SPEC 2.5 の根拠と同じページ） */
const HELP_URL = 'https://docs.elgato.com/ipad/getting-started';
const BRIGHTNESS = [10, 25, 40, 55, 70, 85, 100] as const;

export default function UsbPanelScreen() {
  const show = useShowStore((s) => s.show);
  const panels = usePanelStore((s) => s.panels);
  const error = usePanelStore((s) => s.error);
  const driverApp = usePanelStore((s) => s.driverApp);
  const pageRef = useRef<View>(null);
  const brightRef = useRef<View>(null);

  useEffect(() => {
    void panelController.refreshDriverApp();
  }, []);

  if (!show) return null;
  const st = usbPanelSettings(show);
  const set = (patch: Partial<UsbPanelSettings>) => {
    useShowStore.getState().updateSettings({ usbPanel: { ...st, ...patch } });
    panelController.refresh();
  };
  const panel = panels[0];
  const maxRow = Math.max(1, show.grid.rows - (panel ? panel.rows : 1) + 1);
  const maxCol = Math.max(1, show.grid.columns - (panel ? panel.columns : 1) + 1);
  const fixedPage = st.page === 'follow' ? undefined : show.pages.find((p) => p.number === st.page);
  const pageLabel = fixedPage ? `${fixedPage.number}  ${fixedPage.name}` : 'iPad と同じ';

  const choosePage = () => {
    const options = ['iPad と同じ', ...show.pages.map((p) => `${p.number}  ${p.name}`), 'キャンセル'];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: '表示するページ',
        options,
        cancelButtonIndex: options.length - 1,
        anchor: pageRef.current ? (findNodeHandle(pageRef.current) ?? undefined) : undefined,
      },
      (i) => {
        if (i === 0) set({ page: 'follow' });
        const p = show.pages[i - 1];
        if (p) set({ page: p.number });
      },
    );
  };

  const chooseBrightness = () => {
    const options = [...BRIGHTNESS.map((b) => `${b}%`), 'キャンセル'];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: '明るさ',
        options,
        cancelButtonIndex: options.length - 1,
        anchor: brightRef.current ? (findNodeHandle(brightRef.current) ?? undefined) : undefined,
      },
      (i) => {
        const b = BRIGHTNESS[i];
        if (b !== undefined) set({ brightness: b });
      },
    );
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Section
        title="つないでいる Stream Deck"
        footer={
          error?.kind === 'entitlement'
            ? 'このアプリに Stream Deck を使う許可がありません。開発元にお知らせください。'
            : panels.length === 0
              ? 'USB-C でつなぐと、ここに出ます。出ない時は、メーカーの接続アプリを入れて iPad の設定でドライバをオンにしてください。'
              : undefined
        }
      >
        {panels.length === 0 ? (
          <Row title={error ? 'つなげません' : 'つながっていません'} subtitle={error?.message} icon="cable.connector" iconTint={color.label3} last />
        ) : (
          panels.map((p, i) => (
            <Row
              key={p.id}
              title={`${p.keyCount} キー（${p.columns} × ${p.rows}）`}
              subtitle="接続中・USB-C"
              icon="circle.fill"
              iconTint={color.ok}
              last={i === panels.length - 1}
            />
          ))
        )}
      </Section>

      <Section title="表示" footer="キーには、iPad のボタンと同じ文字・色・画像・状態表示が出ます。文字や色は、いつものボタン編集で変えるとすぐキーにも出ます。">
        <View ref={pageRef} collapsable={false}>
          <Row title="表示するページ" icon="square.grid.2x2" value={pageLabel} chevron onPress={choosePage} />
        </View>
        <Stepper title="表示する範囲：何行目から" value={Math.min(st.row, maxRow)} min={1} max={maxRow} onChange={(row) => set({ row })} />
        <Stepper title="表示する範囲：何列目から" value={Math.min(st.col, maxCol)} min={1} max={maxCol} onChange={(col) => set({ col })} />
        <View ref={brightRef} collapsable={false}>
          <Row title="明るさ" icon="sun.max" iconTint={color.warn} value={`${st.brightness}%`} chevron onPress={chooseBrightness} />
        </View>
        <SwitchRow
          title="編集中も押せる"
          subtitle="オフにすると本番画面の時だけキーで押せます"
          value={st.editPress}
          onValueChange={(editPress) => set({ editPress })}
          last
        />
      </Section>

      <Section title="準備" footer="M1 以降のチップで USB-C の iPad だけで使えます。メーカーの接続アプリを入れ、iPad の設定でドライバをオンにします。">
        <Row
          title="メーカーの接続アプリ"
          icon="info.circle"
          iconTint={color.label2}
          value={driverApp === null ? '確認中' : driverApp ? '入っています' : '入っていません'}
        />
        <Row title="使い方を見る" icon="questionmark.circle" chevron last onPress={() => void Linking.openURL(HELP_URL)} />
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
