import type { ButtonModel, Show } from '@/model/types';
import { useRuntimeStore } from '@/stores/runtime';
import { holdButton, pressButton, releaseButton, type ListResult } from './executor';
import { haptic } from './haptics';

/**
 * 本番でのボタン 1 回分の押下（SPEC 4・6 章）。
 * - 指が触れた瞬間に「押した時」を送る（遅延なし）
 * - 長押しは durationMs ごとに成立（repeat なら同じ間隔で繰り返し）
 * - 指を離したら「離した時」を送る（長押し成立後も。SPEC 16-1）
 * - 押下表現：押している → 送れた / 送れなかった。送り終わる前に指を離したら「実行中」
 */

interface Session {
  button: ButtonModel;
  pressDone: Promise<ListResult>;
  results: ListResult[];
  timers: ReturnType<typeof setTimeout>[];
  holdFired: boolean;
}

const sessions = new Map<string, Session>();

function combine(results: ListResult[]): ListResult {
  if (results.includes('failed')) return 'failed';
  if (results.includes('sent')) return 'sent';
  return 'none';
}

function finish(buttonId: string, result: ListResult, haptics: boolean): void {
  const rt = useRuntimeStore.getState();
  if (result === 'failed') {
    rt.setPress(buttonId, 'failed');
    if (haptics) haptic('error');
  } else if (result === 'sent') {
    rt.setPress(buttonId, 'sent');
  } else {
    rt.setPress(buttonId, 'idle');
  }
}

export function pressDown(button: ButtonModel, show: Show): void {
  if (sessions.has(button.id)) return;
  const haptics = show.settings.haptics;
  useRuntimeStore.getState().setPress(button.id, 'pressing');
  if (haptics) haptic('medium');
  const session: Session = { button, pressDone: Promise.resolve('none'), results: [], timers: [], holdFired: false };
  session.pressDone = pressButton(button, show).then((r) => {
    session.results.push(r);
    return r;
  });
  const step = button.steps[Math.min(useRuntimeStore.getState().stepIndex[button.id] ?? 0, button.steps.length - 1)];
  for (const group of step?.holds ?? []) {
    const fire = () => {
      if (!session.holdFired && haptics) haptic('heavy');
      session.holdFired = true;
      void holdButton(button, show, group.id).then((r) => session.results.push(r));
    };
    const t = setTimeout(() => {
      fire();
      if (group.repeat && group.durationMs > 0) {
        const iv = setInterval(fire, group.durationMs);
        session.timers.push(iv as unknown as ReturnType<typeof setTimeout>);
      }
    }, group.durationMs);
    session.timers.push(t);
  }
  sessions.set(button.id, session);
}

export async function pressUp(button: ButtonModel, show: Show): Promise<ListResult> {
  const session = sessions.get(button.id);
  if (!session) return 'none';
  sessions.delete(button.id);
  for (const t of session.timers) {
    clearTimeout(t);
    clearInterval(t as unknown as ReturnType<typeof setInterval>);
  }
  let settled = false;
  void session.pressDone.then(() => {
    settled = true;
  });
  await Promise.resolve();
  if (!settled) useRuntimeStore.getState().setPress(button.id, 'running');
  await session.pressDone;
  const r = await releaseButton(button, show);
  session.results.push(r);
  const total = combine(session.results);
  finish(button.id, total, show.settings.haptics);
  return total;
}

/** 編集画面の［テスト］：押す→離すをまとめて実行して結果を出す */
export async function testPress(button: ButtonModel, show: Show): Promise<ListResult> {
  pressDown(button, show);
  return pressUp(button, show);
}

export function isPressing(buttonId: string): boolean {
  return sessions.has(buttonId);
}

/** アプリが裏に回った時など：押したままのボタンをすべて離す（「離した時」を必ず送る） */
export function releaseAll(show: Show): void {
  for (const s of [...sessions.values()]) void pressUp(s.button, show);
}

export function anyPressing(): boolean {
  return sessions.size > 0;
}
