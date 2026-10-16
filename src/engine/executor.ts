import { checkFeedback, withDefaults, type Values } from '@/drivers/engine';
import { getActionDef, getDefinition, getFeedbackDef } from '@/drivers/registry';
import type { ActionList, ActionModel, ButtonModel, ButtonStyle, Show } from '@/model/types';
import { log } from '@/stores/log';
import { useRuntimeStore } from '@/stores/runtime';
import { resolveText } from '@/variables/resolve';
import { runDemoAction, type DriverContext, type SendResult } from './demoDriver';
import { deviceManager } from './devices';

/**
 * 動作の実行（SPEC 6 章）。
 * - 順番に実行：前の動作の送信完了（SPEC 4 章の「送れた」）を待ってから、次の動作の delayMs を待って送る
 * - 同時に実行：全部を一斉に始め、それぞれ delayMs 後に送る
 * 戻り値：送った動作が無ければ 'none'、1 つでも失敗があれば 'failed'、それ以外は 'sent'
 */

export type ListResult = 'none' | 'sent' | 'failed';

const running = new Map<string, { cancelled: boolean }>();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function ctxFor(deviceId: string): DriverContext {
  return {
    get: (key) => useRuntimeStore.getState().deviceValues[deviceId]?.[key],
    set: (key, value) => useRuntimeStore.getState().setDeviceValue(deviceId, key, value),
  };
}

/** 機器の接続を、ショーの機器一覧に合わせる */
export function initDevices(show: Show): void {
  deviceManager.sync(show);
}

/** 文字のオプションの $(…) を今の値に置き換える */
function resolveOptions(action: ActionModel, show: Show, button?: ButtonModel): Values {
  const rt = useRuntimeStore.getState();
  const ctx = { show, values: rt.deviceValues, pageNumber: rt.pageNumber, now: new Date(), button };
  const def =
    action.deviceId === 'internal'
      ? getActionDef('internal', action.definitionId)
      : getActionDef(show.devices.find((d) => d.id === action.deviceId)?.driverId ?? '', action.definitionId);
  const values = withDefaults(def?.options ?? [], action.options);
  const out: Values = {};
  for (const [k, v] of Object.entries(values)) out[k] = typeof v === 'string' ? resolveText(v, ctx) : v;
  return out;
}

function runInternal(action: ActionModel, option: Values, show: Show, button?: ButtonModel): SendResult {
  const rt = useRuntimeStore.getState();
  switch (action.definitionId) {
    case 'internal.page': {
      const count = show.pages.length;
      const target = String(option.page ?? '').trim();
      let n: number;
      if (target === 'next') n = (rt.pageNumber % count) + 1;
      else if (target === 'prev') n = ((rt.pageNumber + count - 2) % count) + 1;
      else n = Number(target);
      if (!show.pages.some((p) => p.number === n)) return { ok: false, reason: `ページ ${target} がありません` };
      rt.setPageNumber(n);
      return { ok: true };
    }
    case 'internal.step': {
      if (!button) return { ok: false, reason: 'ボタンの外では使えません' };
      const target = String(option.step ?? '').trim();
      const cur = rt.stepIndex[button.id] ?? 0;
      const n = target === 'next' ? (cur + 1) % button.steps.length : Number(target) - 1;
      if (!(n >= 0 && n < button.steps.length)) return { ok: false, reason: `ステップ ${target} がありません` };
      rt.setStep(button.id, n);
      return { ok: true };
    }
    case 'internal.lock':
      rt.setLocked(option.lock !== 'unlock');
      return { ok: true };
    case 'internal.log':
      log('info', '内部', String(option.text ?? ''));
      return { ok: true };
    default:
      return { ok: false, reason: `内部の動作 ${action.definitionId} は使えません` };
  }
}

export async function runAction(action: ActionModel, show: Show, button?: ButtonModel): Promise<SendResult> {
  if (!action.enabled) return { ok: true };
  const option = resolveOptions(action, show, button);
  if (action.deviceId === 'internal') return runInternal(action, option, show, button);
  const device = show.devices.find((d) => d.id === action.deviceId);
  if (!device) return { ok: false, reason: '機器が見つかりません（削除された可能性があります）' };
  const status = useRuntimeStore.getState().deviceStatus[device.id];
  if (status !== 'connected') return { ok: false, reason: `${device.label} に接続していません` };
  const def = getDefinition(device.driverId);
  const actionDef = def?.actions.find((a) => a.id === action.definitionId);
  if (!def || !actionDef) return { ok: false, reason: `${device.label} では使えない動作です（${action.definitionId}）` };
  if (def.transport === 'demo') {
    const r = runDemoAction(action.definitionId, option, ctxFor(device.id));
    log('debug', device.label, `${actionDef.name}${r.ok ? '' : `：${r.reason}`}`, device.id);
    return r;
  }
  return deviceManager.send(device, actionDef, option);
}

export async function runList(list: ActionList, show: Show, token: { cancelled: boolean }, button?: ButtonModel): Promise<ListResult> {
  const acts = list.actions.filter((a) => a.enabled);
  if (acts.length === 0) return 'none';
  const results: SendResult[] = [];
  if (list.mode === 'sequential') {
    for (const a of acts) {
      if (a.delayMs > 0) await sleep(a.delayMs);
      if (token.cancelled) break;
      results.push(await runAction(a, show, button));
    }
  } else {
    await Promise.all(
      acts.map(async (a) => {
        if (a.delayMs > 0) await sleep(a.delayMs);
        if (token.cancelled) return;
        results.push(await runAction(a, show, button));
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
  const r = await runList(step.press, show, token, button);
  if (running.get(button.id) === token) running.delete(button.id);
  return r;
}

/** 指が離れた時：「離した時」→ ステップ自動送り（長押し成立時も実行。SPEC 16-1） */
export async function releaseButton(button: ButtonModel, show: Show): Promise<ListResult> {
  const idx = currentStepIndex(button);
  const step = button.steps[idx];
  if (!step) return 'none';
  const token = { cancelled: false };
  running.set(button.id, token);
  const r = await runList(step.release, show, token, button);
  if (running.get(button.id) === token) running.delete(button.id);
  // 動作でステップを変えた時（internal.step）はそれを優先する
  if (button.options.stepProgression === 'auto' && button.steps.length > 1 && currentStepIndex(button) === idx) {
    useRuntimeStore.getState().setStep(button.id, (idx + 1) % button.steps.length);
  }
  return r;
}

export async function holdButton(button: ButtonModel, show: Show, groupId: string): Promise<ListResult> {
  const step = button.steps[currentStepIndex(button)];
  const group = step?.holds.find((h) => h.id === groupId);
  if (!group) return 'none';
  return runList(group.actions, show, { cancelled: false }, button);
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
    if (!device) continue;
    const def = getFeedbackDef(device.driverId, fb.definitionId);
    if (!def) continue;
    const hit = checkFeedback(def, withDefaults(def.options, fb.options), values[device.id]) !== fb.invert;
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
