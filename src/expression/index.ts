/**
 * 式（SPEC 6 章「式」）：独自のパーサーで、eval・Function を使わない。
 * - 値：数値・文字列（'…' または "…"）・真偽（true / false）・変数 $(scope:name)
 * - 演算：+ - * / %、比較 == != < <= > >=、論理 && || !、三項 a ? b : c、括弧
 *   + は片方が文字列なら連結。比較は両方が数値に見えれば数値で比べる
 * - 関数：round floor ceil abs min max concat includes toUpper toLower secondsToTimecode timecodeToSeconds
 */

export type Value = number | string | boolean;

export class ExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpressionError';
  }
}

type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'var'; scope: string; name: string }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string };

const OPS = ['&&', '||', '==', '!=', '<=', '>=', '+', '-', '*', '/', '%', '<', '>', '!', '?', ':', '(', ')', ','];

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new ExpressionError(`数字が読めません（${i + 1} 文字目）`);
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) {
          s += src[j + 1];
          j += 2;
          continue;
        }
        s += src[j];
        j++;
      }
      if (j >= src.length) throw new ExpressionError('文字列の終わりの引用符がありません');
      out.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (c === '$' && src[i + 1] === '(') {
      const end = src.indexOf(')', i);
      if (end < 0) throw new ExpressionError('変数の ) がありません');
      const inner = src.slice(i + 2, end);
      const k = inner.indexOf(':');
      if (k < 0) throw new ExpressionError(`変数は $(種類:名前) の形で書きます：$(${inner})`);
      out.push({ t: 'var', scope: inner.slice(0, k).trim(), name: inner.slice(k + 1).trim() });
      i = end + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ t: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new ExpressionError(`使えない記号です：${c}`);
    out.push({ t: 'op', v: op });
    i += op.length;
  }
  return out;
}

export type Node =
  | { k: 'lit'; v: Value }
  | { k: 'var'; scope: string; name: string }
  | { k: 'un'; op: string; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'tern'; c: Node; a: Node; b: Node }
  | { k: 'call'; fn: string; args: Node[] };

const PREC: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};

export function parse(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => {
    const t = toks[p];
    return t?.t === 'op' && t.v === v;
  };
  const expect = (v: string) => {
    if (!isOp(v)) throw new ExpressionError(`「${v}」が必要です`);
    p++;
  };

  function primary(): Node {
    const t = peek();
    if (!t) throw new ExpressionError('式が途中で終わっています');
    p++;
    if (t.t === 'num') return { k: 'lit', v: t.v };
    if (t.t === 'str') return { k: 'lit', v: t.v };
    if (t.t === 'var') return { k: 'var', scope: t.scope, name: t.name };
    if (t.t === 'id') {
      if (t.v === 'true') return { k: 'lit', v: true };
      if (t.v === 'false') return { k: 'lit', v: false };
      if (!FUNCTIONS[t.v]) throw new ExpressionError(`知らない名前です：${t.v}`);
      expect('(');
      const args: Node[] = [];
      if (!isOp(')')) {
        args.push(ternary());
        while (isOp(',')) {
          p++;
          args.push(ternary());
        }
      }
      expect(')');
      return { k: 'call', fn: t.v, args };
    }
    if (t.v === '(') {
      const n = ternary();
      expect(')');
      return n;
    }
    if (t.v === '-' || t.v === '!' || t.v === '+') return { k: 'un', op: t.v, a: unary() };
    throw new ExpressionError(`ここに「${t.v}」は置けません`);
  }

  function unary(): Node {
    return primary();
  }

  function binary(min: number): Node {
    let left = unary();
    for (;;) {
      const t = peek();
      if (!t || t.t !== 'op') break;
      const prec = PREC[t.v];
      if (prec === undefined || prec < min) break;
      p++;
      const right = binary(prec + 1);
      left = { k: 'bin', op: t.v, a: left, b: right };
    }
    return left;
  }

  function ternary(): Node {
    const c = binary(1);
    if (isOp('?')) {
      p++;
      const a = ternary();
      expect(':');
      const b = ternary();
      return { k: 'tern', c, a, b };
    }
    return c;
  }

  if (toks.length === 0) throw new ExpressionError('式が空です');
  const n = ternary();
  if (p < toks.length) throw new ExpressionError('式の後ろに余分なものがあります');
  return n;
}

/* ---------- 評価 ---------- */

export function toNumber(v: Value): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(v.trim());
  return v.trim() === '' ? 0 : n;
}

export function toBool(v: Value): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  const s = v.trim().toLowerCase();
  return s !== '' && s !== '0' && s !== 'false' && s !== 'off';
}

export function toText(v: Value): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  return String(v);
}

function numeric(v: Value): boolean {
  if (typeof v === 'number') return true;
  if (typeof v === 'boolean') return false;
  return v.trim() !== '' && Number.isFinite(Number(v));
}

function pad(n: number, w = 2): string {
  return String(Math.trunc(n)).padStart(w, '0');
}

export function secondsToTimecode(sec: number): string {
  const neg = sec < 0;
  const s = Math.abs(Math.floor(sec));
  const t = `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`;
  return neg ? `-${t}` : t;
}

export function timecodeToSeconds(tc: string): number {
  const parts = tc
    .trim()
    .split(':')
    .map((x) => Number(x));
  if (parts.some((x) => !Number.isFinite(x))) return NaN;
  return parts.reduce((acc, x) => acc * 60 + x, 0);
}

const FUNCTIONS: Record<string, (args: Value[]) => Value> = {
  round: ([a, d]) => {
    const k = 10 ** toNumber(d ?? 0);
    return Math.round(toNumber(a ?? 0) * k) / k;
  },
  floor: ([a]) => Math.floor(toNumber(a ?? 0)),
  ceil: ([a]) => Math.ceil(toNumber(a ?? 0)),
  abs: ([a]) => Math.abs(toNumber(a ?? 0)),
  min: (args) => Math.min(...args.map(toNumber)),
  max: (args) => Math.max(...args.map(toNumber)),
  concat: (args) => args.map(toText).join(''),
  includes: ([a, b]) => toText(a ?? '').includes(toText(b ?? '')),
  toUpper: ([a]) => toText(a ?? '').toUpperCase(),
  toLower: ([a]) => toText(a ?? '').toLowerCase(),
  secondsToTimecode: ([a]) => secondsToTimecode(toNumber(a ?? 0)),
  timecodeToSeconds: ([a]) => timecodeToSeconds(toText(a ?? '')),
};

export type VarLookup = (scope: string, name: string) => string | undefined;

export function evaluate(node: Node, lookup: VarLookup): Value {
  switch (node.k) {
    case 'lit':
      return node.v;
    case 'var': {
      const v = lookup(node.scope, node.name);
      if (v === undefined) throw new ExpressionError(`変数がありません：$(${node.scope}:${node.name})`);
      return v;
    }
    case 'un': {
      const a = evaluate(node.a, lookup);
      if (node.op === '!') return !toBool(a);
      if (node.op === '-') return -toNumber(a);
      return toNumber(a);
    }
    case 'tern':
      return toBool(evaluate(node.c, lookup)) ? evaluate(node.a, lookup) : evaluate(node.b, lookup);
    case 'call':
      return FUNCTIONS[node.fn]!(node.args.map((a) => evaluate(a, lookup)));
    case 'bin': {
      if (node.op === '&&') return toBool(evaluate(node.a, lookup)) && toBool(evaluate(node.b, lookup));
      if (node.op === '||') return toBool(evaluate(node.a, lookup)) || toBool(evaluate(node.b, lookup));
      const a = evaluate(node.a, lookup);
      const b = evaluate(node.b, lookup);
      const nums = numeric(a) && numeric(b);
      switch (node.op) {
        case '+':
          return nums ? toNumber(a) + toNumber(b) : toText(a) + toText(b);
        case '-':
          return toNumber(a) - toNumber(b);
        case '*':
          return toNumber(a) * toNumber(b);
        case '/': {
          const d = toNumber(b);
          if (d === 0) throw new ExpressionError('0 で割れません');
          return toNumber(a) / d;
        }
        case '%': {
          const d = toNumber(b);
          if (d === 0) throw new ExpressionError('0 で割れません');
          return toNumber(a) % d;
        }
        case '==':
          return nums ? toNumber(a) === toNumber(b) : toText(a) === toText(b);
        case '!=':
          return nums ? toNumber(a) !== toNumber(b) : toText(a) !== toText(b);
        case '<':
          return nums ? toNumber(a) < toNumber(b) : toText(a) < toText(b);
        case '<=':
          return nums ? toNumber(a) <= toNumber(b) : toText(a) <= toText(b);
        case '>':
          return nums ? toNumber(a) > toNumber(b) : toText(a) > toText(b);
        case '>=':
          return nums ? toNumber(a) >= toNumber(b) : toText(a) >= toText(b);
        default:
          throw new ExpressionError(`知らない演算です：${node.op}`);
      }
    }
  }
}

/** 式の中の変数（依存関係を調べる・循環を見つけるため） */
export function variablesOf(node: Node): { scope: string; name: string }[] {
  switch (node.k) {
    case 'var':
      return [{ scope: node.scope, name: node.name }];
    case 'un':
      return variablesOf(node.a);
    case 'bin':
      return [...variablesOf(node.a), ...variablesOf(node.b)];
    case 'tern':
      return [...variablesOf(node.c), ...variablesOf(node.a), ...variablesOf(node.b)];
    case 'call':
      return node.args.flatMap(variablesOf);
    default:
      return [];
  }
}

const cache = new Map<string, Node | ExpressionError>();

/** 文字列の式を評価（パース結果は覚えておく）。失敗は ExpressionError */
export function evalExpression(src: string, lookup: VarLookup): Value {
  let n = cache.get(src);
  if (!n) {
    try {
      n = parse(src);
    } catch (e) {
      n = e instanceof ExpressionError ? e : new ExpressionError(String(e));
    }
    if (cache.size > 500) cache.clear();
    cache.set(src, n);
  }
  if (n instanceof ExpressionError) throw n;
  return evaluate(n, lookup);
}
