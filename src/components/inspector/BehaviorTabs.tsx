import { View } from 'react-native';
import type { ButtonModel, Show } from '@/model/types';
import { useRuntimeStore } from '@/stores/runtime';
import { currentContext, resolveOne } from '@/variables/resolve';
import { LocalVariablesEditor } from '@/components/editor/LocalVariablesEditor';
import type { CellRef } from '@/stores/show';
import { useShowStore } from '@/stores/show';
import { color } from '@/theme/tokens';
import { Row, Section, SwitchRow } from '@/components/ui/Group';
import { Segmented } from '@/components/ui/Segmented';

/**
 * 変数／オプションのタブ。ボタン変数の追加・編集は M4（変数）で入れる。
 */

export function VariablesTab({ cell, button, show }: { cell: CellRef; button: ButtonModel; show: Show }) {
  // 変数の値が変わったら「今の値」を描き直すために購読する
  const custom = useRuntimeStore((st) => st.customValues);
  const values = useRuntimeStore((st) => st.deviceValues);
  const ctx = { ...currentContext(show, button), custom, values };
  return (
    <LocalVariablesEditor
      variables={button.localVariables}
      onChange={(fn, key) => useShowStore.getState().mutateButton(cell, (b) => ({ ...b, localVariables: fn(b.localVariables) }), key)}
      preview={(v) => resolveOne('this', v.name, ctx)}
    />
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
