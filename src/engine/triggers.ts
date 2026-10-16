import type { LocalVariable, Show, Trigger, TriggerEvent } from '@/model/types';
import { log } from '@/stores/log';
import { useRuntimeStore } from '@/stores/runtime';
import { useShowStore } from '@/stores/show';
import { currentContext, evaluateFor, resolveText, type ResolveContext } from '@/variables/resolve';
import { feedbackHolds, internalHooks, runList, type ListResult } from './executor';
import { pressListeners } from './press';

/**
 * トリガー（SPEC 2.1-4・6 章）：きっかけ（どれか起きたら）→ 条件（すべて満たす時だけ）→ 動作。
 * アプリが前面にある間だけ動く（iOS。SPEC 11 章）。
 * - 一定間隔・時刻：タイマー（時刻は 1 秒ごとに確かめ、同じ分には 1 回だけ）
 * - 条件の変化・変数の変化・機器の接続/切断：実行時の値が変わるたびに確かめる（まとめて 1 回）
 * - 同じトリガーが 1 秒に RATE_LIMIT 回を超えて動いたら止めて警告（動作が自分のきっかけを起こす無限ループ対策）
 */

export const RATE_LIMIT = 20;

type Fire = { trigger: Trigger; reason: string };

export class TriggerEngine {
  private show: Show | null = null;
  private timers: ReturnType<typeof setInterval>[] = [];
  private clock: ReturnType<typeof setInterval> | null = null;
  private unsub: (() => void)[] = [];
  private scheduled = false;
  /** 条件の前回の結果（conditionTrue / False の変化を見る） */
  private lastCondition = new Map<string, boolean>();
  /** 変数の前回の値（variableChanged） */
  private lastVariable = new Map<string, string>();
  private lastStatus: Record<string, string> = {};
  private firedMinute = new Map<string, string>();
  private counts = new Map<string, { second: number; n: number }>();
  private started = false;

  constructor(private readonly now: () => Date = () => new Date()) {}

  /** 起動時に 1 回。appStart のトリガーもここで動かす */
  start(show: Show): void {
    if (this.started) return;
    this.started = true;
    this.show = show;
    this.lastStatus = { ...useRuntimeStore.getState().deviceStatus };
    this.rebuild();
    this.unsub.push(
      useRuntimeStore.subscribe(() => this.schedule()),
      useShowStore.subscribe((s, prev) => {
        if (!s.show || s.show === prev.show) return;
        const triggersChanged = !prev.show || s.show.triggers !== prev.show.triggers || s.show.id !== prev.show.id;
        this.show = s.show;
        if (triggersChanged) this.rebuild();
        this.schedule();
      }),
    );
    this.clock = setInterval(() => this.tick(), 1000);
    for (const t of show.triggers) {
      if (t.enabled && t.events.some((e) => e.type === 'appStart')) this.fire({ trigger: t, reason: 'アプリを開いた' });
    }
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    if (this.clock) clearInterval(this.clock);
    this.clock = null;
    for (const u of this.unsub) u();
    this.unsub = [];
    this.started = false;
  }

  /** 一定間隔のタイマーを作り直し、変化を見る基準を今の値にする */
  private rebuild(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    const show = this.show;
    if (!show) return;
    const ctx = currentContext(show);
    const ids = new Set(show.triggers.map((t) => t.id));
    for (const k of [...this.lastCondition.keys()]) if (!ids.has(k)) this.lastCondition.delete(k);
    for (const t of show.triggers) {
      if (!t.enabled) continue;
      for (const e of t.events) {
        if (e.type === 'interval' && e.seconds >= 1) {
          this.timers.push(setInterval(() => this.fireById(t.id, `${e.seconds} 秒ごと`), e.seconds * 1000));
        }
        if (e.type === 'variableChanged' && e.variable) {
          const key = `${t.id}|${e.variable}`;
          if (!this.lastVariable.has(key)) this.lastVariable.set(key, resolveText(e.variable, ctx));
        }
      }
      if (!this.lastCondition.has(t.id)) this.lastCondition.set(t.id, this.conditionsHold(t, ctx));
    }
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    setTimeout(() => {
      this.scheduled = false;
      this.evaluate();
    }, 0);
  }

  /** 1 秒ごと：時刻のきっかけ、時刻を使う条件・変数 */
  tick(): void {
    const show = this.show;
    if (!show) return;
    const d = this.now();
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const minuteKey = `${d.toDateString()} ${hhmm}`;
    for (const t of show.triggers) {
      if (!t.enabled) continue;
      for (const e of t.events) {
        if (e.type !== 'timeOfDay') continue;
        if (e.time !== hhmm) continue;
        if (e.weekdays.length > 0 && !e.weekdays.includes(d.getDay())) continue;
        const k = `${t.id}|${e.time}|${e.weekdays.join(',')}`;
        if (this.firedMinute.get(k) === minuteKey) continue;
        this.firedMinute.set(k, minuteKey);
        this.fire({ trigger: t, reason: `時刻 ${e.time}` });
      }
    }
    this.evaluate();
  }

  /** 値の変化で起きるきっかけ */
  evaluate(): void {
    const show = this.show;
    if (!show) return;
    const ctx = currentContext(show);
    const status = useRuntimeStore.getState().deviceStatus;
    for (const t of show.triggers) {
      if (!t.enabled) continue;
      // 条件の変化
      const hold = this.conditionsHold(t, ctx);
      const prev = this.lastCondition.get(t.id);
      this.lastCondition.set(t.id, hold);
      if (prev !== undefined && prev !== hold && t.conditions.length > 0) {
        const want = hold ? 'conditionTrue' : 'conditionFalse';
        if (t.events.some((e) => e.type === want)) this.run(t, hold ? '条件が成り立った' : '条件が成り立たなくなった', ctx);
      }
      for (const e of t.events) {
        if (e.type === 'variableChanged' && e.variable) {
          const key = `${t.id}|${e.variable}`;
          const v = resolveText(e.variable, ctx);
          const before = this.lastVariable.get(key);
          this.lastVariable.set(key, v);
          if (before !== undefined && before !== v) this.fire({ trigger: t, reason: `${e.variable} が ${before} → ${v}` }, ctx);
        }
        if ((e.type === 'deviceConnected' || e.type === 'deviceDisconnected') && e.deviceId) {
          const was = this.lastStatus[e.deviceId];
          const is = status[e.deviceId];
          if (was === is) continue;
          if (e.type === 'deviceConnected' && is === 'connected') this.fire({ trigger: t, reason: '機器に接続した' }, ctx);
          if (e.type === 'deviceDisconnected' && was === 'connected' && is !== 'connected')
            this.fire({ trigger: t, reason: '機器が切れた' }, ctx);
        }
      }
    }
    this.lastStatus = { ...status };
  }

  /** ボタンを押した／離した（press.ts から） */
  notifyButton(kind: 'press' | 'release', buttonName: string): void {
    const show = this.show;
    if (!show) return;
    const type: TriggerEvent['type'] = kind === 'press' ? 'buttonPress' : 'buttonRelease';
    for (const t of show.triggers) {
      if (t.enabled && t.events.some((e) => e.type === type)) {
        this.fire({ trigger: t, reason: `${buttonName || 'ボタン'} を${kind === 'press' ? '押した' : '離した'}` }, undefined, {
          button: buttonName,
        });
      }
    }
  }

  private fireById(id: string, reason: string): void {
    const t = this.show?.triggers.find((x) => x.id === id);
    if (t?.enabled) this.fire({ trigger: t, reason });
  }

  /** きっかけが起きた：条件を確かめて動作へ（条件の変化そのものがきっかけの時は run を直接呼ぶ） */
  private fire(f: Fire, ctx?: ResolveContext, extra?: Record<string, string>): void {
    const show = this.show;
    if (!show) return;
    const c = ctx ?? currentContext(show);
    if (!this.conditionsHold(f.trigger, c)) return;
    this.run(f.trigger, f.reason, c, extra);
  }

  conditionsHold(t: Trigger, ctx: ResolveContext): boolean {
    const show = this.show;
    if (!show) return false;
    const values = useRuntimeStore.getState().deviceValues;
    return t.conditions.every((c) => !c.enabled || feedbackHolds(c, show, values, ctx) !== c.invert);
  }

  private limited(t: Trigger): boolean {
    const sec = Math.floor(Date.now() / 1000);
    const c = this.counts.get(t.id);
    if (!c || c.second !== sec) {
      this.counts.set(t.id, { second: sec, n: 1 });
      return false;
    }
    c.n += 1;
    if (c.n === RATE_LIMIT + 1)
      log(
        'warn',
        'トリガー',
        `${t.name} が 1 秒に ${RATE_LIMIT} 回を超えたので止めました（動作が自分のきっかけを起こしていないか確認してください）`,
      );
    return c.n > RATE_LIMIT;
  }

  /** 動作を実行（テスト実行もここ） */
  run(t: Trigger, reason: string, ctx?: ResolveContext, extra?: Record<string, string>): Promise<ListResult> {
    const show = this.show ?? useShowStore.getState().show;
    if (!show || this.limited(t)) return Promise.resolve('none');
    const local = triggerLocals(t.localVariables, ctx ?? currentContext(show), { ...extra, reason });
    log('info', 'トリガー', `${t.name}：${reason}`);
    return runList(t.actions, show, { cancelled: false }, undefined, local).then((r) => {
      if (r === 'failed') log('warn', 'トリガー', `${t.name}：送れなかった動作があります`);
      return r;
    });
  }
}

/** トリガー変数（$(this:名前)）。式は順に計算し、前の変数を使える */
export function triggerLocals(vars: LocalVariable[], ctx: ResolveContext, extra: Record<string, string>): Record<string, string> {
  const local: Record<string, string> = { ...extra };
  for (const v of vars) {
    if (v.kind === 'value') local[v.name] = resolveText(v.value, { ...ctx, local });
    else {
      const r = evaluateFor(v.value, { ...ctx, local });
      local[v.name] = 'value' in r ? r.value : '';
    }
  }
  return local;
}

export const triggerEngine = new TriggerEngine();

/** 内部の動作「トリガーを操作」 */
internalHooks.trigger = (name, op) => {
  const s = useShowStore.getState();
  const t = s.show?.triggers.find((x) => x.name === name);
  if (!t) return { ok: false, reason: `トリガー ${name} がありません` };
  if (op === 'run') {
    void triggerEngine.run(t, '動作から実行');
    return { ok: true };
  }
  s.mutateShow((show) => ({ ...show, triggers: show.triggers.map((x) => (x.id === t.id ? { ...x, enabled: op === 'enable' } : x)) }));
  return { ok: true };
};

pressListeners.push((kind, button) => triggerEngine.notifyButton(kind, button.name));
