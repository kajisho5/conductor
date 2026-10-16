import { latin1 } from './sessions';

/**
 * Roland の SysEx（USB / Bluetooth MIDI。SPEC 8.5）。
 * LAN の命令 `DTH:aaaaaa,vv…;` `RQH:aaaaaa,ssssss;` を DT1 / RQ1 に置き換えて送り、届いた DT1 は LAN と同じ addr_XXXXXX の変数にする。
 * 形式：F0 41 10 {機種 ID} 12|11 a1 a2 a3 {データ|サイズ 3} sum F7、sum = (128 − (Σ(アドレス＋データ) mod 128)) mod 128
 * 根拠：各機種の Remote Control Guide、kajisho5/crosspoint の SysExCodec とテストベクタ。
 */

export function rolandChecksum(bytes: number[]): number {
  const sum = bytes.reduce((a, b) => a + b, 0);
  return (128 - (sum % 128)) % 128;
}

function addrBytes(addr: number): number[] {
  return [(addr >> 16) & 0x7f, (addr >> 8) & 0x7f, addr & 0x7f];
}

export function dt1(modelId: number[], addr: number, data: number[]): number[] {
  const body = [...addrBytes(addr), ...data.map((d) => d & 0x7f)];
  return [0xf0, 0x41, 0x10, ...modelId, 0x12, ...body, rolandChecksum(body), 0xf7];
}

export function rq1(modelId: number[], addr: number, size: number): number[] {
  const body = [...addrBytes(addr), (size >> 16) & 0x7f, (size >> 8) & 0x7f, size & 0x7f];
  return [0xf0, 0x41, 0x10, ...modelId, 0x11, ...body, rolandChecksum(body), 0xf7];
}

export class SysexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SysexError';
  }
}

/** LAN の命令（1 つ以上、; 区切り）を SysEx の並びにする。DTH / RQH 以外は MIDI では使えない */
export function textToSysex(text: string, modelId: number[]): number[][] {
  const out: number[][] = [];
  for (const raw of text.split(/[;\n]/)) {
    const cmd = raw.trim();
    if (!cmd) continue;
    let m = /^DTH:([0-9A-Fa-f]{6}),((?:[0-9A-Fa-f]{2})+)$/.exec(cmd);
    if (m) {
      const data: number[] = [];
      for (let i = 0; i < m[2]!.length; i += 2) data.push(parseInt(m[2]!.slice(i, i + 2), 16));
      out.push(dt1(modelId, parseInt(m[1]!, 16), data));
      continue;
    }
    m = /^RQH:([0-9A-Fa-f]{6}),([0-9A-Fa-f]{6})$/.exec(cmd);
    if (m) {
      out.push(rq1(modelId, parseInt(m[1]!, 16), parseInt(m[2]!, 16)));
      continue;
    }
    if (/^VER$/.test(cmd)) continue; // LAN の確認用。MIDI では送らない
    throw new SysexError(`USB / Bluetooth MIDI では使えない命令です（${cmd}）。LAN で接続してください`);
  }
  return out;
}

/** 届いた DT1 を addr_XXXXXX の変数へ。他の機種・他のメッセージは null */
export function sysexToValues(bytes: number[], modelId: number[]): Record<string, string> | null {
  const head = 3 + modelId.length;
  if (bytes.length < head + 6 || bytes[0] !== 0xf0 || bytes[1] !== 0x41 || bytes[bytes.length - 1] !== 0xf7) return null;
  for (let i = 0; i < modelId.length; i++) if (bytes[3 + i] !== modelId[i]) return null;
  if (bytes[head] !== 0x12) return null;
  const body = bytes.slice(head + 1, bytes.length - 2);
  if (rolandChecksum(body) !== bytes[bytes.length - 2]) return null;
  let addr = ((body[0] ?? 0) << 16) | ((body[1] ?? 0) << 8) | (body[2] ?? 0);
  const out: Record<string, string> = {};
  for (const d of body.slice(3)) {
    out[`addr_${addr.toString(16).toUpperCase().padStart(6, '0')}`] = d.toString(16).toUpperCase().padStart(2, '0');
    let a2 = (addr & 0x7f) + 1;
    let a1 = (addr >> 8) & 0x7f;
    let a0 = (addr >> 16) & 0x7f;
    if (a2 > 0x7f) {
      a2 = 0;
      a1 += 1;
      if (a1 > 0x7f) {
        a1 = 0;
        a0 = (a0 + 1) & 0x7f;
      }
    }
    addr = (a0 << 16) | (a1 << 8) | a2;
  }
  return out;
}

/** 送る内容（payload のバイト列）を文字にして SysEx へ */
export function payloadToSysex(bytes: Uint8Array, modelId: number[]): number[][] {
  return textToSysex(latin1(bytes), modelId);
}

export function hexModelId(s: string): number[] {
  return s
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((x) => parseInt(x, 16));
}
