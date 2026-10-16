import { View } from 'react-native';
import type { ButtonModel } from '@/model/types';
import type { CellRef } from '@/stores/show';
import { useShowStore } from '@/stores/show';
import { color } from '@/theme/tokens';
import { Row, Section, SwitchRow } from '@/components/ui/Group';
import { Segmented } from '@/components/ui/Segmented';

/**
 * 変数／オプションのタブ。ボタン変数の追加・編集は M4（変数）で入れる。
 */

export function VariablesTab({ button }: { button: ButtonModel }) {
  return (
    <Section card={color.card} footer="ボタンの文字で $(this:名前) として使えます。">
      {button.localVariables.length === 0 ? (
        <Row title="ボタン変数なし" last />
      ) : (
        button.localVariables.map((v, i) => (
          <Row
            key={v.id}
            title={v.name}
            value={v.value}
            subtitle={v.kind === 'expression' ? '式' : '値'}
            last={i === button.localVariables.length - 1}
          />
        ))
      )}
    </Section>
  );
}

const PROGRESSION = [
  { value: 'auto', label: '押すたびに次へ' },
  { value: 'manual', label: '手動' },
] as const;

export function OptionsTab({ cell, button }: { cell: CellRef; button: ButtonModel }) {
  const options = button.options;
  const set = (patch: Partial<ButtonModel['options']>) => useShowStore.getState().updateButton(cell, { options: { ...options, ...patch } });
  return (
    <View>
      <Section card={color.card} title="ステップの進み方">
        <View style={{ padding: 12 }}>
          <Segmented
            items={PROGRESSION}
            value={options.stepProgression === 'manual' ? 'manual' : 'auto'}
            onChange={(stepProgression) => set({ stepProgression })}
            accessibilityLabel="ステップの進み方"
          />
        </View>
      </Section>
      <Section card={color.card}>
        <SwitchRow
          title="動作からの見た目変更を許可"
          value={options.allowStyleChangeByActions}
          onValueChange={(allowStyleChangeByActions) => set({ allowStyleChangeByActions })}
          last
        />
      </Section>
    </View>
  );
}
