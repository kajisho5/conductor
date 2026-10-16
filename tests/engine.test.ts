import { DEMO_DEVICE_IDS, demoShow, newButton } from '@/model/defaults';
import { cellKey } from '@/model/grid';
import type { ActionModel, ButtonModel, Show } from '@/model/types';
import { deviceManager } from '@/engine/devices';
import { initDevices, resolveStyle, runAction, runList, stopButton } from '@/engine/executor';
import { pressDown, pressUp, testPress } from '@/engine/press';
import { checkDemoFeedback, runDemoAction } from '@/engine/demoDriver';
import { describeAction } from '@/engine/describe';
import { useRuntimeStore } from '@/stores/runtime';
import { NA, resolveText } from '@/variables/resolve';

function act(deviceId: string, definitionId: string, options: ActionModel['options'], delayMs = 0): ActionModel {
  return { id: definitionId + Math.random(), deviceId, definitionId, options, delayMs, enabled: true };
}

function freshRuntime(show: Show) {
  deviceManager.stopAll();
  useRuntimeStore.setState({ deviceStatus: {}, deviceError: {}, deviceValues: {}, press: {}, stepIndex: {}, pageNumber: 1, locked: false });
  initDevices(show);
}

function btn(press: ActionModel[], extra?: Partial<ButtonModel>): ButtonModel {
  const b = newButton(extra);
  b.steps[0]!.press.actions = press;
  return b;
}

describe('デモドライバ', () => {
  it('set / swap / toggle / equals', () => {
    const m = new Map<string, string>();
    const ctx = { get: (k: string) => m.get(k), set: (k: string, v: string) => void m.set(k, v) };
    runDemoAction('demo.set', { key: 'pgm', value: 'CAM 1' }, ctx);
    runDemoAction('demo.set', { key: 'pst', value: 'CAM 2' }, ctx);
    runDemoAction('demo.swap', { a: 'pgm', b: 'pst' }, ctx);
    expect(m.get('pgm')).toBe('CAM 2');
    runDemoAction('demo.toggle', { key: 'ftb' }, ctx);
    expect(m.get('ftb')).toBe('ON');
    expect(checkDemoFeedback('demo.equals', { key: 'pgm', value: 'CAM 2' }, ctx)).toBe(true);
    expect(runDemoAction('demo.unknown', {}, ctx).ok).toBe(false);
  });
});

describe('実行', () => {
  let show: Show;
  beforeEach(() => {
    show = demoShow();
    freshRuntime(show);
  });

  it('接続していない機器・無効の機器は送れない', async () => {
    expect((await runAction(act(DEMO_DEVICE_IDS.rec, 'demo.toggle', { key: 'rec' }), show)).ok).toBe(false);
    expect((await runAction(act(DEMO_DEVICE_IDS.http, 'demo.toggle', { key: 'x' }), show)).ok).toBe(false);
    expect((await runAction(act('nope', 'demo.toggle', { key: 'x' }), show)).ok).toBe(false);
    expect((await runAction(act(DEMO_DEVICE_IDS.sw, 'demo.toggle', { key: 'x' }), show)).ok).toBe(true);
    expect((await runAction(act(DEMO_DEVICE_IDS.sw, 'demo.unknown', {}), show)).ok).toBe(false);
  });

  it('文字のオプションの変数は送る前に解決する', async () => {
    useRuntimeStore.getState().setDeviceValue(DEMO_DEVICE_IDS.sw, 'pgm', 'CAM 3');
    await runAction(act(DEMO_DEVICE_IDS.mixer, 'demo.set', { key: 'from_sw', value: '$(DEMO-SW-A:pgm)' }), show);
    expect(useRuntimeStore.getState().deviceValues[DEMO_DEVICE_IDS.mixer]?.from_sw).toBe('CAM 3');
  });

  it('内部の動作：ステップ・ロック', async () => {
    const b = btn([]);
    b.steps.push({ ...b.steps[0]!, id: 's2' }, { ...b.steps[0]!, id: 's3' });
    await runAction(act('internal', 'internal.step', { step: 3 }), show, b);
    expect(useRuntimeStore.getState().stepIndex[b.id]).toBe(2);
    await runAction(act('internal', 'internal.step', { step: 'next' }), show, b);
    expect(useRuntimeStore.getState().stepIndex[b.id]).toBe(0);
    expect((await runAction(act('internal', 'internal.step', { step: 9 }), show, b)).ok).toBe(false);
    await runAction(act('internal', 'internal.lock', { lock: 'lock' }), show);
    expect(useRuntimeStore.getState().locked).toBe(true);
    await runAction(act('internal', 'internal.lock', { lock: 'unlock' }), show);
    expect(useRuntimeStore.getState().locked).toBe(false);
  });

  it('ページ移動（番号・次・前）', async () => {
    await runAction(act('internal', 'internal.page', { page: 3 }), show);
    expect(useRuntimeStore.getState().pageNumber).toBe(3);
    await runAction(act('internal', 'internal.page', { page: 'next' }), show);
    expect(useRuntimeStore.getState().pageNumber).toBe(1);
    await runAction(act('internal', 'internal.page', { page: 'prev' }), show);
    expect(useRuntimeStore.getState().pageNumber).toBe(3);
    expect((await runAction(act('internal', 'internal.page', { page: 9 }), show)).ok).toBe(false);
  });

  it('順番に実行は待ち時間を順に足す、同時に実行は並ぶ', async () => {
    jest.useFakeTimers();
    const order: string[] = [];
    useRuntimeStore.subscribe((s, p) => {
      const v = s.deviceValues[DEMO_DEVICE_IDS.sw];
      const pv = p.deviceValues[DEMO_DEVICE_IDS.sw];
      if (v?.k !== pv?.k && v?.k) order.push(v.k);
    });
    const seq = runList(
      {
        mode: 'sequential',
        actions: [
          act(DEMO_DEVICE_IDS.sw, 'demo.set', { key: 'k', value: 'a' }, 100),
          act(DEMO_DEVICE_IDS.sw, 'demo.set', { key: 'k', value: 'b' }, 100),
        ],
      },
      show,
      { cancelled: false },
    );
    await jest.advanceTimersByTimeAsync(150);
    expect(order).toEqual(['a']);
    await jest.advanceTimersByTimeAsync(100);
    expect(await seq).toBe('sent');
    expect(order).toEqual(['a', 'b']);
    jest.useRealTimers();
  });

  it('停止で残りの動作をやめる', async () => {
    jest.useFakeTimers();
    const b = btn([act(DEMO_DEVICE_IDS.sw, 'demo.set', { key: 'k', value: 'z' }, 500)]);
    const p = testPress(b, show);
    stopButton(b.id);
    await jest.advanceTimersByTimeAsync(600);
    expect(await p).toBe('none');
    expect(useRuntimeStore.getState().deviceValues[DEMO_DEVICE_IDS.sw]?.k).toBeUndefined();
    jest.useRealTimers();
  });

  it('押下表現：送れた／送れなかった（⚠ は次に送れるまで残る）', async () => {
    const ok = btn([act(DEMO_DEVICE_IDS.sw, 'demo.toggle', { key: 'dsk1' })]);
    expect(await testPress(ok, show)).toBe('sent');
    expect(useRuntimeStore.getState().press[ok.id]?.phase).toBe('sent');

    const ng = btn([act(DEMO_DEVICE_IDS.rec, 'demo.toggle', { key: 'rec' })]);
    expect(await testPress(ng, show)).toBe('failed');
    expect(useRuntimeStore.getState().press[ng.id]).toMatchObject({ phase: 'failed', warn: true });

    useRuntimeStore.getState().setDeviceStatus(DEMO_DEVICE_IDS.rec, 'connected');
    expect(await testPress(ng, show)).toBe('sent');
    expect(useRuntimeStore.getState().press[ng.id]?.warn).toBe(false);
  });

  it('押している間は pressing、離すと「離した時」とステップ送り', async () => {
    const b = btn([act(DEMO_DEVICE_IDS.sw, 'demo.set', { key: 'k', value: '1' })]);
    b.steps.push({
      ...b.steps[0]!,
      id: 's2',
      press: { mode: 'sequential', actions: [act(DEMO_DEVICE_IDS.sw, 'demo.set', { key: 'k', value: '2' })] },
    });
    b.steps[0]!.release.actions = [act(DEMO_DEVICE_IDS.sw, 'demo.set', { key: 'r', value: 'up' })];
    pressDown(b, show);
    expect(useRuntimeStore.getState().press[b.id]?.phase).toBe('pressing');
    await pressUp(b, show);
    const v = useRuntimeStore.getState().deviceValues[DEMO_DEVICE_IDS.sw];
    expect(v?.k).toBe('1');
    expect(v?.r).toBe('up');
    expect(useRuntimeStore.getState().stepIndex[b.id]).toBe(1);
    await testPress(b, show);
    expect(useRuntimeStore.getState().deviceValues[DEMO_DEVICE_IDS.sw]?.k).toBe('2');
    expect(useRuntimeStore.getState().stepIndex[b.id]).toBe(0);
  });

  it('長押しが成立しても「離した時」を送る（SPEC 16-1）', async () => {
    jest.useFakeTimers();
    const b = btn([]);
    b.steps[0]!.holds = [
      {
        id: 'h',
        durationMs: 1000,
        repeat: false,
        actions: { mode: 'sequential', actions: [act(DEMO_DEVICE_IDS.sw, 'demo.set', { key: 'h', value: 'held' })] },
      },
    ];
    b.steps[0]!.release.actions = [act(DEMO_DEVICE_IDS.sw, 'demo.set', { key: 'r', value: 'up' })];
    pressDown(b, show);
    await jest.advanceTimersByTimeAsync(1001);
    expect(useRuntimeStore.getState().deviceValues[DEMO_DEVICE_IDS.sw]?.h).toBe('held');
    const r = pressUp(b, show);
    await jest.runAllTimersAsync();
    expect(await r).toBe('sent');
    expect(useRuntimeStore.getState().deviceValues[DEMO_DEVICE_IDS.sw]?.r).toBe('up');
    jest.useRealTimers();
  });

  it('状態表示で見た目が変わり、未接続の機器を使うボタンは offline', () => {
    const page = show.pages[0]!;
    const pgm1 = page.buttons[cellKey(0, 0)]!;
    const rt = useRuntimeStore.getState();
    let r = resolveStyle(pgm1, show, rt.deviceValues, rt.deviceStatus);
    expect(r.style.backgroundColor).toBe(pgm1.style.backgroundColor);
    rt.setDeviceValue(DEMO_DEVICE_IDS.sw, 'pgm', 'CAM 1');
    const rt2 = useRuntimeStore.getState();
    r = resolveStyle(pgm1, show, rt2.deviceValues, rt2.deviceStatus);
    expect(r.style.backgroundColor).toBe('#E0302B');
    expect(r.offline).toBe(false);
    const rec = page.buttons[cellKey(3, 7)]!;
    expect(resolveStyle(rec, show, rt2.deviceValues, rt2.deviceStatus).offline).toBe(true);
  });

  it('動作の説明文', () => {
    expect(describeAction(act('internal', 'internal.page', { page: 'next' }), show)).toEqual({
      title: 'ページを移動',
      detail: 'ページ 次',
    });
    expect(describeAction(act(DEMO_DEVICE_IDS.sw, 'demo.set', { key: 'pgm', value: 'CAM 1' }), show).detail).toBe('pgm = CAM 1');
  });
});

describe('変数の解決', () => {
  it('機器の値・内部・未定義は $NA', () => {
    const show = demoShow();
    const values = { [DEMO_DEVICE_IDS.sw]: { pgm: 'CAM 2' } };
    const ctx = { show, values, pageNumber: 2, now: new Date(2026, 9, 17, 9, 5, 7) };
    expect(resolveText('PGM $(DEMO-SW-A:pgm)', ctx)).toBe('PGM CAM 2');
    expect(resolveText('$(internal:time) p$(internal:page) $(internal:page_name)', ctx)).toBe('09:05:07 p2 VTR');
    expect(resolveText('$(DEMO-SW-A:none) $(custom:x)', ctx)).toBe(`${NA} ${NA}`);
  });
});
