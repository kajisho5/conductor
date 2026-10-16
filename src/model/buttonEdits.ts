import { emptyStep } from './defaults';
import { newId } from './id';
import type { ActionList, ActionModel, ButtonModel, FeedbackRule, HoldGroup, Step } from './types';

/**
 * ボタンの動作・状態表示の編集（SPEC 2.1-1）。すべて新しいオブジェクトを返す純粋関数。
 * ストアの mutateButton に渡して使う。
 */

/** どのリストか：押した時／離した時／長押し（グループ ID） */
export type ListRef = { stepId: string; list: 'press' | 'release' } | { stepId: string; list: 'hold'; holdId: string };

export const DEFAULT_HOLD_MS = 1000;

function mapStep(b: ButtonModel, stepId: string, fn: (s: Step) => Step): ButtonModel {
  return { ...b, steps: b.steps.map((s) => (s.id === stepId ? fn(s) : s)) };
}

function mapList(b: ButtonModel, ref: ListRef, fn: (l: ActionList) => ActionList): ButtonModel {
  return mapStep(b, ref.stepId, (s) => {
    if (ref.list === 'hold') {
      const holdId = ref.holdId;
      return { ...s, holds: s.holds.map((h) => (h.id === holdId ? { ...h, actions: fn(h.actions) } : h)) };
    }
    return ref.list === 'press' ? { ...s, press: fn(s.press) } : { ...s, release: fn(s.release) };
  });
}

function move<T>(arr: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || to < 0 || to >= arr.length) return arr;
  const out = [...arr];
  const [x] = out.splice(index, 1);
  out.splice(to, 0, x as T);
  return out;
}

export function getList(b: ButtonModel, ref: ListRef): ActionList | undefined {
  const s = b.steps.find((x) => x.id === ref.stepId);
  if (!s) return undefined;
  if (ref.list === 'hold') {
    const holdId = ref.holdId;
    return s.holds.find((h) => h.id === holdId)?.actions;
  }
  return ref.list === 'press' ? s.press : s.release;
}

/* ---------- ステップ ---------- */

export function addStep(b: ButtonModel): ButtonModel {
  return { ...b, steps: [...b.steps, emptyStep()] };
}

function cloneActions(l: ActionList): ActionList {
  return { ...l, actions: l.actions.map((a) => ({ ...a, id: newId(), options: { ...a.options } })) };
}

export function duplicateStep(b: ButtonModel, stepId: string): ButtonModel {
  const i = b.steps.findIndex((s) => s.id === stepId);
  const src = b.steps[i];
  if (!src) return b;
  const copy: Step = {
    ...src,
    id: newId(),
    press: cloneActions(src.press),
    release: cloneActions(src.release),
    holds: src.holds.map((h) => ({ ...h, id: newId(), actions: cloneActions(h.actions) })),
  };
  const steps = [...b.steps];
  steps.splice(i + 1, 0, copy);
  return { ...b, steps };
}

/** 最後の 1 つは消さない */
export function removeStep(b: ButtonModel, stepId: string): ButtonModel {
  if (b.steps.length <= 1) return b;
  return { ...b, steps: b.steps.filter((s) => s.id !== stepId) };
}

export function moveStep(b: ButtonModel, stepId: string, delta: -1 | 1): ButtonModel {
  return {
    ...b,
    steps: move(
      b.steps,
      b.steps.findIndex((s) => s.id === stepId),
      delta,
    ),
  };
}

/* ---------- 動作 ---------- */

export function newAction(deviceId: string, definitionId: string, options: ActionModel['options']): ActionModel {
  return { id: newId(), deviceId, definitionId, options, delayMs: 0, enabled: true };
}

export function addAction(b: ButtonModel, ref: ListRef, action: ActionModel): ButtonModel {
  return mapList(b, ref, (l) => ({ ...l, actions: [...l.actions, action] }));
}

export function updateAction(b: ButtonModel, ref: ListRef, actionId: string, patch: Partial<Omit<ActionModel, 'id'>>): ButtonModel {
  return mapList(b, ref, (l) => ({ ...l, actions: l.actions.map((a) => (a.id === actionId ? { ...a, ...patch } : a)) }));
}

export function setActionOption(
  b: ButtonModel,
  ref: ListRef,
  actionId: string,
  key: string,
  value: ActionModel['options'][string],
): ButtonModel {
  return mapList(b, ref, (l) => ({
    ...l,
    actions: l.actions.map((a) => (a.id === actionId ? { ...a, options: { ...a.options, [key]: value } } : a)),
  }));
}

export function removeAction(b: ButtonModel, ref: ListRef, actionId: string): ButtonModel {
  return mapList(b, ref, (l) => ({ ...l, actions: l.actions.filter((a) => a.id !== actionId) }));
}

export function duplicateAction(b: ButtonModel, ref: ListRef, actionId: string): ButtonModel {
  return mapList(b, ref, (l) => {
    const i = l.actions.findIndex((a) => a.id === actionId);
    const src = l.actions[i];
    if (!src) return l;
    const actions = [...l.actions];
    actions.splice(i + 1, 0, { ...src, id: newId(), options: { ...src.options } });
    return { ...l, actions };
  });
}

export function moveAction(b: ButtonModel, ref: ListRef, actionId: string, delta: -1 | 1): ButtonModel {
  return mapList(b, ref, (l) => ({
    ...l,
    actions: move(
      l.actions,
      l.actions.findIndex((a) => a.id === actionId),
      delta,
    ),
  }));
}

export function setListMode(b: ButtonModel, ref: ListRef, mode: ActionList['mode']): ButtonModel {
  return mapList(b, ref, (l) => ({ ...l, mode }));
}

/* ---------- 長押し ---------- */

export function addHold(b: ButtonModel, stepId: string, durationMs = DEFAULT_HOLD_MS): ButtonModel {
  const h: HoldGroup = { id: newId(), durationMs, repeat: false, actions: { mode: 'sequential', actions: [] } };
  return mapStep(b, stepId, (s) => ({ ...s, holds: [...s.holds, h] }));
}

export function updateHold(
  b: ButtonModel,
  stepId: string,
  holdId: string,
  patch: Partial<Pick<HoldGroup, 'durationMs' | 'repeat'>>,
): ButtonModel {
  return mapStep(b, stepId, (s) => ({ ...s, holds: s.holds.map((h) => (h.id === holdId ? { ...h, ...patch } : h)) }));
}

export function removeHold(b: ButtonModel, stepId: string, holdId: string): ButtonModel {
  return mapStep(b, stepId, (s) => ({ ...s, holds: s.holds.filter((h) => h.id !== holdId) }));
}

/* ---------- 状態表示 ---------- */

export function newFeedback(deviceId: string, definitionId: string, options: FeedbackRule['options']): FeedbackRule {
  return { id: newId(), deviceId, definitionId, options, invert: false, style: { backgroundColor: '#E0302B' }, enabled: true };
}

export function addFeedback(b: ButtonModel, fb: FeedbackRule): ButtonModel {
  return { ...b, feedbacks: [...b.feedbacks, fb] };
}

export function updateFeedback(b: ButtonModel, id: string, patch: Partial<Omit<FeedbackRule, 'id'>>): ButtonModel {
  return { ...b, feedbacks: b.feedbacks.map((f) => (f.id === id ? { ...f, ...patch } : f)) };
}

export function setFeedbackOption(b: ButtonModel, id: string, key: string, value: FeedbackRule['options'][string]): ButtonModel {
  return { ...b, feedbacks: b.feedbacks.map((f) => (f.id === id ? { ...f, options: { ...f.options, [key]: value } } : f)) };
}

/** 上書きする見た目。undefined を渡すと「変えない」に戻す */
export function setFeedbackStyle(
  b: ButtonModel,
  id: string,
  key: 'text' | 'textColor' | 'backgroundColor',
  value: string | undefined,
): ButtonModel {
  return {
    ...b,
    feedbacks: b.feedbacks.map((f) => {
      if (f.id !== id) return f;
      const style = { ...f.style };
      if (value === undefined) delete style[key];
      else style[key] = value;
      return { ...f, style };
    }),
  };
}

export function removeFeedback(b: ButtonModel, id: string): ButtonModel {
  return { ...b, feedbacks: b.feedbacks.filter((f) => f.id !== id) };
}

export function moveFeedback(b: ButtonModel, id: string, delta: -1 | 1): ButtonModel {
  return {
    ...b,
    feedbacks: move(
      b.feedbacks,
      b.feedbacks.findIndex((f) => f.id === id),
      delta,
    ),
  };
}
