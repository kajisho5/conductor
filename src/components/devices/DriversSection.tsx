import { useState } from 'react';
import { Alert } from 'react-native';
import { updateInstalled, useCatalogStore } from '@/drivers/remote';
import { Row, Section } from '@/components/ui/Group';

function when(iso?: string): string {
  if (!iso) return 'まだ取得していません';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 設定：配信の機器の定義を取り直す（SPEC 7.1） */
export function DriversSection() {
  const fetchedAt = useCatalogStore((s) => s.fetchedAt);
  const count = useCatalogStore((s) => s.entries.length);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const r = await updateInstalled();
      Alert.alert(
        '機器の定義を確かめました',
        r.updated === 0 && r.failed === 0
          ? '使っている定義は最新です。'
          : `${r.updated} 件を新しくしました。${r.failed > 0 ? `${r.failed} 件は取得できませんでした。` : ''}`,
      );
    } catch (e) {
      Alert.alert('確かめられませんでした', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="機器の定義" footer="配信の一覧から追加した機器の定義を、新しい版に取り直します。取ってきた定義はこの iPhone / iPad に保存するので、現場で通信できなくても使えます。">
      <Row title="配信の一覧" value={`${count} 種類・${when(fetchedAt)}`} />
      <Row title={busy ? '確かめています…' : '新しい版を確かめる'} tone="accent" last onPress={busy ? undefined : () => void run()} />
    </Section>
  );
}
