import type { OptionValue } from '@/model/types';
import { BytesError, concat, parseHex, unescapeText, utf8Decode } from './bytes';
import { encodeOscMessage, oscArgFrom, type OscArg } from './osc';
import type { ActionDef, CompareOp, DeriveRule, DriverDefinition, FeedbackDef, FieldDef, ReceiveRule, SendTemplate } from './types';

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

/**
 * `{{option.x}}` `{{config.x}}` を置き換える。無い名前は空文字。
 * フィルタ（左から順）：
 *   |map            … 動作の maps[x][値]（選択肢ごとに送る中身が違う時）
 *   |padN           … 0 埋めで N 桁
 *   |lin:a:b        … a×値＋b
 *   |hexu |hexl     … 数を 16 進の文字に（大文字・小文字）
 *   |hexstr         … 文字列を UTF-8 の 16 進に
 *   |u8 |u16be |u16le |i16be |u32be |u32le |f32be … 数を 16 進のバイト列に
 * 変換の仕組み（kajisho5/conductor-drivers の tools/render.mjs）と同じ規則。
 */
const TOKEN = /\{\{\s*(option|config)\.([A-Za-z0-9_\-]+)((?:\|[a-z0-9]+(?::-?[0-9.e+-]+)*)*)\s*\}\}/g;

export type TemplateMaps = Record<string, Record<string, string>>;

export function formatNumber(x: number): string {
  if (!Number.isFinite(x)) return '0';
  const r = Math.round(x * 1e6) / 1e6;
  return Object.is(r, -0) ? '0' : String(r);
}

function hexOfBytes(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function intBytes(n: string, size: number, little: boolean, signed: boolean): number[] {
  let v = Math.trunc(Number(n));
  if (!Number.isFinite(v)) v = 0;
  const max = 2 ** (size * 8);
  if (signed && v < 0) v += max;
  v = ((v % max) + max) % max;
  const out: number[] = [];
  for (let i = size - 1; i >= 0; i--) out.push(Math.floor(v / 2 ** (i * 8)) & 0xff);
  return little ? out.reverse() : out;
}

export function applyFilter(s: string, filter: string, mapping?: Record<string, string>): string {
  const lin = /^lin:(-?[0-9.e+-]+):(-?[0-9.e+-]+)$/.exec(filter);
  if (lin) return formatNumber(Number(s) * Number(lin[1]) + Number(lin[2]));
  // Roland の 2 バイト値：round(値 × 倍率) を 14 ビットの 2 の補数にして上位・下位 7 ビット（10 進の数を返す。|hexu|pad2 で 16 進 2 桁に）
  const r14 = /^r14([hl]):(-?[0-9.e+-]+)$/.exec(filter);
  if (r14) {
    const n = Math.round(Number(s) * Number(r14[2])) & 0x3fff;
    return String(r14[1] === 'h' ? (n >> 7) & 0x7f : n & 0x7f);
  }
  // Roland の 1 バイトの符号付き値（7 ビットの 2 の補数）
  if (filter === 's7') return String(Math.round(Number(s)) & 0x7f);
  const pad = /^pad(\d+)$/.exec(filter);
  if (pad) {
    const neg = s.startsWith('-');
    const body = neg ? s.slice(1) : s;
    return (neg ? '-' : '') + body.padStart(Number(pad[1]), '0');
  }
  switch (filter) {
    case 'map':
      return mapping && Object.prototype.hasOwnProperty.call(mapping, s) ? mapping[s]! : '';
    case 'hexu':
    case 'hexl': {
      const n = Math.trunc(Number(s));
      const h = (Number.isFinite(n) && n > 0 ? n : 0).toString(16);
      return filter === 'hexu' ? h.toUpperCase() : h;
    }
    case 'hexstr':
      return hexOfBytes(new TextEncoder().encode(s));
    case 'u8':
      return hexOfBytes(intBytes(s, 1, false, false));
    case 'u16be':
      return hexOfBytes(intBytes(s, 2, false, false));
    case 'u16le':
      return hexOfBytes(intBytes(s, 2, true, false));
    case 'i16be':
      return hexOfBytes(intBytes(s, 2, false, true));
    case 'u32be':
      return hexOfBytes(intBytes(s, 4, false, false));
    case 'u32le':
      return hexOfBytes(intBytes(s, 4, true, false));
    case 'f32be': {
      const b = new Uint8Array(4);
      new DataView(b.buffer).setFloat32(0, Number(s), false);
      return hexOfBytes(b);
    }
    default:
      return s;
  }
}

export function renderTemplate(tpl: string, ctx: { option?: Values; config?: Values; maps?: TemplateMaps }): string {
  return tpl.replace(TOKEN, (_m, scope: 'option' | 'config', key: string, filters: string) => {
    const v = ctx[scope]?.[key];
    let s = v === undefined ? '' : String(v);
    for (const f of filters.split('|').filter(Boolean)) s = applyFilter(s, f, scope === 'option' ? ctx.maps?.[key] : undefined);
    return s;
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
  return buildSendPayload(def, action.send, { option, config, maps: action.maps });
}

/** 動作で送るもの全部（send と more）。順に送る */
export function buildPayloads(def: DriverDefinition, action: ActionDef, option: Values, config: Values): Payload[] {
  const ctx = { option, config, maps: action.maps };
  return [action.send, ...(action.more ?? [])].map((send) => buildSendPayload(def, send, ctx));
}

function buildSendPayload(def: DriverDefinition, send: SendTemplate, ctx: { option: Values; config: Values; maps?: TemplateMaps }): Payload {
  const config = ctx.config;
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
    case 'bits': {
      const va = parseInt(a, 16);
      const mask = Number(b);
      return Number.isFinite(va) && Number.isFinite(mask) && (va & mask) !== 0;
    }
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

/** 変数の更新に derive を当てて、作られる変数も足す（元の更新は残す） */
export function applyDerive(rules: DeriveRule[] | undefined, updates: Record<string, string>): Record<string, string> {
  if (!rules || rules.length === 0) return updates;
  const out = { ...updates };
  for (const r of rules) {
    const v = updates[r.from];
    if (v === undefined) continue;
    const key = r.map ? v.toUpperCase() : v;
    out[r.variable] = r.map ? (r.map[key] ?? r.map[v] ?? r.default ?? v) : v;
  }
  return out;
}

/* ---------- 要約 ---------- */

export function summarize(tpl: string | undefined, option: Values): string {
  if (!tpl) return '';
  return renderTemplate(tpl, { option }).trim();
}
