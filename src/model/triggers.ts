import { newId } from './id';
import type { ActionList, FeedbackRule, LocalVariable, Show, Trigger, TriggerEvent } from './types';
import { listAdd, newLocalVariable } from './buttonEdits';

/** トリガー（SPEC 2.1-4）の編集。すべて新しいオブジェクトを返す純粋関数（ストアの mutateShow に渡す） */

export type TriggerEventType = TriggerEvent['type'];

export const EVENT_LABEL: Record<TriggerEventType, string> = {
  buttonPress: 'どれかのボタンを押した',
  buttonRelease: 'どれかのボタンを離した',
  conditionTrue: '条件が成り立った',
  conditionFalse: '条件が成り立たなくなった',
  variableChanged: '変数が変わった',
  interval: '一定の間隔',
  timeOfDay: '決まった時刻',
  appStart: 'アプリを開いた時',
  deviceConnected: '機器に接続した',
  deviceDisconnected: '機器が切れた',
};

export const EVENT_TYPES = Object.keys(EVENT_LABEL) as TriggerEventType[];

export const WEEKDAY_LABEL = ['日', '月', '火', '水', '木', '金', '土'] as const;

export function defaultEvent(type: TriggerEventType, show: Show): TriggerEvent {
  switch (type) {
    case 'variableChanged':
      return { type, variable: '' };
    case 'interval':
      return { type, seconds: 10 };
    case 'timeOfDay':
      return { type, time: '09:00', weekdays: [] };
    case 'deviceConnected':
    case 'deviceDisconnected':
      return { type, deviceId: show.devices[0]?.id ?? '' };
    case 'buttonPress':
    case 'buttonRelease':
    case 'conditionTrue':
    case 'conditionFalse':
      return { type };
    case 'appStart':
      return { type };
  }
}

/** きっかけの要約（一覧に出す） */
export function describeEvent(e: TriggerEvent, show: Show): string {
  switch (e.type) {
    case 'variableChanged':
      return `${e.variable || '（変数未設定）'} が変わった`;
    case 'interval':
      return `${e.seconds} 秒ごと`;
    case 'timeOfDay':
      return e.weekdays.length === 0 || e.weekdays.length === 7
        ? `毎日 ${e.time}`
        : `${[...e.weekdays]
            .sort()
            .map((d) => WEEKDAY_LABEL[d] ?? '')
            .join('・')} ${e.time}`;
    case 'deviceConnected':
    case 'deviceDisconnected': {
      const label = show.devices.find((d) => d.id === e.deviceId)?.label ?? '（機器未設定）';
      return `${label} ${e.type === 'deviceConnected' ? 'に接続した' : 'が切れた'}`;
    }
    default:
      return EVENT_LABEL[e.type];
  }
}

export function describeTrigger(t: Trigger, show: Show): string {
  if (t.events.length === 0) return 'きっかけなし';
  return t.events.map((e) => describeEvent(e, show)).join('、');
}

export function newTrigger(show: Show): Trigger {
  const n = show.triggers.length + 1;
  return {
    id: newId(),
    name: `トリガー ${n}`,
    notes: '',
    enabled: true,
    events: [{ type: 'interval', seconds: 10 }],
    conditions: [],
    actions: { mode: 'sequential', actions: [] },
    localVariables: [],
  };
}

function mapTrigger(s: Show, id: string, fn: (t: Trigger) => Trigger): Show {
  return { ...s, triggers: s.triggers.map((t) => (t.id === id ? fn(t) : t)) };
}

export function addTrigger(s: Show, t: Trigger): Show {
  return { ...s, triggers: [...s.triggers, t] };
}

export function updateTrigger(s: Show, id: string, patch: Partial<Omit<Trigger, 'id'>>): Show {
  return mapTrigger(s, id, (t) => ({ ...t, ...patch }));
}

export function removeTrigger(s: Show, id: string): Show {
  return { ...s, triggers: s.triggers.filter((t) => t.id !== id) };
}

export function duplicateTrigger(s: Show, id: string): Show {
  const i = s.triggers.findIndex((t) => t.id === id);
  const src = s.triggers[i];
  if (!src) return s;
  const copy: Trigger = JSON.parse(JSON.stringify(src)) as Trigger;
  copy.id = newId();
  copy.name = `${src.name} のコピー`;
  copy.actions = { ...copy.actions, actions: copy.actions.actions.map((a) => ({ ...a, id: newId() })) };
  copy.conditions = copy.conditions.map((c) => ({ ...c, id: newId() }));
  copy.localVariables = copy.localVariables.map((v) => ({ ...v, id: newId() }));
  const triggers = [...s.triggers];
  triggers.splice(i + 1, 0, copy);
  return { ...s, triggers };
}

export function moveTrigger(s: Show, id: string, delta: -1 | 1): Show {
  const i = s.triggers.findIndex((t) => t.id === id);
  const to = i + delta;
  if (i < 0 || to < 0 || to >= s.triggers.length) return s;
  const triggers = [...s.triggers];
  const [x] = triggers.splice(i, 1);
  triggers.splice(to, 0, x!);
  return { ...s, triggers };
}

export function setEvent(s: Show, id: string, index: number, e: TriggerEvent): Show {
  return mapTrigger(s, id, (t) => ({ ...t, events: t.events.map((x, i) => (i === index ? e : x)) }));
}

export function addEvent(s: Show, id: string, e: TriggerEvent): Show {
  return mapTrigger(s, id, (t) => ({ ...t, events: [...t.events, e] }));
}

export function removeEvent(s: Show, id: string, index: number): Show {
  return mapTrigger(s, id, (t) => ({ ...t, events: t.events.filter((_, i) => i !== index) }));
}

export function mapConditions(s: Show, id: string, fn: (c: FeedbackRule[]) => FeedbackRule[]): Show {
  return mapTrigger(s, id, (t) => ({ ...t, conditions: fn(t.conditions) }));
}

export function mapActions(s: Show, id: string, fn: (l: ActionList) => ActionList): Show {
  return mapTrigger(s, id, (t) => ({ ...t, actions: fn(t.actions) }));
}

export function mapTriggerVariables(s: Show, id: string, fn: (v: LocalVariable[]) => LocalVariable[]): Show {
  return mapTrigger(s, id, (t) => ({ ...t, localVariables: fn(t.localVariables) }));
}

export function addTriggerVariable(s: Show, id: string): Show {
  return mapTriggerVariables(s, id, (v) => [...v, newLocalVariable(v.map((x) => x.name))]);
}

export { listAdd };
