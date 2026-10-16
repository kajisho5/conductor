import { useRef, useState } from 'react';
import { ActionSheetIOS, Platform, Pressable, ScrollView, Switch, TextInput, View, findNodeHandle } from 'react-native';
import { delayLabel, describeAction, deviceLabel, driverIdOf } from '@/engine/describe';
import { getActionDef } from '@/drivers/registry';
import {
  addAction,
  addHold,
  addStep,
  duplicateAction,
  duplicateStep,
  getList,
  moveAction,
  moveStep,
  newAction,
  removeAction,
  removeHold,
  removeStep,
  setActionOption,
  setListMode,
  updateAction,
  updateHold,
  type ListRef,
} from '@/model/buttonEdits';
import type { ActionModel, ButtonModel, HoldGroup, Show } from '@/model/types';
import type { CellRef } from '@/stores/show';
import { useShowStore } from '@/stores/show';
import { useRuntimeStore } from '@/stores/runtime';
import { color, MIN_TAP, radius, type as typeStyles } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { IconButton, PillButton } from '@/components/ui/Buttons';
import { Symbol } from '@/components/ui/Symbol';
import { OptionField } from '@/components/editor/OptionField';
import { pickAction } from '@/components/editor/pickers';

/**
 * 動作タブ（SPEC 2.1-1、docs/design 01）：
 * ステップ（追加・複製・並べ替え・削除）→ 各ステップの「押した時」「離した時」「長押し（時間ごと）」の動作リスト。
 * 動作は行をタップで開いて編集（オプション・待ち時間・有効）。リストごとに「順番に実行／同時に実行」。
 */

const MODE_LABEL = { sequential: '順番に実行', concurrent: '同時に実行' } as const;
export const HOLD_STEP_MS = 500;
export const HOLD_MIN_MS = 500;
export const HOLD_MAX_MS = 10000;

function sheet(title: string | undefined, items: { label: string; run: () => void; destructive?: boolean }[], anchor: View | null) {
  if (Platform.OS !== 'ios') return;
  const options = [...items.map((i) => i.label), 'キャンセル'];
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title,
      options,
      cancelButtonIndex: options.length - 1,
      destructiveButtonIndex: items.findIndex((i) => i.destructive),
      anchor: anchor ? (findNodeHandle(anchor) ?? undefined) : undefined,
    },
    (i) => items[i]?.run(),
  );
}

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
          <View ref={stepMenuRef}>
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

      <ListEditor title="押した時" listRef={{ stepId: step.id, list: 'press' }} button={button} show={show} mutate={mutate} />
      <ListEditor title="離した時" listRef={{ stepId: step.id, list: 'release' }} button={button} show={show} mutate={mutate} />
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
      <ListEditor title={null} listRef={{ stepId, list: 'hold', holdId: hold.id }} button={button} show={show} mutate={mutate} />
    </View>
  );
}

function ListEditor({
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
  const [open, setOpen] = useState<string | null>(null);
  const addRef = useRef<View>(null);
  const modeRef = useRef<View>(null);
  if (!list) return null;

  return (
    <View style={{ marginBottom: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, marginHorizontal: 4, minHeight: 28 }}>
        {title ? (
          <AppText variant="footnote" tone="label2" style={{ flex: 1 }}>
            {title}
          </AppText>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {list.actions.length > 1 ? (
          <Pressable
            ref={modeRef}
            accessibilityRole="button"
            accessibilityLabel={`実行のしかた、${MODE_LABEL[list.mode]}`}
            hitSlop={{ top: 8, bottom: 8 }}
            onPress={() =>
              sheet(
                '実行のしかた',
                [
                  { label: '順番に実行（前の動作が送れてから次へ）', run: () => mutate((b) => setListMode(b, listRef, 'sequential')) },
                  { label: '同時に実行（一斉に始める）', run: () => mutate((b) => setListMode(b, listRef, 'concurrent')) },
                ],
                modeRef.current,
              )
            }
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28 }}
          >
            <AppText variant="footnote" weight="600" tone="accent">
              {MODE_LABEL[list.mode]}
            </AppText>
            <Symbol name="chevron.down" size={11} tint={color.accent} weight="bold" />
          </Pressable>
        ) : null}
      </View>
      <View style={{ backgroundColor: color.card, borderRadius: radius.card, overflow: 'hidden' }}>
        {list.actions.map((a, i) => (
          <ActionRow
            key={a.id}
            action={a}
            index={i}
            count={list.actions.length}
            listRef={listRef}
            show={show}
            open={open === a.id}
            onToggle={() => setOpen(open === a.id ? null : a.id)}
            mutate={mutate}
          />
        ))}
        <Pressable
          ref={addRef}
          accessibilityRole="button"
          onPress={() =>
            pickAction(show, addRef.current, (deviceId, def, options) => {
              const action = newAction(deviceId, def.id, options);
              mutate((b) => addAction(b, listRef, action));
              setOpen(action.id);
            })
          }
          style={({ pressed }) => ({
            minHeight: MIN_TAP,
            justifyContent: 'center',
            paddingHorizontal: 16,
            backgroundColor: pressed ? color.fill : 'transparent',
          })}
        >
          <AppText tone="accent">＋ 動作を追加</AppText>
        </Pressable>
      </View>
    </View>
  );
}

function ActionRow({
  action,
  index,
  count,
  listRef,
  show,
  open,
  onToggle,
  mutate,
}: {
  action: ActionModel;
  index: number;
  count: number;
  listRef: ListRef;
  show: Show;
  open: boolean;
  onToggle: () => void;
  mutate: Mutate;
}) {
  const d = describeAction(action, show);
  const def = getActionDef(driverIdOf(show, action.deviceId), action.definitionId);
  const delay = delayLabel(action.delayMs);
  return (
    <View style={{ borderBottomWidth: 0.5, borderBottomColor: color.sep }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${deviceLabel(show, action.deviceId)}、${d.title}、${d.detail}${action.enabled ? '' : '、無効'}`}
        style={({ pressed }) => ({
          minHeight: 60,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
          paddingVertical: 8,
          gap: 10,
          backgroundColor: pressed ? color.fill : 'transparent',
          opacity: action.enabled ? 1 : 0.5,
        })}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: color.fill }}>
              <AppText variant="caption" weight="600" numberOfLines={1}>
                {deviceLabel(show, action.deviceId)}
              </AppText>
            </View>
            <AppText weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>
              {d.title}
            </AppText>
          </View>
          {d.detail || delay ? (
            <AppText variant="footnote" tone="label2" numberOfLines={1} mono>
              {[delay, d.detail].filter(Boolean).join('　')}
            </AppText>
          ) : null}
        </View>
        <Symbol name={open ? 'chevron.up' : 'chevron.down'} size={13} tint={color.label3} weight="semibold" />
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
          {(def?.options ?? []).map((f) => (
            <OptionField
              key={f.id}
              field={f}
              value={action.options[f.id]}
              card={color.fill4}
              onChange={(v) => mutate((b) => setActionOption(b, listRef, action.id, f.id, v), `${action.id}:${f.id}`)}
            />
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <AppText style={{ flex: 1 }}>{index === 0 || listRef.list === 'hold' ? '送る前に待つ' : '前の動作の後に待つ'}</AppText>
            <TextInput
              value={String(action.delayMs)}
              onChangeText={(t) => {
                const n = Math.max(0, Math.min(600000, Math.round(Number(t.replace(/[^0-9]/g, '')) || 0)));
                mutate((b) => updateAction(b, listRef, action.id, { delayMs: n }), `${action.id}:delay`);
              }}
              keyboardType="number-pad"
              accessibilityLabel="待ち時間（ミリ秒）"
              style={[
                typeStyles.body,
                {
                  minWidth: 88,
                  minHeight: MIN_TAP,
                  textAlign: 'right',
                  color: color.label,
                  backgroundColor: color.fill4,
                  borderRadius: radius.field,
                  paddingHorizontal: 12,
                  fontVariant: ['tabular-nums'],
                },
              ]}
            />
            <AppText tone="label2">ms</AppText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: MIN_TAP, marginBottom: 8 }}>
            <AppText style={{ flex: 1 }}>有効</AppText>
            <Switch
              value={action.enabled}
              onValueChange={(enabled) => mutate((b) => updateAction(b, listRef, action.id, { enabled }))}
              accessibilityLabel="この動作を有効にする"
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            {index > 0 ? (
              <IconButton icon="arrow.up" label="上へ" onPress={() => mutate((b) => moveAction(b, listRef, action.id, -1))} />
            ) : null}
            {index < count - 1 ? (
              <IconButton icon="arrow.down" label="下へ" onPress={() => mutate((b) => moveAction(b, listRef, action.id, 1))} />
            ) : null}
            <IconButton icon="plus.square.on.square" label="複製" onPress={() => mutate((b) => duplicateAction(b, listRef, action.id))} />
            <View style={{ flex: 1 }} />
            <IconButton
              icon="trash"
              label="この動作を削除"
              tint={color.danger}
              onPress={() => mutate((b) => removeAction(b, listRef, action.id))}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}
