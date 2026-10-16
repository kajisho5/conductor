import type { OptionValue } from '@/model/types';
import { BytesError, concat, parseHex, unescapeText, utf8Decode } from './bytes';
import { encodeOscMessage, oscArgFrom, type OscArg } from './osc';
import type { ActionDef, CompareOp, DriverDefinition, FeedbackDef, FieldDef, ReceiveRule } from './types';

/**
 * 汎用エンジン（SPEC 7.1）：定義（データ）どおりに送信内容を組み立て、受信を解析し、状態表示を判定する。
 * 定義にコードは無い。ここにある処理だけが動く。
 */

export type Values = Record<string, string | number | boolean>;

export function optionString(v: OptionValue | undefined): string {
  if (v === undefined) return '';
  if (typeof v === 'object') return v.expression;
  return String(v);
}

/** `{{option.x}}` `{{config.x}}` を置き換える。無い名前は空文字 */
export function renderTemplate(tpl: string, ctx: { option?: Values; config?: Values }): string {
  return tpl.replace(/\{\{\s*(option|config)\.([A-Za-z0-9_]+)\s*\}\}/g, (_m, scope: 'option' | 'config', key: string) => {
    const v = ctx[scope]?.[key];
    return v === undefined ? '' : String(v);
  });
}

/** 既定値を入れた値の一覧 */
export function withDefaults(fields: FieldDef[], values: Record<string, OptionValue>): Values {
  const out: Values = {};
  for (const f of fields) {
    const v = values[f.id];
    if (v !== undefined && typeof v !== 'object') out[f.id] = v;
    else if (v !== undefined && typeof v === 'object') out[f.id] = v.expression;
    else if (f.default !== undefined) out[f.id] = f.default;
    else out[f.id] = f.type === 'boolean' ? false : '';
  }
  for (const [k, v] of Object.entries(values)) if (!(k in out)) out[k] = typeof v === 'object' ? v.expression : v;
  return out;
}

export type Payload =
  | { kind: 'bytes'; bytes: Uint8Array }
  | { kind: 'http'; method: string; url: string; headers: Record<string, string>; body?: string }
  | { kind: 'builtin'; name: string };

export class PayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayloadError';
  }
}

export function buildPayload(def: DriverDefinition, action: ActionDef, option: Values, config: Values): Payload {
  const send = action.send;
  const ctx = { option, config };
  try {
    switch (send.kind) {
      case 'builtin':
        return { kind: 'builtin', name: send.name };
      case 'bytes': {
        const data = renderTemplate(send.data, ctx);
        const body = send.encoding === 'hex' ? parseHex(data) : unescapeText(data);
        const term = send.terminator ? unescapeText(renderTemplate(send.terminator, ctx)) : new Uint8Array(0);
        if (body.length === 0 && term.length === 0) throw new PayloadError('送る内容が空です');
        return { kind: 'bytes', bytes: concat(body, term) };
      }
      case 'osc': {
        const args: OscArg[] = [];
        for (const a of send.args) {
          const arg = oscArgFrom(renderTemplate(a.type, ctx), renderTemplate(a.value, ctx));
          if (arg) args.push(arg);
        }
        return { kind: 'bytes', bytes: encodeOscMessage(renderTemplate(send.address, ctx), args) };
      }
      case 'http': {
        const base = String(config.baseUrl ?? '').replace(/\/+$/, '');
        if (!/^https?:\/\//.test(base)) throw new PayloadError('URL の先頭（http://…）を機器の設定で入れてください');
        const path = renderTemplate(send.path, ctx);
        const method = renderTemplate(send.method, ctx).toUpperCase() || 'GET';
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(send.headers ?? {})) headers[k] = renderTemplate(v, ctx);
        const body = method === 'GET' ? undefined : renderTemplate(send.body ?? '', ctx);
        if (body !== undefined && send.contentType) headers['Content-Type'] = renderTemplate(send.contentType, ctx);
        return { kind: 'http', method, url: base + (path.startsWith('/') || path === '' ? path : `/${path}`), headers, body };
      }
    }
  } catch (e) {
    if (e instanceof BytesError || e instanceof PayloadError) throw new PayloadError(e.message);
    throw e;
  }
  throw new PayloadError(`${def.name} の送信形式が不明です`);
}

/* ---------- 状態表示 ---------- */

export function compare(op: string, a: string, b: string): boolean {
  const na = Number(a);
  const nb = Number(b);
  const numeric = a.trim() !== '' && b.trim() !== '' && Number.isFinite(na) && Number.isFinite(nb);
  switch (op as CompareOp) {
    case 'eq':
      return numeric ? na === nb : a === b;
    case 'neq':
      return numeric ? na !== nb : a !== b;
    case 'contains':
      return b !== '' && a.includes(b);
    case 'gt':
      return numeric && na > nb;
    case 'lt':
      return numeric && na < nb;
    case 'gte':
      return numeric && na >= nb;
    case 'lte':
      return numeric && na <= nb;
    default:
      return false;
  }
}

export function checkFeedback(fb: FeedbackDef, option: Values, values: Record<string, string> | undefined): boolean {
  const ctx = { option };
  const variable = renderTemplate(fb.compare.variable, ctx);
  const op = renderTemplate(fb.compare.op, ctx);
  const expected = renderTemplate(fb.compare.value, ctx);
  return compare(op, values?.[variable] ?? '', expected);
}

/* ---------- 受信 ---------- */

/** 受信を区切って規則を当て、変数の更新を返す。TCP は行がまたがるのでバッファを持つ */
export class ReceiveParser {
  private buffer = '';
  private readonly rules: { re: RegExp; set: ReceiveRule['set'] }[];

  constructor(private readonly def: DriverDefinition) {
    this.rules = (def.receive ?? []).flatMap((r) => {
      try {
        return [{ re: new RegExp(r.match, r.flags), set: r.set }];
      } catch {
        return [];
      }
    });
  }

  feed(bytes: Uint8Array): { updates: Record<string, string>; items: string[] } {
    const text = utf8Decode(bytes);
    const items: string[] = [];
    if ((this.def.receiveSplit ?? 'line') === 'line') {
      this.buffer += text;
      const parts = this.buffer.split(/\r\n|\n|\r/);
      this.buffer = parts.pop() ?? '';
      if (this.buffer.length > 8192) this.buffer = this.buffer.slice(-8192);
      for (const p of parts) if (p !== '') items.push(p);
    } else {
      items.push(text.replace(/[\r\n]+$/, ''));
    }
    const updates: Record<string, string> = {};
    for (const item of items) {
      for (const r of this.rules) {
        const m = r.re.exec(item);
        if (!m) continue;
        for (const s of r.set) updates[s.variable] = s.value.replace(/\$(\d)/g, (_x, d: string) => m[Number(d)] ?? '');
      }
    }
    return { updates, items };
  }
}

/* ---------- 要約 ---------- */

export function summarize(tpl: string | undefined, option: Values): string {
  if (!tpl) return '';
  return renderTemplate(tpl, { option }).trim();
}
