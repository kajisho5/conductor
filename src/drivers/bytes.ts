/**
 * バイト列の組み立て・変換（エンジン用）。Hermes の実装差に左右されないよう UTF-8・Base64 は自前で持つ。
 */

export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return Uint8Array.from(out);
}

/** 壊れた並びは U+FFFD にする */
export function utf8Decode(b: Uint8Array): string {
  let s = '';
  let i = 0;
  while (i < b.length) {
    const c = b[i]!;
    let cp = 0xfffd;
    let n = 1;
    if (c < 0x80) cp = c;
    else if (c >= 0xc0 && c < 0xe0 && i + 1 < b.length) {
      cp = ((c & 0x1f) << 6) | (b[i + 1]! & 0x3f);
      n = 2;
    } else if (c >= 0xe0 && c < 0xf0 && i + 2 < b.length) {
      cp = ((c & 0x0f) << 12) | ((b[i + 1]! & 0x3f) << 6) | (b[i + 2]! & 0x3f);
      n = 3;
    } else if (c >= 0xf0 && i + 3 < b.length) {
      cp = ((c & 0x07) << 18) | ((b[i + 1]! & 0x3f) << 12) | ((b[i + 2]! & 0x3f) << 6) | (b[i + 3]! & 0x3f);
      n = 4;
    }
    s += String.fromCodePoint(cp);
    i += n;
  }
  return s;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i]! << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    s += i + 1 < b.length ? B64[(n >> 6) & 63]! : '=';
    s += i + 2 < b.length ? B64[n & 63]! : '=';
  }
  return s;
}

export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i] ?? 'A');
    const b = B64.indexOf(clean[i + 1] ?? 'A');
    const c = clean[i + 2] !== undefined ? B64.indexOf(clean[i + 2]!) : -1;
    const d = clean[i + 3] !== undefined ? B64.indexOf(clean[i + 3]!) : -1;
    const n = (a << 18) | (b << 12) | ((c < 0 ? 0 : c) << 6) | (d < 0 ? 0 : d);
    out.push((n >> 16) & 255);
    if (c >= 0) out.push((n >> 8) & 255);
    if (d >= 0) out.push(n & 255);
  }
  return Uint8Array.from(out);
}

export class BytesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BytesError';
  }
}

/** 文字の送信内容：\r \n \t \\ \xNN を解釈して UTF-8 にする（SPEC 8.1） */
export function unescapeText(s: string): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    if (ch === '\\' && i + 1 < s.length) {
      const n = s[i + 1]!;
      if (n === 'r') {
        out.push(13);
        i += 2;
        continue;
      }
      if (n === 'n') {
        out.push(10);
        i += 2;
        continue;
      }
      if (n === 't') {
        out.push(9);
        i += 2;
        continue;
      }
      if (n === '\\') {
        out.push(92);
        i += 2;
        continue;
      }
      if (n === 'x' && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 2, i + 4))) {
        out.push(parseInt(s.slice(i + 2, i + 4), 16));
        i += 4;
        continue;
      }
    }
    const cp = s.codePointAt(i) ?? 0;
    const chr = String.fromCodePoint(cp);
    out.push(...utf8Encode(chr));
    i += chr.length;
  }
  return Uint8Array.from(out);
}

/** 16 進の文字列（空白・カンマ・0x 可）をバイト列に */
export function parseHex(s: string): Uint8Array {
  const clean = s.replace(/0x/gi, '').replace(/[\s,:-]/g, '');
  if (clean.length === 0) return new Uint8Array(0);
  if (!/^[0-9A-Fa-f]+$/.test(clean)) throw new BytesError('16 進の数字（0–9・A–F）以外が入っています');
  if (clean.length % 2 !== 0) throw new BytesError('16 進は 2 文字ずつ（例：0D 0A）で入力してください');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** ログ表示用：印字できない文字は \xNN にする */
export function printable(b: Uint8Array, max = 200): string {
  const s = utf8Decode(b.slice(0, max));
  const shown = s
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/[\x00-\x1f\x7f]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
  return b.length > max ? `${shown}…（${b.length} バイト）` : shown;
}
