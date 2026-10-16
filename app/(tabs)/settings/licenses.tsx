import { ScrollView } from 'react-native';
import licenses from '@/licenses.json';
import { Row, Section } from '@/components/ui/Group';

/** 使っているオープンソースのライセンス（SPEC 2.1-7）。一覧は scripts/licenses/build_licenses.py で作る */
export default function LicensesScreen() {
  const inApp = licenses.filter((l) => l.use === 'アプリに入っている');
  const refs = licenses.filter((l) => l.use !== 'アプリに入っている');
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Section title="アプリに入っているもの">
        {inApp.map((l, i) => (
          <Row key={l.name} title={l.name} subtitle={l.version} value={l.license} last={i === inApp.length - 1} />
        ))}
      </Section>
      <Section title="仕様の参考にしたもの">
        {refs.map((l, i) => (
          <Row key={l.name} title={l.name} subtitle={l.use} value={l.license} last={i === refs.length - 1} />
        ))}
      </Section>
    </ScrollView>
  );
}
