import type { ActionList, ActionModel, ButtonModel, ButtonStyle, Show } from '@/model/types';
import { useRuntimeStore } from '@/stores/runtime';
import { checkDemoFeedback, demoStatus, runDemoAction, type DriverContext, type SendResult } from './demoDriver';

/**
 * 動作の実行（SPEC 6 章）。M1 はデモドライバと内部動作（ページ移動）だけ。
 * - 順番に実行：前の動作が送れたら、次の動作の delayMs を待って送る
 * - 同時に実行：全部を一斉に始め、それぞれ delayMs 後に送る
 * 戻り値：送った動作が無ければ 'none'、1 つでも失敗があれば 'failed'、それ以外は 'sent'
 */

export type ListResult = 'none' | 'sent' | 'failed';

const running = new Map<string, { cancelled: boolean }>();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function ctxFor(deviceId: string): DriverContext {
  const rt = useRuntimeStore.getState();
  return {
    get: (key) => useRuntimeStore.getState().deviceValues[deviceId]?.[key],
    set: (key, value) => rt.setDeviceValue(deviceId, key, value),
  };
}

/** 機器の接続状態を初期化（M1：デモドライバは設定どおりの状態にする） */
export function initDevices(show: Show): void {
  const rt = useRuntimeStore.getState();
  for (const d of show.devices) {
    rt.setDeviceStatus(d.id, d.driverId === 'demo' ? demoStatus(d) : 'connecting');
  }
}

export function runAction(action: ActionModel, show: Show): SendResult {
  if (!action.enabled) return { ok: true };
  if (action.deviceId === 'internal') {
    if (action.definitionId === 'internal.page') {
      const rt = useRuntimeStore.getState();
      const count = show.pages.length;
      const target = action.options.page;
      let n: number;
      if (target === 'next') n = (rt.pageNumber % count) + 1;
      else if (target === 'prev') n = ((rt.pageNumber + count - 2) % count) + 1;
      else n = Number(target);
      if (!show.pages.some((p) => p.number === n)) return { ok: false, reason: `ページ ${String(target)} がありません` };
      rt.setPageNumber(n);
      return { ok: true };
    }
    return { ok: false, reason: `内部の動作 ${action.definitionId} は未対応です` };
  }
  const device = show.devices.find((d) => d.id === action.deviceId);
  if (!device) return { ok: false, reason: '機器が見つかりません（削除された可能性があります）' };
  const status = useRuntimeStore.getState().deviceStatus[device.id];
  if (status !== 'connected') return { ok: false, reason: `${device.label} に接続していません` };
  if (device.driverId === 'demo') return runDemoAction(action.definitionId, action.options, ctxFor(device.id));
  return { ok: false, reason: `ドライバ ${device.driverId} はまだありません` };
}

export async function runList(list: ActionList, show: Show, token: { cancelled: boolean }): Promise<ListResult> {
  const acts = list.actions.filter((a) => a.enabled);
  if (acts.length === 0) return 'none';
  const results: SendResult[] = [];
  if (list.mode === 'sequential') {
    for (const a of acts) {
      if (a.delayMs > 0) await sleep(a.delayMs);
      if (token.cancelled) break;
      results.push(runAction(a, show));
    }
  } else {
    await Promise.all(
      acts.map(async (a) => {
        if (a.delayMs > 0) await sleep(a.delayMs);
        if (token.cancelled) return;
        results.push(runAction(a, show));
      }),
    );
  }
  if (results.length === 0) return 'none';
  return results.every((r) => r.ok) ? 'sent' : 'failed';
}

function currentStepIndex(button: ButtonModel): number {
  const i = useRuntimeStore.getState().stepIndex[button.id] ?? 0;
  return Math.min(Math.max(0, i), Math.max(0, button.steps.length - 1));
}

/** 指が触れた時：現在ステップの「押した時」 */
export async function pressButton(button: ButtonModel, show: Show): Promise<ListResult> {
  const step = button.steps[currentStepIndex(button)];
  if (!step) return 'none';
  const token = { cancelled: false };
  running.set(button.id, token);
  const r = await runList(step.press, show, token);
  if (running.get(button.id) === token) running.delete(button.id);
  return r;
}

/** 指が離れた時：「離した時」→ ステップ自動送り（長押し成立時も実行。SPEC 16-1） */
export async function releaseButton(button: ButtonModel, show: Show): Promise<ListResult> {
  const idx = currentStepIndex(button);
  const step = button.steps[idx];
  if (!step) return 'none';
  const token = { cancelled: false };
  const r = await runList(step.release, show, token);
  if (button.options.stepProgression === 'auto' && button.steps.length > 1) {
    useRuntimeStore.getState().setStep(button.id, (idx + 1) % button.steps.length);
  }
  return r;
}

export async function holdButton(button: ButtonModel, show: Show, groupId: string): Promise<ListResult> {
  const step = button.steps[currentStepIndex(button)];
  const group = step?.holds.find((h) => h.id === groupId);
  if (!group) return 'none';
  return runList(group.actions, show, { cancelled: false });
}

/** 停止：実行中の待ちと残りの動作をやめる */
export function stopButton(buttonId: string): void {
  const t = running.get(buttonId);
  if (t) t.cancelled = true;
  running.delete(buttonId);
}

export function isRunning(buttonId: string): boolean {
  return running.has(buttonId);
}

/** 押下判定に使う最短の長押し時間（無ければ null） */
export function shortestHoldMs(button: ButtonModel): number | null {
  const step = button.steps[currentStepIndex(button)];
  if (!step || step.holds.length === 0) return null;
  return Math.min(...step.holds.map((h) => h.durationMs));
}

/** 状態表示を反映した見た目と、未接続の機器を使っているか（SPEC 4 章「機器未接続」） */
export function resolveStyle(
  button: ButtonModel,
  show: Show,
  values: Record<string, Record<string, string>>,
  status: Record<string, string>,
): { style: ButtonStyle; offline: boolean } {
  let style = button.style;
  for (const fb of button.feedbacks) {
    if (!fb.enabled) continue;
    const device = show.devices.find((d) => d.id === fb.deviceId);
    if (!device || device.driverId !== 'demo') continue;
    const ctx: DriverContext = { get: (k) => values[device.id]?.[k], set: () => undefined };
    const hit = checkDemoFeedback(fb.definitionId, fb.options, ctx) !== fb.invert;
    if (hit) style = { ...style, ...fb.style };
  }
  const usedDevices = new Set<string>();
  for (const st of button.steps) {
    const all = [...st.press.actions, ...st.release.actions, ...st.holds.flatMap((h) => h.actions.actions)];
    for (const a of all) if (a.enabled && a.deviceId !== 'internal') usedDevices.add(a.deviceId);
  }
  const offline = [...usedDevices].some((id) => status[id] !== 'connected');
  return { style, offline };
}
