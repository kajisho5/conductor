import { router, Stack } from 'expo-router';
import { useShowStore } from '@/stores/show';
import { useUiStore } from '@/stores/ui';
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

  const done = () => {
    useUiStore.getState().setSheetSnapshot(null);
    router.back();
  };

  return (
    <>
      {/* ヘッダーのボタンは UIKit の標準（Liquid Glass・文字の位置は OS が合わせる） */}
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={cancel}>キャンセル</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button variant="done" onPress={done}>
          完了
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      {show && selected && button ? <ButtonInspector cell={selected} button={button} show={show} compact /> : null}
    </>
  );
}
