import { ScrollView } from 'react-native';
import licenses from '@/licenses.json';
import credits from '@/drivers/remote-bundle/credits.json';
import { Row, Section } from '@/components/ui/Group';

const MIT_TEXT =
  'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.（MIT 以外のものは表のライセンスの条文に従います）';

/** 使っているオープンソースのライセンス（SPEC 2.1-7）。一覧は scripts/licenses/build_licenses.py で作る */
export default function LicensesScreen() {
  const inApp = licenses.filter((l) => l.use === 'アプリに入っている');
  const refs = licenses.filter((l) => l.use !== 'アプリに入っている');
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Section title="アプリに入っているもの" footer={MIT_TEXT}>
        {inApp.map((l, i) => (
          <Row
            key={l.name}
            title={l.name}
            subtitle={'notice' in l && l.notice ? l.notice : l.version}
            value={l.license}
            last={i === inApp.length - 1}
          />
        ))}
      </Section>
      <Section title="仕様の参考にしたもの">
        {refs.map((l, i) => (
          <Row key={l.name} title={l.name} subtitle={l.use} value={l.license} last={i === refs.length - 1} />
        ))}
      </Section>
      <Section title="配信の機器の定義の元にした公開 OSS" footer={MIT_TEXT}>
        {credits.map((c, i) => (
          <Row
            key={c.module}
            title={c.module}
            subtitle={c.authors ? `Copyright (c) ${c.authors}` : c.version}
            value={c.license}
            last={i === credits.length - 1}
          />
        ))}
      </Section>
    </ScrollView>
  );
}
