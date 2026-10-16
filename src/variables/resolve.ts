import { evalExpression, ExpressionError, toText, type VarLookup } from '@/expression';
import type { ButtonModel, Show } from '@/model/types';
import { useRuntimeStore } from '@/stores/runtime';

/**
 * 文字列中の $(…) を現在値に置き換える（SPEC 2.1-5・6 章）。
 * - $(機器名:名前) 機器の値
 * - $(custom:名前) 自分で作る変数（今の値、無ければ初期値）
 * - $(expression:名前) 式の変数（その場で計算）
 * - $(internal:名前) 時刻・日付・ページ・接続数など
 * - $(this:名前) ボタン変数（値または式）
 * 解決できないものは $NA（SPEC 6 章【推測：表示文字列は決め】）。
 */

export const NA = '$NA';

const PATTERN = /\$\(([^:()]+):([^()]+)\)/g;

/** 式の変数どうしが参照し合っても止まるように */
const MAX_DEPTH = 8;

export interface ResolveContext {
  show: Show;
  values: Record<string, Record<string, string>>;
  pageNumber: number;
  now: Date;
  button?: ButtonModel;
  /** 自分で作る変数の今の値（省略時は実行時ストアから） */
  custom?: Record<string, string>;
  /** 機器の接続状態（省略時は実行時ストアから） */
  status?: Record<string, string>;
  /** トリガー変数など、その場だけの変数（$(this:名前) で引く） */
  local?: Record<string, string>;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export const INTERNAL_VARIABLES = [
  { name: 'time', title: '時刻' },
  { name: 'date', title: '日付' },
  { name: 'hour', title: '時' },
  { name: 'minute', title: '分' },
  { name: 'second', title: '秒' },
  { name: 'weekday', title: '曜日（0 = 日曜）' },
  { name: 'unix', title: '1970 年からの秒数' },
  { name: 'page', title: '表示中のページ番号' },
  { name: 'page_name', title: '表示中のページ名' },
  { name: 'page_count', title: 'ページの数' },
  { name: 'device_count', title: '有効な機器の数' },
  { name: 'connected_count', title: '接続中の機器の数' },
  { name: 'locked', title: '本番のロック（true / false）' },
  { name: 'show_name', title: 'ショー名' },
] as const;

function internal(name: string, ctx: ResolveContext): string | undefined {
  const d = ctx.now;
  switch (name) {
    case 'time':
      return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    case 'date':
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    case 'hour':
      return String(d.getHours());
    case 'minute':
      return String(d.getMinutes());
    case 'second':
      return String(d.getSeconds());
    case 'weekday':
      return String(d.getDay());
    case 'unix':
      return String(Math.floor(d.getTime() / 1000));
    case 'page':
      return String(ctx.pageNumber);
    case 'page_name':
      return ctx.show.pages.find((p) => p.number === ctx.pageNumber)?.name;
    case 'page_count':
      return String(ctx.show.pages.length);
    case 'device_count':
      return String(ctx.show.devices.filter((x) => x.enabled).length);
    case 'connected_count': {
      const st = ctx.status ?? useRuntimeStore.getState().deviceStatus;
      return String(ctx.show.devices.filter((x) => x.enabled && st[x.id] === 'connected').length);
    }
    case 'locked':
      return String(useRuntimeStore.getState().locked);
    case 'show_name':
      return ctx.show.name;
    default: {
      // $(internal:機器名_status) で接続状態
      const m = /^(.+)_status$/.exec(name);
      if (m) {
        const dev = ctx.show.devices.find((x) => x.label === m[1]);
        if (!dev) return undefined;
        return (ctx.status ?? useRuntimeStore.getState().deviceStatus)[dev.id] ?? 'connecting';
      }
      return undefined;
    }
  }
}

function lookupFor(ctx: ResolveContext, depth: number): VarLookup {
  return (scope, name) => resolveOne(scope, name, ctx, depth + 1);
}

function evalSafe(expr: string, ctx: ResolveContext, depth: number): string | undefined {
  if (depth > MAX_DEPTH) return undefined;
  try {
    return toText(evalExpression(expr, lookupFor(ctx, depth)));
  } catch (e) {
    if (e instanceof ExpressionError) return undefined;
    throw e;
  }
}

export function resolveOne(scope: string, name: string, ctx: ResolveContext, depth = 0): string | undefined {
  if (depth > MAX_DEPTH) return undefined;
  if (scope === 'internal') return internal(name, ctx);
  if (scope === 'this') {
    if (ctx.local && name in ctx.local) return ctx.local[name];
    const v = ctx.button?.localVariables.find((l) => l.name === name);
    if (!v) return undefined;
    return v.kind === 'value' ? v.value : evalSafe(v.value, ctx, depth);
  }
  if (scope === 'custom') {
    const def = ctx.show.customVariables.find((c) => c.name === name);
    if (!def) return undefined;
    const cur = (ctx.custom ?? useRuntimeStore.getState().customValues)[name];
    return cur ?? def.defaultValue;
  }
  if (scope === 'expression') {
    const def = ctx.show.expressionVariables.find((x) => x.name === name);
    return def ? evalSafe(def.expression, ctx, depth) : undefined;
  }
  const device = ctx.show.devices.find((d) => d.label === scope);
  if (!device) return undefined;
  return ctx.values[device.id]?.[name];
}

export function resolveText(text: string, ctx: ResolveContext): string {
  if (!text.includes('$(')) return text;
  return text.replace(PATTERN, (_m, scope: string, name: string) => resolveOne(scope.trim(), name.trim(), ctx) ?? NA);
}

/** 式を評価して文字にする（失敗は null と理由） */
export function evaluateFor(expr: string, ctx: ResolveContext): { value: string } | { error: string } {
  try {
    return { value: toText(evalExpression(expr, lookupFor(ctx, 0))) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export function hasVariables(text: string): boolean {
  PATTERN.lastIndex = 0;
  const r = PATTERN.test(text);
  PATTERN.lastIndex = 0;
  return r;
}

const CLOCK_RE = /\$\(internal:(time|second|unix|minute|hour)\)|\$\(expression:/;

/** 時刻を使っているか（1 秒ごとに描き直すかどうかの判定）。式の変数は中で時刻を使うかもしれないので含める */
export function usesClock(text: string): boolean {
  return CLOCK_RE.test(text);
}

/** 実行時ストアから作る、いまの文脈 */
export function currentContext(show: Show, button?: ButtonModel, local?: Record<string, string>): ResolveContext {
  const rt = useRuntimeStore.getState();
  return {
    show,
    values: rt.deviceValues,
    pageNumber: rt.pageNumber,
    now: new Date(),
    button,
    custom: rt.customValues,
    status: rt.deviceStatus,
    local,
  };
}
