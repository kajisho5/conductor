import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useShowStore } from '@/stores/show';
import { useRuntimeStore } from '@/stores/runtime';
import { color } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { Row, Section } from '@/components/ui/Group';
import { Segmented } from '@/components/ui/Segmented';
import { useNow } from '@/components/board/useButtonView';
import { resolveOne } from '@/variables/resolve';

/**
 * 変数（SPEC 2.1-5）：上で 4 種類を切り替え。
 * M1 は「内部」と「機器」の値を表示できる。自分で作る変数・式の変数は M4。
 */

type Kind = 'custom' | 'expression' | 'internal' | 'device';
const KINDS: { value: Kind; label: string }[] = [
  { value: 'custom', label: '自分で作る' },
  { value: 'expression', label: '式' },
  { value: 'internal', label: '内部' },
  { value: 'device', label: '機器' },
];
const INTERNAL = [
  { name: 'time', title: '時刻' },
  { name: 'date', title: '日付' },
  { name: 'page', title: '表示中のページ番号' },
  { name: 'page_name', title: '表示中のページ名' },
];

export default function VariablesScreen() {
  const [kind, setKind] = useState<Kind>('internal');
  const show = useShowStore((s) => s.show);
  const values = useRuntimeStore((s) => s.deviceValues);
  const pageNumber = useRuntimeStore((s) => s.pageNumber);
  const now = useNow(kind === 'internal');
  if (!show) return null;
  const ctx = { show, values, pageNumber, now };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Segmented items={KINDS} value={kind} onChange={setKind} style={{ marginBottom: 20 }} accessibilityLabel="変数の種類" />
      {kind === 'custom' ? (
        <Section footer="名前と初期値を決めて、動作やトリガーから値を変えられる変数です。$(custom:名前) で使います。">
          <Row title="自分で作った変数はありません" last />
        </Section>
      ) : null}
      {kind === 'expression' ? (
        <Section footer="ほかの変数から計算される読み取り専用の値です。$(expression:名前) で使います。">
          <Row title="式の変数はありません" last />
        </Section>
      ) : null}
      {kind === 'internal' ? (
        <Section footer="ボタンの文字では $(internal:名前) で使います。">
          {INTERNAL.map((v, i) => (
            <VarRow
              key={v.name}
              title={v.title}
              code={`$(internal:${v.name})`}
              value={resolveOne('internal', v.name, ctx) ?? ''}
              last={i === INTERNAL.length - 1}
            />
          ))}
        </Section>
      ) : null}
      {kind === 'device'
        ? show.devices.map((d) => {
            const keys = Object.keys(values[d.id] ?? {}).sort();
            return (
              <Section key={d.id} title={d.label}>
                {keys.length === 0 ? (
                  <Row title="まだ値がありません" last />
                ) : (
                  keys.map((k, i) => (
                    <VarRow key={k} title={k} code={`$(${d.label}:${k})`} value={values[d.id]?.[k] ?? ''} last={i === keys.length - 1} />
                  ))
                )}
              </Section>
            );
          })
        : null}
    </ScrollView>
  );
}

function VarRow({ title, code, value, last }: { title: string; code: string; value: string; last?: boolean }) {
  return (
    <View
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: color.sep,
        gap: 12,
      }}
      accessible
      accessibilityLabel={`${title}、${value || '値なし'}`}
    >
      <View style={{ flex: 1 }}>
        <AppText>{title}</AppText>
        <AppText variant="footnote" tone="label2" mono selectable>
          {code}
        </AppText>
      </View>
      <AppText tone="label2" mono numberOfLines={1} style={{ flexShrink: 1 }}>
        {value}
      </AppText>
    </View>
  );
}
