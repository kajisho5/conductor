import { router, Stack } from 'expo-router';
import { useShowStore } from '@/stores/show';
import { PagePanel } from '@/components/inspector/PagePanel';

/** compact のページ管理シート（regular は設定欄の「ページ」）。閉じる手段を常に出す（HIG Sheets） */
export default function PagesSheet() {
  const show = useShowStore((s) => s.show);
  if (!show) return null;
  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button variant="done" onPress={() => router.back()}>
          完了
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <PagePanel show={show} compact />
    </>
  );
}
