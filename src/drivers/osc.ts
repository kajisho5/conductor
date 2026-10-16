import { BytesError, concat, utf8Encode } from './bytes';

/**
 * OSC 1.0 のメッセージ（SPEC 8.1）。
 * 文字列は NUL 終端して 4 バイト境界まで詰める。int32・float32 はビッグエンディアン。T / F は値なし。
 * 根拠：The Open Sound Control 1.0 Specification（opensoundcontrol.stanford.edu/spec-1_0.html）
 */

export type OscArg =
  { type: 'i'; value: number } | { type: 'f'; value: number } | { type: 's'; value: string } | { type: 'T' } | { type: 'F' };

function oscString(s: string): Uint8Array {
  const raw = utf8Encode(s);
  const len = Math.ceil((raw.length + 1) / 4) * 4;
  const out = new Uint8Array(len);
  out.set(raw);
  return out;
}

export function encodeOscMessage(address: string, args: OscArg[]): Uint8Array {
  if (!address.startsWith('/')) throw new BytesError('OSC のアドレスは / で始めてください');
  const tags = ',' + args.map((a) => a.type).join('');
  const parts: Uint8Array[] = [oscString(address), oscString(tags)];
  for (const a of args) {
    if (a.type === 'i') {
      const b = new Uint8Array(4);
      new DataView(b.buffer).setInt32(0, Math.trunc(a.value), false);
      parts.push(b);
    } else if (a.type === 'f') {
      const b = new Uint8Array(4);
      new DataView(b.buffer).setFloat32(0, a.value, false);
      parts.push(b);
    } else if (a.type === 's') {
      parts.push(oscString(a.value));
    }
  }
  return concat(...parts);
}

/** 型と値の文字列から引数を作る。型が none・空なら引数なし */
export function oscArgFrom(type: string, value: string): OscArg | null {
  switch (type) {
    case 'i': {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new BytesError(`整数に直せません：${value}`);
      return { type: 'i', value: Math.trunc(n) };
    }
    case 'f': {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new BytesError(`小数に直せません：${value}`);
      return { type: 'f', value: n };
    }
    case 's':
      return { type: 's', value };
    case 'T':
      return { type: 'T' };
    case 'F':
      return { type: 'F' };
    default:
      return null;
  }
}

/** モック・テスト用の簡単な解読（int・float・string・T・F だけ） */
export function decodeOscMessage(b: Uint8Array): { address: string; args: (number | string | boolean)[] } {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 0;
  const readStr = () => {
    let end = o;
    while (end < b.length && b[end] !== 0) end++;
    const s = String.fromCharCode(...b.slice(o, end));
    o = Math.ceil((end + 1) / 4) * 4;
    return s;
  };
  const address = readStr();
  const tags = readStr();
  const args: (number | string | boolean)[] = [];
  for (const t of tags.slice(1)) {
    if (t === 'i') {
      args.push(view.getInt32(o, false));
      o += 4;
    } else if (t === 'f') {
      args.push(view.getFloat32(o, false));
      o += 4;
    } else if (t === 's') args.push(readStr());
    else if (t === 'T') args.push(true);
    else if (t === 'F') args.push(false);
  }
  return { address, args };
}
