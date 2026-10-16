import { useRef, useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import {
  addHold,
  addStep,
  duplicateStep,
  getList,
  mapList,
  moveStep,
  removeHold,
  removeStep,
  updateHold,
  type ListRef,
} from '@/model/buttonEdits';
import type { ButtonModel, HoldGroup, Show } from '@/model/types';
import type { CellRef } from '@/stores/show';
import { useShowStore } from '@/stores/show';
import { useRuntimeStore } from '@/stores/runtime';
import { color, MIN_TAP } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { IconButton, PillButton } from '@/components/ui/Buttons';
import { ActionListEditor } from '@/components/editor/ActionListEditor';
import { sheet } from '@/components/editor/sheet';

/**
 * 動作タブ（SPEC 2.1-1、docs/design 01）：
 * ステップ（追加・複製・並べ替え・削除）→ 各ステップの「押した時」「離した時」「長押し（時間ごと）」の動作リスト。
 * 動作は行をタップで開いて編集（オプション・待ち時間・有効）。リストごとに「順番に実行／同時に実行」。
 */

export const HOLD_STEP_MS = 500;
export const HOLD_MIN_MS = 500;
export const HOLD_MAX_MS = 10000;

export function ActionsEditor({ cell, button, show }: { cell: CellRef; button: ButtonModel; show: Show }) {
  const [stepId, setStepId] = useState<string>(button.steps[0]?.id ?? '');
  const current = useRuntimeStore((s) => s.stepIndex[button.id] ?? 0);
  const step = button.steps.find((s) => s.id === stepId) ?? button.steps[0];
  const mutate = (fn: (b: ButtonModel) => ButtonModel, key?: string) => useShowStore.getState().mutateButton(cell, fn, key);
  const stepMenuRef = useRef<View>(null);
  if (!step) return null;
  const stepIndex = button.steps.indexOf(step);

  return (
    <View>
      {/* ステップ */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, alignItems: 'center' }}
          style={{ flexShrink: 1 }}
        >
          {button.steps.map((s, i) => (
            <PillButton
              key={s.id}
              label={`ステップ ${i + 1}${i === current && button.steps.length > 1 ? ' ●' : ''}`}
              selected={s.id === step.id}
              onPress={() => setStepId(s.id)}
            />
          ))}
        </ScrollView>
        <IconButton
          icon="plus"
          label="ステップを追加"
          onPress={() =>
            mutate((b) => {
              const next = addStep(b);
              const added = next.steps[next.steps.length - 1];
              if (added) setTimeout(() => setStepId(added.id), 0);
              return next;
            })
          }
        />
        {button.steps.length > 1 ? (
          <View ref={stepMenuRef} collapsable={false}>
            <IconButton
              icon="ellipsis"
              label={`ステップ ${stepIndex + 1} の操作`}
              onPress={() =>
                sheet(
                  `ステップ ${stepIndex + 1}`,
                  [
                    ...(stepIndex > 0 ? [{ label: '前へ移動', run: () => mutate((b) => moveStep(b, step.id, -1)) }] : []),
                    ...(stepIndex < button.steps.length - 1
                      ? [{ label: '後ろへ移動', run: () => mutate((b) => moveStep(b, step.id, 1)) }]
                      : []),
                    { label: 'ステップを複製', run: () => mutate((b) => duplicateStep(b, step.id)) },
                    {
                      label: 'ステップを削除',
                      destructive: true,
                      run: () => {
                        mutate((b) => removeStep(b, step.id));
                        setStepId(button.steps[Math.max(0, stepIndex - 1)]?.id ?? '');
                      },
                    },
                  ],
                  stepMenuRef.current,
                )
              }
            />
          </View>
        ) : null}
      </View>

      <ButtonList title="押した時" listRef={{ stepId: step.id, list: 'press' }} button={button} show={show} mutate={mutate} />
      <ButtonList title="離した時" listRef={{ stepId: step.id, list: 'release' }} button={button} show={show} mutate={mutate} />
      {step.holds.map((h) => (
        <HoldEditor key={h.id} hold={h} stepId={step.id} button={button} show={show} mutate={mutate} />
      ))}
      <PillButton
        label="長押しの動作を追加"
        icon="plus"
        onPress={() => mutate((b) => addHold(b, step.id))}
        style={{ alignSelf: 'flex-start' }}
      />
    </View>
  );
}

type Mutate = (fn: (b: ButtonModel) => ButtonModel, key?: string) => void;

function HoldEditor({
  hold,
  stepId,
  button,
  show,
  mutate,
}: {
  hold: HoldGroup;
  stepId: string;
  button: ButtonModel;
  show: Show;
  mutate: Mutate;
}) {
  const sec = (hold.durationMs / 1000).toFixed(1);
  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
          flexWrap: 'wrap',
        }}
      >
        <AppText variant="headline" style={{ flex: 1, minWidth: 120 }}>{`${sec} 秒長押し`}</AppText>
        {hold.durationMs > HOLD_MIN_MS ? (
          <IconButton
            icon="minus"
            label="長押しの時間を短く"
            onPress={() =>
              mutate((b) => updateHold(b, stepId, hold.id, { durationMs: Math.max(HOLD_MIN_MS, hold.durationMs - HOLD_STEP_MS) }))
            }
          />
        ) : null}
        {hold.durationMs < HOLD_MAX_MS ? (
          <IconButton
            icon="plus"
            label="長押しの時間を長く"
            onPress={() =>
              mutate((b) => updateHold(b, stepId, hold.id, { durationMs: Math.min(HOLD_MAX_MS, hold.durationMs + HOLD_STEP_MS) }))
            }
          />
        ) : null}
        <IconButton
          icon="trash"
          label="この長押しを削除"
          tint={color.danger}
          onPress={() => mutate((b) => removeHold(b, stepId, hold.id))}
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: MIN_TAP, marginBottom: 4, paddingHorizontal: 4 }}>
        <AppText variant="subhead" style={{ flex: 1 }}>
          押している間くり返す
        </AppText>
        <Switch
          value={hold.repeat}
          onValueChange={(repeat) => mutate((b) => updateHold(b, stepId, hold.id, { repeat }))}
          accessibilityLabel="押している間くり返す"
        />
      </View>
      <ButtonList title={null} listRef={{ stepId, list: 'hold', holdId: hold.id }} button={button} show={show} mutate={mutate} />
    </View>
  );
}

function ButtonList({
  title,
  listRef,
  button,
  show,
  mutate,
}: {
  title: string | null;
  listRef: ListRef;
  button: ButtonModel;
  show: Show;
  mutate: Mutate;
}) {
  const list = getList(button, listRef);
  if (!list) return null;
  return (
    <ActionListEditor
      title={title}
      list={list}
      show={show}
      delayFromStart={listRef.list === 'hold'}
      onList={(fn, key) => mutate((b) => mapList(b, listRef, fn), key)}
    />
  );
}
