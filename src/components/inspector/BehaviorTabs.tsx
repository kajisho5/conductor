import { View } from 'react-native';
import { delayLabel, describeAction, describeFeedback, deviceLabel } from '@/engine/describe';
import type { ActionList, ButtonModel, Show } from '@/model/types';
import type { CellRef } from '@/stores/show';
import { useShowStore } from '@/stores/show';
import { useRuntimeStore } from '@/stores/runtime';
import { color, radius } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { Row, Section, SwitchRow } from '@/components/ui/Group';
import { Segmented } from '@/components/ui/Segmented';
import { ButtonFace } from '@/components/board/ButtonFace';

/**
 * 動作／状態表示／変数／オプションのタブ。
 * M1 は動作・状態表示・変数を一覧表示（追加・編集は M2・M4 の動作エンジン／変数で入れる）。オプションは編集できる。
 */

const MODE_LABEL = { sequential: '順番に実行', concurrent: '同時に実行' } as const;

function ActionListView({ title, list, show }: { title: string; list: ActionList; show: Show }) {
  return (
    <Section title={list.actions.length > 1 ? `${title}・${MODE_LABEL[list.mode]}` : title} card={color.card}>
      {list.actions.length === 0 ? (
        <Row title="動作なし" tone="label" last />
      ) : (
        list.actions.map((a, i) => {
          const d = describeAction(a);
          const delay = delayLabel(a.delayMs);
          return (
            <Row
              key={a.id}
              title={`${deviceLabel(show, a.deviceId)}・${d.title}`}
              subtitle={[delay, d.detail].filter(Boolean).join('　')}
              value={a.enabled ? undefined : '無効'}
              last={i === list.actions.length - 1}
            />
          );
        })
      )}
    </Section>
  );
}

export function ActionsTab({ button, show }: { button: ButtonModel; show: Show }) {
  const current = useRuntimeStore((s) => s.stepIndex[button.id] ?? 0);
  return (
    <View>
      {button.steps.map((step, i) => (
        <View key={step.id}>
          {button.steps.length > 1 ? (
            <AppText variant="headline" style={{ marginBottom: 8, marginLeft: 4 }}>
              {`ステップ ${i + 1}${i === current ? '（次に押すと実行）' : ''}`}
            </AppText>
          ) : null}
          <ActionListView title="押した時" list={step.press} show={show} />
          <ActionListView title="離した時" list={step.release} show={show} />
          {step.holds.map((h) => (
            <ActionListView
              key={h.id}
              title={`${(h.durationMs / 1000).toFixed(1)} 秒長押し${h.repeat ? '（繰り返し）' : ''}`}
              list={h.actions}
              show={show}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export function FeedbackTab({ button, show }: { button: ButtonModel; show: Show }) {
  if (button.feedbacks.length === 0) {
    return (
      <Section card={color.card}>
        <Row title="状態表示なし" last />
      </Section>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      {button.feedbacks.map((f) => {
        const d = describeFeedback(f);
        return (
          <View
            key={f.id}
            style={{
              backgroundColor: color.card,
              borderRadius: radius.card,
              padding: 14,
              flexDirection: 'row',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="footnote" tone="label2">
                {deviceLabel(show, f.deviceId)}
              </AppText>
              <AppText>{d.condition}</AppText>
              <AppText variant="subhead" tone="label2">
                {d.effect}
              </AppText>
            </View>
            <ButtonFace
              style={{ ...button.style, ...f.style }}
              text={f.style.text ?? button.style.text}
              width={56}
              height={56}
              radius={9}
            />
          </View>
        );
      })}
    </View>
  );
}

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
