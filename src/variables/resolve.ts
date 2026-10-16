import type { ButtonModel, Show } from '@/model/types';

/**
 * 文字列中の $(…) を現在値に置き換える（SPEC 2.1-5・6 章）。
 * M1 で解決するもの：機器の値 $(機器名:名前)、内部 $(internal:page|page_name|time|date)、ボタン変数 $(this:名前)。
 * 自分で作る変数・式の変数は M4。解決できないものは $NA（SPEC 6 章【推測：表示文字列は決め】）。
 */

export const NA = '$NA';

const PATTERN = /\$\(([^:()]+):([^()]+)\)/g;

export interface ResolveContext {
  show: Show;
  values: Record<string, Record<string, string>>;
  pageNumber: number;
  now: Date;
  button?: ButtonModel;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function internal(name: string, ctx: ResolveContext): string | undefined {
  switch (name) {
    case 'page':
      return String(ctx.pageNumber);
    case 'page_name':
      return ctx.show.pages.find((p) => p.number === ctx.pageNumber)?.name;
    case 'time':
      return `${pad(ctx.now.getHours())}:${pad(ctx.now.getMinutes())}:${pad(ctx.now.getSeconds())}`;
    case 'date':
      return `${ctx.now.getFullYear()}-${pad(ctx.now.getMonth() + 1)}-${pad(ctx.now.getDate())}`;
    default:
      return undefined;
  }
}

export function resolveOne(scope: string, name: string, ctx: ResolveContext): string | undefined {
  if (scope === 'internal') return internal(name, ctx);
  if (scope === 'this') {
    const v = ctx.button?.localVariables.find((l) => l.name === name);
    return v && v.kind === 'value' ? v.value : undefined;
  }
  if (scope === 'custom' || scope === 'expression') return undefined;
  const device = ctx.show.devices.find((d) => d.label === scope);
  if (!device) return undefined;
  return ctx.values[device.id]?.[name];
}

export function resolveText(text: string, ctx: ResolveContext): string {
  return text.replace(PATTERN, (_m, scope: string, name: string) => resolveOne(scope.trim(), name.trim(), ctx) ?? NA);
}

export function hasVariables(text: string): boolean {
  PATTERN.lastIndex = 0;
  const r = PATTERN.test(text);
  PATTERN.lastIndex = 0;
  return r;
}

/** 時刻を使っているか（1 秒ごとに描き直すかどうかの判定） */
export function usesClock(text: string): boolean {
  return text.includes('$(internal:time)');
}
