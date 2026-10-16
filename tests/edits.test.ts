import {
  addAction,
  addFeedback,
  addHold,
  addStep,
  duplicateAction,
  duplicateStep,
  getList,
  moveAction,
  moveFeedback,
  moveStep,
  newAction,
  newFeedback,
  removeAction,
  removeFeedback,
  removeHold,
  removeStep,
  setActionOption,
  setFeedbackOption,
  setFeedbackStyle,
  setListMode,
  updateAction,
  updateHold,
} from '@/model/buttonEdits';
import { newButton, newShow, demoShow } from '@/model/defaults';
import { duplicateDevice, labelError, newDevice, uniqueLabel, usageCount } from '@/model/devices';
import { getDefinition } from '@/drivers/registry';
import { useShowStore } from '@/stores/show';
import { cellKey } from '@/model/grid';
import { filterLogs, LOG_LIMIT, logsToText, useLogStore } from '@/stores/log';

describe('ボタンの編集', () => {
  it('ステップの追加・複製・並べ替え・削除（最後の 1 つは残す）', () => {
    let b = newButton();
    const s1 = b.steps[0]!.id;
    b = addAction(b, { stepId: s1, list: 'press' }, newAction('d', 'x', { a: 1 }));
    b = duplicateStep(b, s1);
    expect(b.steps).toHaveLength(2);
    expect(b.steps[1]!.press.actions[0]!.id).not.toBe(b.steps[0]!.press.actions[0]!.id);
    b = addStep(b);
    const last = b.steps[2]!.id;
    b = moveStep(b, last, -1);
    expect(b.steps[1]!.id).toBe(last);
    b = removeStep(b, last);
    b = removeStep(b, b.steps[1]!.id);
    b = removeStep(b, b.steps[0]!.id);
    expect(b.steps).toHaveLength(1);
  });

  it('動作の追加・変更・並べ替え・複製・削除・実行のしかた', () => {
    let b = newButton();
    const ref = { stepId: b.steps[0]!.id, list: 'release' as const };
    const a1 = newAction('d', 'one', {});
    const a2 = newAction('d', 'two', {});
    b = addAction(addAction(b, ref, a1), ref, a2);
    b = updateAction(b, ref, a1.id, { delayMs: 200, enabled: false });
    b = setActionOption(b, ref, a1.id, 'data', 'X');
    b = moveAction(b, ref, a2.id, -1);
    let l = getList(b, ref)!;
    expect(l.actions.map((a) => a.definitionId)).toEqual(['two', 'one']);
    expect(l.actions[1]).toMatchObject({ delayMs: 200, enabled: false, options: { data: 'X' } });
    b = duplicateAction(b, ref, a2.id);
    b = removeAction(b, ref, a1.id);
    b = setListMode(b, ref, 'concurrent');
    l = getList(b, ref)!;
    expect(l.mode).toBe('concurrent');
    expect(l.actions.map((a) => a.definitionId)).toEqual(['two', 'two']);
    expect(getList(b, { stepId: b.steps[0]!.id, list: 'press' })!.actions).toHaveLength(0);
  });

  it('長押しグループ', () => {
    let b = newButton();
    const sid = b.steps[0]!.id;
    b = addHold(b, sid, 1500);
    const h = b.steps[0]!.holds[0]!;
    b = addAction(b, { stepId: sid, list: 'hold', holdId: h.id }, newAction('d', 'h', {}));
    b = updateHold(b, sid, h.id, { repeat: true, durationMs: 2000 });
    expect(b.steps[0]!.holds[0]).toMatchObject({ repeat: true, durationMs: 2000 });
    expect(getList(b, { stepId: sid, list: 'hold', holdId: h.id })!.actions).toHaveLength(1);
    b = removeHold(b, sid, h.id);
    expect(b.steps[0]!.holds).toHaveLength(0);
  });

  it('状態表示', () => {
    let b = newButton();
    const f1 = newFeedback('d', 'f1', { value: 'a' });
    const f2 = newFeedback('d', 'f2', {});
    b = addFeedback(addFeedback(b, f1), f2);
    b = setFeedbackOption(b, f1.id, 'value', 'b');
    b = setFeedbackStyle(b, f1.id, 'textColor', '#000000');
    b = setFeedbackStyle(b, f1.id, 'backgroundColor', undefined);
    b = moveFeedback(b, f2.id, -1);
    expect(b.feedbacks.map((f) => f.definitionId)).toEqual(['f2', 'f1']);
    expect(b.feedbacks[1]).toMatchObject({ options: { value: 'b' }, style: { textColor: '#000000' } });
    expect(b.feedbacks[1]!.style.backgroundColor).toBeUndefined();
    b = removeFeedback(b, f2.id);
    expect(b.feedbacks).toHaveLength(1);
  });

  it('ストアの mutateButton は取り消せる', () => {
    useShowStore.getState().setShow(newShow('T'));
    const pageId = useShowStore.getState().show!.pages[0]!.id;
    const ref = { pageId, key: cellKey(0, 0) };
    useShowStore.getState().createButton(ref);
    useShowStore.getState().mutateButton(ref, addStep);
    expect(useShowStore.getState().show!.pages[0]!.buttons[ref.key]!.steps).toHaveLength(2);
    useShowStore.getState().undo();
    expect(useShowStore.getState().show!.pages[0]!.buttons[ref.key]!.steps).toHaveLength(1);
  });
});

describe('機器', () => {
  it('名前の規則', () => {
    const devs = demoShow().devices;
    expect(labelError('', devs)).toBe('名前を入れてください');
    expect(labelError('カメラ', devs)).toContain('英数字');
    expect(labelError('internal', devs)).toContain('予約');
    expect(labelError('demo-sw-a', devs)).toContain('同じ名前');
    expect(labelError('DEMO-SW-A', devs, devs[0]!.id)).toBeNull();
    expect(labelError('NEW_1', devs)).toBeNull();
  });
  it('追加・複製で重ならない名前と既定の設定', () => {
    const d1 = newDevice(getDefinition('generic-tcp')!, []);
    expect(d1).toMatchObject({ label: 'TCP-1', driverId: 'generic-tcp', enabled: true, config: { port: 9001, terminator: '\\r\\n' } });
    const d2 = duplicateDevice(d1, [d1]);
    expect(d2.label).toBe('TCP-2');
    expect(d2.id).not.toBe(d1.id);
    expect(uniqueLabel('X', [])).toBe('X-1');
  });
  it('使っているボタンの数', () => {
    const s = demoShow();
    expect(usageCount(s, s.devices[0]!.id)).toBeGreaterThan(10);
    expect(usageCount(s, 'none')).toBe(0);
  });
  it('ストアで追加・変更・削除', () => {
    useShowStore.getState().setShow(newShow('T'));
    const d = newDevice(getDefinition('generic-udp')!, []);
    useShowStore.getState().addDevice(d);
    useShowStore.getState().updateDevice(d.id, { config: { ...d.config, host: '10.0.0.2' } }, 'config:host');
    expect(useShowStore.getState().show!.devices[0]!.config.host).toBe('10.0.0.2');
    useShowStore.getState().deleteDevice(d.id);
    expect(useShowStore.getState().show!.devices).toHaveLength(0);
  });
});

describe('ログ', () => {
  it('上限・絞り込み・書き出し', () => {
    const st = useLogStore.getState();
    st.clear();
    for (let i = 0; i < LOG_LIMIT + 5; i++) st.add('debug', 'X', `m${i}`);
    st.add('error', 'DEV', 'bad', 'dev1');
    const all = useLogStore.getState().entries;
    expect(all).toHaveLength(LOG_LIMIT);
    expect(filterLogs(all, 'warn')).toHaveLength(1);
    expect(filterLogs(all, 'debug', 'dev1')).toHaveLength(1);
    expect(logsToText(filterLogs(all, 'error'))).toMatch(/\[エラー\] DEV: bad$/);
  });
});
