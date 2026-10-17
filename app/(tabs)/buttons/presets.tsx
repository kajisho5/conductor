import { router, Stack } from 'expo-router';
import { PresetsPanel } from '@/components/inspector/PresetsPanel';

/** compact のプリセットシート（regular は設定欄の「プリセット」）。閉じる手段を常に出す（HIG Sheets） */
export default function PresetsSheet() {
  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button variant="done" onPress={() => router.back()}>
          完了
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <PresetsPanel compact />
    </>
  );
}
