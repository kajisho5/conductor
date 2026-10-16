import { useShowStore } from '@/stores/show';
import { PagePanel } from '@/components/inspector/PagePanel';

/** compact のページ管理シート（regular は設定欄の「ページ」） */
export default function PagesSheet() {
  const show = useShowStore((s) => s.show);
  if (!show) return null;
  return <PagePanel show={show} compact />;
}
