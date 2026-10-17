import { utf8Decode, utf8Encode } from './bytes';
import { applyDerive } from './engine';
import type { Session, SessionIO, SendResult } from './sessions';

/**
 * OSEE GoStream シリーズ（Deck / Deck Plus / Duet / Duet 8 ISO / Omni 12 ISO、TCP 19010）の通信手順（SPEC 8.5）。
 * 根拠：
 * - 公開 OSS「companion-module-osee-gostream-series」（MIT）を conductor-drivers の Actions で動かして記録した送信
 *   （先頭 EB A6・種別 00・長さ（2 バイト LE）・JSON・CRC-16/MODBUS（2 バイト LE））【確認済：OSS の送信】
 * - オーナーの別アプリ kajisho5/osee_control_software（cutline）の packetCodec / streamDecoder / session の実装
 *   （同じ OSS と各機種の説明書が根拠。Duet 8 ISO の実機で使用）
 * 公式アプリの通信の解析はしていない。値の形式は【推測】を含むので、ログ（詳細）で確かめる。
 *
 * 定義の動作は JSON（{"id":…,"type":"set","value":[…]}）を 1 行に 1 つ書く。ここで枠と CRC を付けて送る。
 * 受け取った JSON は変数にする：value が 2 つ以上で先頭が番号なら `id_番号`、それ以外は `id`（値は , でつなぐ）。
 */

export const OSEE_PORT = 19010;
const HEAD0 = 0xeb;
const HEAD1 = 0xa6;
const PROTO_JSON = 0x00;
const PROTO_BINARY = 0x03;
const HEADER = 5;
const CRC = 2;

export const OSEE_TIMING = {
  /** これだけ静かなら version を問い合わせる（cutline と同じ） */
  idleProbeMs: 10000,
  /** これだけ何も届かなければ接続し直す */
  deadMs: 16000,
} as const;

/** 番号つきの値（[番号, 値…]）で届くもの。`id_番号` の変数にする */
const INDEXED = new Set([
  'keyOnAir',
  'keyEnable',
  'keyType',
  'dskOnAir',
  'dskEnable',
  'audioMixerEnable',
  'audioMixerFader',
  'shortName',
  'macroInfo',
  'liveStreamOutputEnable',
  'playStatus',
  'playPause',
  'still',
  'mediaPlayer',
  'outSource',
  'auxType',
  'multiSourceWindowSource',
  'multiSourceWindowEnable',
]);

const TABLE = (() => {
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? (c >>> 1) ^ 0xa001 : c >>> 1;
    t[i] = c;
  }
  return t;
})();

/** CRC-16/MODBUS（多項式 0xA001・初期値 0xFFFF） */
export function crc16Modbus(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let crc = 0xffff;
  for (let i = start; i < end; i++) crc = (crc >>> 8) ^ TABLE[(crc ^ bytes[i]!) & 0xff]!;
  return crc & 0xffff;
}

export interface OseeCommand {
  id: string;
  type: 'get' | 'set' | 'pus' | 'res';
  value?: (number | string | boolean)[];
}

/** JSON の命令 → 枠つきのバイト列 */
export function encodeOsee(cmd: OseeCommand): Uint8Array {
  const body: OseeCommand = { id: cmd.id, type: cmd.type };
  if (cmd.value !== undefined) body.value = cmd.value;
  const json = utf8Encode(JSON.stringify(body));
  const out = new Uint8Array(HEADER + json.length + CRC);
  out[0] = HEAD0;
  out[1] = HEAD1;
  out[2] = PROTO_JSON;
  const len = json.length + CRC;
  out[3] = len & 0xff;
  out[4] = (len >> 8) & 0xff;
  out.set(json, HEADER);
  const crc = crc16Modbus(out, 0, HEADER + json.length);
  out[HEADER + json.length] = crc & 0xff;
  out[HEADER + json.length + 1] = (crc >> 8) & 0xff;
  return out;
}

function isCommand(v: unknown): v is OseeCommand {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.type === 'string' && (o.value === undefined || Array.isArray(o.value));
}

/** 定義の動作の文字（JSON を 1 行に 1 つ）→ 命令の一覧。読めない行があればエラー */
export function parseOseeText(text: string): OseeCommand[] {
  const out: OseeCommand[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    let v: unknown;
    try {
      v = JSON.parse(t);
    } catch {
      throw new Error(`命令の形が違います：${t.slice(0, 60)}`);
    }
    if (!isCommand(v)) throw new Error(`命令に id と type がありません：${t.slice(0, 60)}`);
    out.push(v);
  }
  return out;
}

/** 受信のバイト列から枠を切り出す（くっついた・分かれた・壊れたデータも扱う） */
export class OseeDecoder {
  private buf = new Uint8Array(0);
  crcErrors = 0;

  push(chunk: Uint8Array): OseeCommand[] {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf);
    merged.set(chunk, this.buf.length);
    let b = merged;
    let i = 0;
    const out: OseeCommand[] = [];
    while (b.length - i >= 2) {
      if (b[i] !== HEAD0 || b[i + 1] !== HEAD1) {
        i++;
        continue;
      }
      if (b.length - i < HEADER) break;
      const proto = b[i + 2];
      const len = b[i + 3]! | (b[i + 4]! << 8);
      if ((proto !== PROTO_JSON && proto !== PROTO_BINARY) || len < CRC) {
        i++;
        continue;
      }
      const total = HEADER + len;
      if (b.length - i < total) break;
      const crcPos = i + total - CRC;
      const crc = b[crcPos]! | (b[crcPos + 1]! << 8);
      if (crc !== crc16Modbus(b, i, crcPos)) {
        this.crcErrors++;
        i++;
        continue;
      }
      if (proto === PROTO_JSON) {
        try {
          const v: unknown = JSON.parse(utf8Decode(b.subarray(i + HEADER, crcPos)));
          if (isCommand(v)) out.push(v);
        } catch {
          // 読めない JSON は飛ばす
        }
      }
      i += total;
    }
    // 先頭が EB で終わっていたら次と合わせる
    this.buf = b.slice(i);
    b = this.buf;
    return out;
  }
}

function valueText(v: number | string | boolean): string {
  if (typeof v === 'boolean') return v ? '1' : '0';
  return String(v);
}

/** 届いた命令 → 変数（番号つきは id_番号）。真偽は 1 / 0 にそろえる */
export function oseeValues(cmd: OseeCommand): Record<string, string> {
  const v = cmd.value ?? [];
  if (v.length >= 2 && INDEXED.has(cmd.id)) {
    return { [`${cmd.id}_${valueText(v[0]!)}`]: v.slice(1).map(valueText).join(',') };
  }
  return { [cmd.id]: v.map(valueText).join(',') };
}

/** 接続した直後に問い合わせるもの（cutline の deviceInfoPlan・statePlan の主なもの） */
export function oseeSyncPlan(): OseeCommand[] {
  const get = (id: string, value?: (number | string)[]): OseeCommand => (value ? { id, type: 'get', value } : { id, type: 'get' });
  const plan = [
    'deviceType',
    'deviceName',
    'version',
    'inputList',
    'keyCount',
    'dskCount',
    'playCount',
    'pgmIndex',
    'pvwIndex',
    'previewTransition',
    'transitionStatus',
    'transitionStyle',
    'transitionMixRate',
    'transitionDipRate',
    'transitionWipeRate',
    'ftbStatus',
    'ftbRate',
    'ftbAfv',
    'pgmTally',
    'pvwTally',
    'recordStatus',
    'liveStreamOutputStatus',
    'live',
    'audioMixerSwitchType',
  ].map((id) => get(id));
  for (let i = 0; i < 4; i++) plan.push(get('keyOnAir', [i]), get('keyEnable', [i]));
  for (let i = 0; i < 2; i++) plan.push(get('dskOnAir', [i]), get('dskEnable', [i]));
  for (let i = 0; i < 3; i++) plan.push(get('liveStreamOutputEnable', [i]));
  return plan;
}

export class OseeSession implements Session {
  private readonly decoder = new OseeDecoder();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastRx = Date.now();
  private probing = false;

  constructor(private readonly io: SessionIO) {}

  ready(): void {
    this.io.setStatus('connected');
    this.lastRx = Date.now();
    // 状態を一度に問い合わせる（1 回の書き込みにまとめる）
    const plan = oseeSyncPlan().map(encodeOsee);
    const all = new Uint8Array(plan.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of plan) {
      all.set(p, o);
      o += p.length;
    }
    void this.io.write(all).catch(() => undefined);
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.watch(), 1000);
  }

  private watch(): void {
    const idle = Date.now() - this.lastRx;
    if (idle > OSEE_TIMING.deadMs) {
      this.io.fail('本体から応答がありません');
      return;
    }
    if (idle > OSEE_TIMING.idleProbeMs && !this.probing) {
      this.probing = true;
      void this.io.write(encodeOsee({ id: 'version', type: 'get' })).catch(() => undefined);
    }
  }

  data(bytes: Uint8Array): void {
    this.lastRx = Date.now();
    this.probing = false;
    const cmds = this.decoder.push(bytes);
    if (cmds.length === 0) return;
    const updates: Record<string, string> = {};
    for (const c of cmds) Object.assign(updates, oseeValues(c));
    const all = applyDerive(this.io.def.derive, updates);
    if (Object.keys(all).length) this.io.setValues(all);
  }

  async send(bytes: Uint8Array): Promise<SendResult> {
    let cmds: OseeCommand[];
    try {
      cmds = parseOseeText(utf8Decode(bytes));
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
    if (cmds.length === 0) return { ok: false, reason: '送る命令がありません' };
    try {
      for (const c of cmds) {
        this.io.log('debug', `送信 ${JSON.stringify(c)}`);
        await this.io.write(encodeOsee(c));
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
