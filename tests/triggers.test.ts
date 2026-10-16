import { demoShow, newButton, newShow } from '@/model/defaults';
import { cellKey } from '@/model/grid';
import type { ActionModel, Show, Trigger } from '@/model/types';
import { TriggerEngine, triggerLocals, RATE_LIMIT } from '@/engine/triggers';
import { runAction, initDevices } from '@/engine/executor';
import { deviceManager } from '@/engine/devices';
import '@/engine/press';
import { useRuntimeStore } from '@/stores/runtime';
import { useShowStore } from '@/stores/show';
import { useLogStore } from '@/stores/log';
import { currentContext, resolveText, NA } from '@/variables/resolve';
import {
  addCustomVariable,
  addExpressionVariable,
  persistedValues,
  updateCustomVariable,
  updateExpressionVariable,
} from '@/model/variables';
import {
  addEvent,
  addTrigger,
  describeTrigger,
  duplicateTrigger,
  moveTrigger,
  newTrigger,
  removeEvent,
  removeTrigger,
  setEvent,
  updateTrigger,
} from '@/model/triggers';
import { newId } from '@/model/id';
import { DEMO_DEVICE_IDS } from '@/model/defaults';

function act(deviceId: string, definitionId: string, options: ActionModel['options']): ActionModel {
  return { id: newId(), deviceId, definitionId, options, delayMs: 0, enabled: true };
}

function baseShow(): Show {
  let s = demoShow();
  s = addCustomVariable(s);
  s = updateCustomVariable(s, s.customVariables[0]!.id, { name: 'count', defaultValue: '0', persist: true });
  s = addExpressionVariable(s);
  s = updateExpressionVariable(s, s.expressionVariables[0]!.id, { name: 'double', expression: '$(custom:count) * 2' });
  return s;
}

function reset(show: Show) {
  deviceManager.stopAll();
  useRuntimeStore.setState({
    deviceStatus: {},
    deviceError: {},
    deviceValues: {},
    press: {},
    stepIndex: {},
    pageNumber: 1,
    locked: false,
    customValues: {},
  });
  useShowStore.getState().setShow(show);
  initDevices(show);
}

function trig(over: Partial<Trigger>): Trigger {
  return { ...newTrigger(newShow('x')), events: [], ...over };
}

describe('変数', () => {
  it('自分で作る・式・ボタン変数・内部', () => {
    const show = baseShow();
    reset(show);
    const ctx = () => currentContext(show);
    expect(resolveText('$(custom:count) / $(expression:double)', ctx())).toBe('0 / 0');
    useRuntimeStore.getState().setCustomValue('count', '4');
    expect(resolveText('$(expression:double)', ctx())).toBe('8');
    const b = newButton({ localVariables: [{ id: 'v', name: 'x', kind: 'expression', value: '$(custom:count) + 1' }] });
    expect(resolveText('$(this:x)', currentContext(show, b))).toBe('5');
    expect(resolveText('$(internal:page_count) $(internal:DEMO-REC_status)', ctx())).toBe('3 reconnecting');
    expect(resolveText('$(custom:none) $(expression:none)', ctx())).toBe(`${NA} ${NA}`);
    expect(persistedValues(show, { count: '4', other: '1' })).toEqual({ count: '4' });
  });
  it('式の変数が自分を参照しても止まる', () => {
    let s = baseShow();
    s = updateExpressionVariable(s, s.expressionVariables[0]!.id, { expression: '$(expression:double) + 1' });
    reset(s);
    expect(resolveText('$(expression:double)', currentContext(s))).toBe(NA);
  });
});

describe('内部の動作', () => {
  it('変数に値・式を入れる', async () => {
    const show = baseShow();
    reset(show);
    await runAction(act('internal', 'internal.setVar', { name: 'count', mode: 'value', value: '7' }), show);
    expect(useRuntimeStore.getState().customValues.count).toBe('7');
    await runAction(act('internal', 'internal.setVar', { name: 'count', mode: 'expression', value: '$(custom:count) + 1' }), show);
    expect(useRuntimeStore.getState().customValues.count).toBe('8');
    expect((await runAction(act('internal', 'internal.setVar', { name: 'nope', mode: 'value', value: '1' }), show)).ok).toBe(false);
    expect((await runAction(act('internal', 'internal.setVar', { name: 'count', mode: 'expression', value: '1 +' }), show)).ok).toBe(false);
  });
  it('別のボタンを押す', async () => {
    const show = baseShow();
    reset(show);
    // ページ 1 の 1 行 1 列 = PGM CAM 1
    const r = await runAction(act('internal', 'internal.press', { page: 1, row: 1, col: 1, how: 'click' }), show);
    expect(r.ok).toBe(true);
    expect(useRuntimeStore.getState().deviceValues[DEMO_DEVICE_IDS.sw]?.pgm).toBe('CAM 1');
    expect((await runAction(act('internal', 'internal.press', { page: 1, row: 4, col: 5 }), show)).ok).toBe(false);
  });
  it('待つ', async () => {
    jest.useFakeTimers();
    const show = baseShow();
    reset(show);
    let done = false;
    void runAction(act('internal', 'internal.wait', { ms: 500 }), show).then(() => (done = true));
    await jest.advanceTimersByTimeAsync(499);
    expect(done).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    jest.useRealTimers();
  });
});

describe('トリガー', () => {
  let engine: TriggerEngine;
  let now: Date;
  beforeEach(() => {
    jest.useFakeTimers();
    now = new Date(2026, 9, 17, 8, 59, 50);
    jest.setSystemTime(now);
    engine = new TriggerEngine(() => new Date());
  });
  afterEach(() => {
    engine.stop();
    jest.useRealTimers();
  });

  const setVar = (v: string) => act('internal', 'internal.setVar', { name: 'count', mode: 'expression', value: v });

  it('一定間隔', async () => {
    let show = baseShow();
    show = addTrigger(
      show,
      trig({ events: [{ type: 'interval', seconds: 2 }], actions: { mode: 'sequential', actions: [setVar('$(custom:count) + 1')] } }),
    );
    reset(show);
    engine.start(show);
    await jest.advanceTimersByTimeAsync(6100);
    expect(useRuntimeStore.getState().customValues.count).toBe('3');
  });

  it('時刻（同じ分は 1 回）と曜日', async () => {
    let show = baseShow();
    show = addTrigger(
      show,
      trig({
        events: [{ type: 'timeOfDay', time: '09:00', weekdays: [] }],
        actions: { mode: 'sequential', actions: [setVar('$(custom:count) + 1')] },
      }),
    );
    show = addTrigger(
      show,
      trig({
        name: 'sun',
        events: [{ type: 'timeOfDay', time: '09:00', weekdays: [0] }],
        actions: { mode: 'sequential', actions: [setVar('100')] },
      }),
    );
    reset(show);
    engine.start(show);
    await jest.advanceTimersByTimeAsync(70000);
    // 2026-10-17 は土曜なので日曜のトリガーは動かない
    expect(useRuntimeStore.getState().customValues.count).toBe('1');
  });

  it('変数が変わった・条件の変化・条件で止める', async () => {
    let show = baseShow();
    show = addTrigger(
      show,
      trig({
        events: [{ type: 'variableChanged', variable: '$(DEMO-SW-A:pgm)' }],
        actions: { mode: 'sequential', actions: [act('internal', 'internal.log', { text: 'pgm=$(DEMO-SW-A:pgm)' })] },
      }),
    );
    show = addTrigger(
      show,
      trig({
        name: 'edge',
        events: [{ type: 'conditionTrue' }],
        conditions: [
          {
            id: 'c',
            deviceId: DEMO_DEVICE_IDS.sw,
            definitionId: 'demo.equals',
            options: { key: 'pgm', value: 'CAM 4' },
            invert: false,
            style: {},
            enabled: true,
          },
        ],
        actions: { mode: 'sequential', actions: [setVar('42')] },
      }),
    );
    reset(show);
    useLogStore.getState().clear();
    engine.start(show);
    useRuntimeStore.getState().setDeviceValue(DEMO_DEVICE_IDS.sw, 'pgm', 'CAM 3');
    await jest.advanceTimersByTimeAsync(10);
    expect(useLogStore.getState().entries.some((e) => e.message === 'pgm=CAM 3')).toBe(true);
    expect(useRuntimeStore.getState().customValues.count).toBeUndefined();
    useRuntimeStore.getState().setDeviceValue(DEMO_DEVICE_IDS.sw, 'pgm', 'CAM 4');
    await jest.advanceTimersByTimeAsync(10);
    expect(useRuntimeStore.getState().customValues.count).toBe('42');
  });

  it('機器が切れた・接続した、アプリを開いた時', async () => {
    let show = baseShow();
    show = addTrigger(
      show,
      trig({
        events: [{ type: 'deviceDisconnected', deviceId: DEMO_DEVICE_IDS.mixer }],
        actions: { mode: 'sequential', actions: [setVar('-1')] },
      }),
    );
    show = addTrigger(
      show,
      trig({
        events: [{ type: 'deviceConnected', deviceId: DEMO_DEVICE_IDS.mixer }],
        actions: { mode: 'sequential', actions: [setVar('1')] },
      }),
    );
    show = addTrigger(
      show,
      trig({ events: [{ type: 'appStart' }], actions: { mode: 'sequential', actions: [act('internal', 'internal.page', { page: 2 })] } }),
    );
    reset(show);
    engine.start(show);
    await jest.advanceTimersByTimeAsync(10);
    expect(useRuntimeStore.getState().pageNumber).toBe(2);
    useRuntimeStore.getState().setDeviceStatus(DEMO_DEVICE_IDS.mixer, 'reconnecting');
    await jest.advanceTimersByTimeAsync(10);
    expect(useRuntimeStore.getState().customValues.count).toBe('-1');
    useRuntimeStore.getState().setDeviceStatus(DEMO_DEVICE_IDS.mixer, 'connected');
    await jest.advanceTimersByTimeAsync(10);
    expect(useRuntimeStore.getState().customValues.count).toBe('1');
  });

  it('ボタンを押した時・トリガー変数・暴走の停止', async () => {
    let show = baseShow();
    show = addTrigger(
      show,
      trig({
        events: [{ type: 'buttonPress' }],
        localVariables: [{ id: 'l', name: 'msg', kind: 'value', value: 'pressed $(this:button)' }],
        actions: { mode: 'sequential', actions: [act('internal', 'internal.log', { text: '$(this:msg)' })] },
      }),
    );
    reset(show);
    useLogStore.getState().clear();
    engine.start(show);
    const b = show.pages[0]!.buttons[cellKey(0, 0)]!;
    engine.notifyButton('press', b.name);
    await jest.advanceTimersByTimeAsync(10);
    expect(useLogStore.getState().entries.some((e) => e.message === `pressed ${b.name}`)).toBe(true);
    for (let i = 0; i < RATE_LIMIT + 5; i++) engine.notifyButton('press', 'x');
    await jest.advanceTimersByTimeAsync(10);
    expect(useLogStore.getState().entries.some((e) => e.level === 'warn' && e.message.includes('超えた'))).toBe(true);
  });

  it('トリガー変数は順に計算', () => {
    const show = baseShow();
    reset(show);
    const l = triggerLocals(
      [
        { id: 'a', name: 'a', kind: 'value', value: '2' },
        { id: 'b', name: 'b', kind: 'expression', value: '$(this:a) * 10' },
      ],
      currentContext(show),
      {},
    );
    expect(l).toEqual({ a: '2', b: '20' });
  });

  it('編集の関数', () => {
    let s = newShow('T');
    const t = newTrigger(s);
    s = addTrigger(s, t);
    s = addEvent(s, t.id, { type: 'timeOfDay', time: '18:30', weekdays: [1, 3] });
    s = setEvent(s, t.id, 0, { type: 'interval', seconds: 5 });
    expect(describeTrigger(s.triggers[0]!, s)).toBe('5 秒ごと、月・水 18:30');
    s = removeEvent(s, t.id, 0);
    s = updateTrigger(s, t.id, { name: 'A' });
    s = duplicateTrigger(s, t.id);
    expect(s.triggers.map((x) => x.name)).toEqual(['A', 'A のコピー']);
    s = moveTrigger(s, s.triggers[1]!.id, -1);
    expect(s.triggers[0]!.name).toBe('A のコピー');
    s = removeTrigger(s, s.triggers[0]!.id);
    expect(s.triggers).toHaveLength(1);
  });
});
