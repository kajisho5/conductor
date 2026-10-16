import { Pressable } from 'react-native';
import { router, Stack } from 'expo-router';
import { useShowStore } from '@/stores/show';
import { useUiStore } from '@/stores/ui';
import { color, MIN_TAP } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { ButtonInspector } from '@/components/inspector/ButtonInspector';

/**
 * compact のボタン編集シート（SPEC 3.2、docs/design 20）。［キャンセル］［完了］を併置（HIG Sheets）。
 * キャンセルはシートを開いてからの変更（空きマスに作ったボタンを含む）を取り消して閉じる。
 */
export default function EditButtonSheet() {
  const show = useShowStore((s) => s.show);
  const selected = useUiStore((s) => s.selected);
  const page = selected && show ? show.pages.find((p) => p.id === selected.pageId) : undefined;
  const button = selected && page ? page.buttons[selected.key] : undefined;

  const cancel = () => {
    const snapshot = useUiStore.getState().sheetSnapshot;
    if (snapshot && snapshot !== useShowStore.getState().show) useShowStore.getState().restore(snapshot);
    useUiStore.getState().setSheetSnapshot(null);
    router.back();
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => <HeaderText label="キャンセル" onPress={cancel} />,
          headerRight: () => (
            <HeaderText
              label="完了"
              bold
              onPress={() => {
                useUiStore.getState().setSheetSnapshot(null);
                router.back();
              }}
            />
          ),
        }}
      />
      {show && selected && button ? <ButtonInspector cell={selected} button={button} show={show} compact /> : null}
    </>
  );
}

function HeaderText({ label, onPress, bold }: { label: string; onPress: () => void; bold?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{ minHeight: MIN_TAP, minWidth: MIN_TAP, justifyContent: 'center', paddingHorizontal: 4 }}
    >
      <AppText weight={bold ? '600' : '400'} style={{ color: color.accent }}>
        {label}
      </AppText>
    </Pressable>
  );
}
