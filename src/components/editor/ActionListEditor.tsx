import { useRef, useState } from 'react';
import { Pressable, Switch, TextInput, View } from 'react-native';
import { delayLabel, describeAction, deviceLabel, driverIdOf } from '@/engine/describe';
import { getActionDef } from '@/drivers/registry';
import { listAdd, listDuplicate, listMode, listMove, listRemove, listSetOption, listUpdate, newAction } from '@/model/buttonEdits';
import type { ActionList, ActionModel, Show } from '@/model/types';
import { color, MIN_TAP, radius, type as typeStyles } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/Buttons';
import { Symbol } from '@/components/ui/Symbol';
import { OptionField } from './OptionField';
import { pickAction } from './pickers';
import { sheet } from './sheet';

const MODE_LABEL = { sequential: '順番に実行', concurrent: '同時に実行' } as const;

export type OnList = (fn: (l: ActionList) => ActionList, coalesceKey?: string) => void;

/**
 * 動作のリスト（ボタンの押した時・離した時・長押し、トリガーの動作で共通）。
 * 行をタップで開いて編集（オプション・待ち時間・有効・並べ替え・複製・削除）。リストごとに「順番に実行／同時に実行」。
 */
export function ActionListEditor({
  title,
  list,
  show,
  onList,
  delayFromStart,
}: {
  title: string | null;
  list: ActionList;
  show: Show;
  onList: OnList;
  /** true なら待ち時間の説明を常に「送る前に待つ」にする（長押し・トリガー） */
  delayFromStart?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const addRef = useRef<View>(null);
  const modeRef = useRef<View>(null);

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
                  { label: '順番に実行（前の動作が送れてから次へ）', run: () => onList((l) => listMode(l, 'sequential')) },
                  { label: '同時に実行（一斉に始める）', run: () => onList((l) => listMode(l, 'concurrent')) },
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
            show={show}
            open={open === a.id}
            onToggle={() => setOpen(open === a.id ? null : a.id)}
            onList={onList}
            delayFromStart={delayFromStart}
          />
        ))}
        <Pressable
          ref={addRef}
          accessibilityRole="button"
          onPress={() =>
            pickAction(show, addRef.current, (deviceId, def, options) => {
              const action = newAction(deviceId, def.id, options);
              onList((l) => listAdd(l, action));
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
  show,
  open,
  onToggle,
  onList,
  delayFromStart,
}: {
  action: ActionModel;
  index: number;
  count: number;
  show: Show;
  open: boolean;
  onToggle: () => void;
  onList: OnList;
  delayFromStart?: boolean;
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
              onChange={(v) => onList((l) => listSetOption(l, action.id, f.id, v), `${action.id}:${f.id}`)}
            />
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <AppText style={{ flex: 1 }}>{index === 0 || delayFromStart ? '送る前に待つ' : '前の動作の後に待つ'}</AppText>
            <TextInput
              value={String(action.delayMs)}
              onChangeText={(t) => {
                const n = Math.max(0, Math.min(600000, Math.round(Number(t.replace(/[^0-9]/g, '')) || 0)));
                onList((l) => listUpdate(l, action.id, { delayMs: n }), `${action.id}:delay`);
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
              onValueChange={(enabled) => onList((l) => listUpdate(l, action.id, { enabled }))}
              accessibilityLabel="この動作を有効にする"
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            {index > 0 ? <IconButton icon="arrow.up" label="上へ" onPress={() => onList((l) => listMove(l, action.id, -1))} /> : null}
            {index < count - 1 ? (
              <IconButton icon="arrow.down" label="下へ" onPress={() => onList((l) => listMove(l, action.id, 1))} />
            ) : null}
            <IconButton icon="plus.square.on.square" label="複製" onPress={() => onList((l) => listDuplicate(l, action.id))} />
            <View style={{ flex: 1 }} />
            <IconButton icon="trash" label="この動作を削除" tint={color.danger} onPress={() => onList((l) => listRemove(l, action.id))} />
          </View>
        </View>
      ) : null}
    </View>
  );
}
