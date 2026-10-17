import { utf8Decode } from './bytes';
import { applyDerive, type Values } from './engine';
import type { Session, SessionIO, SendResult } from './sessions';

/**
 * Blackmagic ATEM（UDP 9910）の通信手順（SPEC 8.3）。
 * 根拠：公開 OSS「atem-connection」（MIT、npm 3.10.3）の atemSocketChild・各コマンドの serialize / deserialize。
 * 公式アプリの通信の解析はしていない。実機では未確認なので、ログ（詳細）で確かめる。
 *
 * パケット：12 バイトの頭（フラグ 5 ビット＋長さ 11 ビット、セッション ID、相手への ack 番号、送る側の番号）＋コマンド。
 * コマンド：長さ（2）＋ 0（2）＋ 名前（4 文字）＋ 中身。
 */

export const ATEM_PORT = 9910;

export const PacketFlag = {
  AckRequest: 0x01,
  NewSessionId: 0x02,
  IsRetransmit: 0x04,
  RetransmitRequest: 0x08,
  AckReply: 0x10,
} as const;

/** 接続の最初に送る（atem-connection の COMMAND_CONNECT_HELLO） */
export const HELLO = Uint8Array.from([
  0x10, 0x14, 0x53, 0xab, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3a, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

const MAX_PACKET_ID = 1 << 15;

export const ATEM_TIMING = {
  /** これだけ何も届かなければ接続し直す */
  silenceMs: 5000,
  /** 送ったパケットの ack を待つ時間（届かなければ送り直す） */
  resendMs: 200,
  resendTimes: 3,
} as const;

function u16(b: Uint8Array, o: number): number {
  return ((b[o] ?? 0) << 8) | (b[o + 1] ?? 0);
}

function cstr(b: Uint8Array, start: number, length: number): string {
  const s = b.subarray(start, start + length);
  const end = s.indexOf(0);
  return utf8Decode(end >= 0 ? s.subarray(0, end) : s);
}

export function header(flags: number, length: number, sessionId: number, ackId: number, packetId: number): Uint8Array {
  const h = new Uint8Array(12);
  const v = (flags << 11) | (length & 0x07ff);
  h[0] = (v >> 8) & 0xff;
  h[1] = v & 0xff;
  h[2] = (sessionId >> 8) & 0xff;
  h[3] = sessionId & 0xff;
  h[4] = (ackId >> 8) & 0xff;
  h[5] = ackId & 0xff;
  h[10] = (packetId >> 8) & 0xff;
  h[11] = packetId & 0xff;
  return h;
}

/** コマンド 1 つ（長さ・名前・中身） */
export function command(name: string, body: number[]): Uint8Array {
  const out = new Uint8Array(8 + body.length);
  const len = out.length;
  out[0] = (len >> 8) & 0xff;
  out[1] = len & 0xff;
  for (let i = 0; i < 4; i++) out[4 + i] = name.charCodeAt(i) & 0xff;
  out.set(body, 8);
  return out;
}

export function parseCommands(payload: Uint8Array): { name: string; body: Uint8Array }[] {
  const out: { name: string; body: Uint8Array }[] = [];
  let o = 0;
  while (payload.length - o > 8) {
    const len = u16(payload, o);
    if (len < 8 || o + len > payload.length) break;
    const name = String.fromCharCode(...payload.subarray(o + 4, o + 8));
    out.push({ name, body: payload.subarray(o + 8, o + len) });
    o += len;
  }
  return out;
}

const TALLY_TEXT = ['OFF', 'PGM', 'PST', 'PGM+PST'] as const;
const STYLE_TEXT = ['MIX', 'DIP', 'WIPE', 'DVE', 'STING'] as const;
const KEY_TYPE_TEXT = ['ルマ', 'クロマ', 'パターン', 'DVE'] as const;
const onText = (v: number | undefined) => (v === 1 ? 'ON' : 'OFF');

function streamingText(raw: number): string {
  if (raw & 32) return '停止中';
  if (raw & 4) return 'ON';
  if (raw & 2) return '接続中';
  return 'OFF';
}

/** 受け取ったコマンドを変数へ（me は 0 始まり。ME1 は pgm / pvw、ME2 以降は pgm_me2 など） */
export function commandToValues(name: string, b: Uint8Array, version = 0): Record<string, string> | 'init' | null {
  const me = (n: number) => (n === 0 ? '' : `_me${n + 1}`);
  switch (name) {
    case 'InCm':
      return 'init';
    case '_pin':
      return { model: cstr(b, 0, 40) };
    case '_ver': {
      const v = (((b[0] ?? 0) << 24) >>> 0) + ((b[1] ?? 0) << 16) + u16(b, 2);
      return { protocol_version: `${(v >>> 16) & 0xffff}.${v & 0xffff}` };
    }
    case 'PrgI':
      return { [`pgm${me(b[0] ?? 0)}`]: String(u16(b, 2)) };
    case 'PrvI':
      return { [`pvw${me(b[0] ?? 0)}`]: String(u16(b, 2)) };
    case 'FtbS':
      return { [`ftb${me(b[0] ?? 0)}`]: b[1] === 1 || b[2] === 1 ? 'ON' : 'OFF' };
    case 'FtbP':
      return { [`ftb_rate${me(b[0] ?? 0)}`]: String(b[1] ?? 0) };
    case 'TrSS':
      return {
        [`trans_style${me(b[0] ?? 0)}`]: STYLE_TEXT[b[1] ?? 0] ?? String(b[1]),
        [`trans_next_style${me(b[0] ?? 0)}`]: STYLE_TEXT[b[3] ?? 0] ?? String(b[3]),
        [`trans_next_selection${me(b[0] ?? 0)}`]: String(b[4] ?? 0),
      };
    case 'TrPr':
      return { [`prev_trans${me(b[0] ?? 0)}`]: onText(b[1]) };
    case 'TrPs':
      return {
        [`in_transition${me(b[0] ?? 0)}`]: onText(b[1]),
        [`tbar${me(b[0] ?? 0)}`]: String(Math.round(u16(b, 4) / 100)),
      };
    case 'TMxP':
      return { [`mix_rate${me(b[0] ?? 0)}`]: String(b[1] ?? 0) };
    case 'KeOn':
      return { [`usk_${(b[1] ?? 0) + 1}${me(b[0] ?? 0)}`]: onText(b[2]) };
    case 'KeBP':
      // 上流キーの基本（me・key・type …）。種類だけ使う
      return { [`usk_${(b[1] ?? 0) + 1}_type${me(b[0] ?? 0)}`]: KEY_TYPE_TEXT[b[2] ?? 0] ?? String(b[2]) };
    case 'DskS':
      return { [`dsk_${(b[0] ?? 0) + 1}`]: onText(b[1]), [`dsk_${(b[0] ?? 0) + 1}_in_transition`]: onText(b[2]) };
    case 'DskP':
      return { [`dsk_${(b[0] ?? 0) + 1}_tie`]: onText(b[1]), [`dsk_${(b[0] ?? 0) + 1}_rate`]: String(b[2] ?? 0) };
    case 'AuxS':
      return { [`aux_${(b[0] ?? 0) + 1}`]: String(u16(b, 2)) };
    case 'MRPr':
      return {
        macro_running: (b[0] ?? 0) & 1 ? 'ON' : 'OFF',
        macro_waiting: (b[0] ?? 0) & 2 ? 'ON' : 'OFF',
        macro_loop: onText(b[1] ? 1 : 0),
        macro_running_index: (b[0] ?? 0) & 1 ? String(u16(b, 2) + 1) : '',
      };
    case 'MPCE': {
      const n = (b[0] ?? 0) + 1;
      return { [`mp_${n}_source`]: b[1] === 2 ? `クリップ ${(b[3] ?? 0) + 1}` : `スチル ${(b[2] ?? 0) + 1}` };
    }
    case 'RCPS': {
      const n = (b[0] ?? 0) + 1;
      return { [`mp_${n}_playing`]: onText(b[1]), [`mp_${n}_loop`]: onText(b[2]) };
    }
    case 'RTMS':
      return { recording: u16(b, 0) & 1 ? 'ON' : 'OFF' };
    case 'StRS':
      return { streaming: streamingText(u16(b, 0)) };
    case 'MvIn':
      return { [`mv_${(b[0] ?? 0) + 1}_window_${(b[1] ?? 0) + 1}`]: String(u16(b, 2)) };
    case 'SSBP': {
      const v8 = version >= ATEM_V8_0;
      const box = (v8 ? b[1] : b[0]) ?? 0;
      const enabled = (v8 ? b[2] : b[1]) ?? 0;
      const source = v8 ? u16(b, 4) : u16(b, 2);
      return { [`ssrc_box_${box + 1}`]: onText(enabled), [`ssrc_box_${box + 1}_source`]: String(source) };
    }
    case 'AMIP': {
      const mode = b[8] ?? 0;
      return { [`audio_${u16(b, 0)}`]: mode === 1 ? 'ON' : mode === 2 ? 'AFV' : 'OFF' };
    }
    case 'FASP': {
      const mode = b[49] ?? 0;
      return { [`audio_${u16(b, 0)}`]: mode === 2 ? 'ON' : mode === 4 ? 'AFV' : 'OFF' };
    }
    case 'InPr': {
      const id = u16(b, 0);
      return { [`input_${id}_name`]: cstr(b, 2, 20), [`input_${id}_short`]: cstr(b, 22, 4) };
    }
    case 'TlSr': {
      const count = u16(b, 0);
      const out: Record<string, string> = {};
      for (let i = 0; i < count; i++) {
        const src = u16(b, 2 + i * 3);
        const v = (b[4 + i * 3] ?? 0) & 0x03;
        out[`tally_${src}`] = TALLY_TEXT[v]!;
      }
      return out;
    }
    default:
      return null;
  }
}

function int(v: Values[string] | undefined, def = 0): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : def;
}

/** 動作を組み立てる時に使う、受け取った状態（版・Fairlight の音源 ID・変数） */
export interface AtemContext {
  /** _ver の値（例 0x0002001d）。0 は不明 */
  version: number;
  /** Fairlight の入力番号 → 最初に届いた音源 ID（8 バイト） */
  fairlightSources: Map<number, Uint8Array>;
  values: Record<string, string>;
}

/** DSK の AUTO の中身が変わる版（atem-connection の ProtocolVersion.V8_0_1） */
export const ATEM_V8_0_1 = 0x0002001d;
/** SuperSource の箱の並びが変わる版（ProtocolVersion.V8_0） */
export const ATEM_V8_0 = 0x0002001c;

const EMPTY_CONTEXT: AtemContext = { version: 0, fairlightSources: new Map(), values: {} };

const be16 = (v: number) => [(v >> 8) & 0xff, v & 0xff];
const be32 = (v: number) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];

function bool(v: Values[string] | undefined): boolean {
  return v === true || v === 'true' || v === 'on' || v === 'ON' || v === '1' || v === 1;
}

/** on / off / toggle（toggle は今の変数が ON なら OFF） */
function onOff(v: Values[string] | undefined, current: string | undefined): boolean {
  if (v === 'toggle') return current !== 'ON';
  return bool(v);
}

function clampInt(v: Values[string] | undefined, min: number, max: number, def = min): number {
  return Math.max(min, Math.min(max, int(v, def)));
}

/** 文字を決まった長さのバイトに（UTF-8、余りは 0） */
function fixedText(text: string, length: number): number[] {
  const out = new Array<number>(length).fill(0);
  const b = new TextEncoder().encode(text);
  for (let i = 0; i < Math.min(length, b.length); i++) out[i] = b[i]!;
  return out;
}

const meSuffix = (n: number) => (n === 0 ? '' : `_me${n + 1}`);

/** 動作 → コマンド（中身の並びは atem-connection の serialize と同じ） */
export function buildAtemCommand(name: string, o: Values, ctx: AtemContext = EMPTY_CONTEXT): Uint8Array | null {
  const me = Math.max(0, int(o.me));
  const src = Math.max(0, Math.min(0xffff, int(o.input)));
  const key = Math.max(0, int(o.key, 1) - 1);
  const dsk = Math.max(0, int(o.dsk, 1) - 1);
  const rate = clampInt(o.rate, 1, 250, 25);
  const mp = Math.max(0, int(o.mp, 1) - 1);
  switch (name) {
    case 'atem.pgm':
      return command('CPgI', [me, 0, ...be16(src)]);
    case 'atem.pvw':
      return command('CPvI', [me, 0, ...be16(src)]);
    case 'atem.cut':
      return command('DCut', [me, 0, 0, 0]);
    case 'atem.auto':
      return command('DAut', [me, 0, 0, 0]);
    case 'atem.ftb':
      return command('FtbA', [me, 0, 0, 0]);
    case 'atem.ftbRate':
      return command('FtbC', [1, me, rate, 0]);
    case 'atem.tbar': {
      const pos = Math.round(clampInt(o.position, 0, 100) * 100);
      return command('CTPs', [me, 0, ...be16(pos)]);
    }
    case 'atem.prevTrans':
      return command('CTPr', [me, onOff(o.on, ctx.values[`prev_trans${meSuffix(me)}`]) ? 1 : 0, 0, 0]);
    case 'atem.transStyle':
      return command('CTTp', [1, me, clampInt(o.style, 0, 4), 0]);
    case 'atem.transSelection': {
      let bits = 0;
      if (bool(o.bg)) bits |= 1;
      for (let k = 1; k <= 4; k++) if (bool(o[`key${k}`])) bits |= 1 << k;
      if (bits === 0) bits = 1;
      return command('CTTp', [2, me, 0, bits]);
    }
    case 'atem.transRate': {
      switch (o.style) {
        case 'dip':
          return command('CTDp', [1, me, rate, 0, 0, 0, 0, 0]);
        case 'wipe':
          return command('CTWp', [0, 1, me, rate, ...new Array<number>(16).fill(0)]);
        default:
          return command('CTMx', [me, rate, 0, 0]);
      }
    }
    case 'atem.uskOnAir': {
      const on = onOff(o.on, ctx.values[`usk_${key + 1}${meSuffix(me)}`]);
      return command('CKOn', [me, key, on ? 1 : 0, 0]);
    }
    case 'atem.uskFill':
      return command('CKeF', [me, key, ...be16(src)]);
    case 'atem.uskCut':
      return command('CKeC', [me, key, ...be16(src)]);
    case 'atem.uskType':
      return command('CKTp', [1, me, key, clampInt(o.type, 0, 3), 0, 0, 0, 0]);
    case 'atem.macro': {
      const index = Math.max(0, int(o.n, 1) - 1);
      return command('MAct', [...be16(index), 0, 0]);
    }
    case 'atem.macroStop':
      return command('MAct', [0xff, 0xff, 1, 0]);
    case 'atem.macroContinue':
      return command('MAct', [0xff, 0xff, 4, 0]);
    case 'atem.macroLoop':
      return command('MRCP', [1, onOff(o.on, ctx.values.macro_loop) ? 1 : 0, 0, 0]);
    case 'atem.dsk': {
      const on = onOff(o.onAir, ctx.values[`dsk_${dsk + 1}`]);
      return command('CDsL', [dsk, on ? 1 : 0, 0, 0]);
    }
    case 'atem.dskAuto':
      return command('DDsA', ctx.version >= ATEM_V8_0_1 ? [0, dsk, 0, 0] : [dsk, 0, 0, 0]);
    case 'atem.dskTie':
      return command('CDsT', [dsk, onOff(o.on, ctx.values[`dsk_${dsk + 1}_tie`]) ? 1 : 0, 0, 0]);
    case 'atem.dskRate':
      return command('CDsR', [dsk, rate, 0, 0]);
    case 'atem.dskFill':
      return command('CDsF', [dsk, 0, ...be16(src)]);
    case 'atem.dskCut':
      return command('CDsC', [dsk, 0, ...be16(src)]);
    case 'atem.aux': {
      const aux = Math.max(0, int(o.aux, 1) - 1);
      return command('CAuS', [0x01, aux, ...be16(src)]);
    }
    case 'atem.mpSource': {
      const n = Math.max(0, int(o.n, 1) - 1) & 0xff;
      return o.kind === 'clip' ? command('MPSS', [1 | 4, mp, 2, 0, n, 0, 0, 0]) : command('MPSS', [1 | 2, mp, 1, n, 0, 0, 0, 0]);
    }
    case 'atem.mpPlay': {
      const playing = onOff(o.on, ctx.values[`mp_${mp + 1}_playing`]);
      return command('SCPS', [1, mp, playing ? 1 : 0, 0, 0, 0, 0, 0]);
    }
    case 'atem.mpLoop':
      return command('SCPS', [2, mp, 0, bool(o.on) ? 1 : 0, 0, 0, 0, 0]);
    case 'atem.mpBegin':
      return command('SCPS', [4, mp, 0, 0, 1, 0, 0, 0]);
    case 'atem.captureStill':
      return command('Capt', []);
    case 'atem.clearStill':
      return command('CSTL', [Math.max(0, int(o.n, 1) - 1) & 0xff, 0, 0, 0]);
    case 'atem.mvSource':
      return command('CMvI', [Math.max(0, int(o.mv, 1) - 1), Math.max(0, int(o.window, 1) - 1), ...be16(src)]);
    case 'atem.mvLayout':
      return command('CMvP', [1, Math.max(0, int(o.mv, 1) - 1), clampInt(o.layout, 0, 12), 0]);
    case 'atem.inputName': {
      const id = Math.max(0, Math.min(0xffff, int(o.input)));
      const long = String(o.long ?? '');
      const short = String(o.short ?? '');
      const flag = (long ? 1 : 0) | (short ? 2 : 0);
      if (!flag) return null;
      return command('CInL', [flag, 0, ...be16(id), ...fixedText(long, 20), ...fixedText(short, 4), 0, 0, 0, 0]);
    }
    case 'atem.record':
      return command('RcTM', [onOff(o.on, ctx.values.recording) ? 1 : 0, 0, 0, 0]);
    case 'atem.stream': {
      const live = ctx.values.streaming === 'ON' || ctx.values.streaming === '接続中';
      const on = o.on === 'toggle' ? !live : bool(o.on);
      return command('StrR', [on ? 1 : 0, 0, 0, 0]);
    }
    case 'atem.ssrcBox': {
      const box = Math.max(0, int(o.box, 1) - 1);
      const ssrc = Math.max(0, int(o.ssrc, 1) - 1);
      const enabled = onOff(o.on, ctx.values[`ssrc_box_${box + 1}`]) ? 1 : 0;
      const body = new Array<number>(24).fill(0);
      body[0] = 0;
      body[1] = 0x03; // enabled | source
      if (ctx.version >= ATEM_V8_0) {
        body[2] = ssrc;
        body[3] = box;
        body[4] = enabled;
        body[6] = (src >> 8) & 0xff;
        body[7] = src & 0xff;
      } else {
        body[2] = box;
        body[3] = enabled;
        body[4] = (src >> 8) & 0xff;
        body[5] = src & 0xff;
      }
      return command('CSBP', body);
    }
    case 'atem.audioMix': {
      // 音声の ON / OFF / AFV。Fairlight の機種（音源 ID を受け取った入力）は CFSP、それ以外は CAMI
      const index = Math.max(0, Math.min(0xffff, int(o.input)));
      const mode = o.mode === 'off' ? 0 : o.mode === 'afv' ? 2 : 1;
      const fl = ctx.fairlightSources.get(index);
      if (fl) {
        const body = new Array<number>(48).fill(0);
        body[0] = 0x01; // mixOption（1 << 8）
        body[2] = (index >> 8) & 0xff;
        body[3] = index & 0xff;
        for (let i = 0; i < 8; i++) body[8 + i] = fl[i] ?? 0;
        body[44] = [1, 2, 4][mode]!;
        return command('CFSP', body);
      }
      return command('CAMI', [1, 0, ...be16(index), mode, 0, 0, 0, 0, 0, 0, 0]);
    }
    case 'atem.audioGain': {
      // フェーダー（dB）。Fairlight は 1/100 dB の整数、それ以外は 10^(dB/20)×32768
      const index = Math.max(0, Math.min(0xffff, int(o.input)));
      const db = Math.max(-100, Math.min(10, Number(o.db) || 0));
      const fl = ctx.fairlightSources.get(index);
      if (fl) {
        const body = new Array<number>(48).fill(0);
        body[1] = 0x80; // faderGain（1 << 7）
        body[2] = (index >> 8) & 0xff;
        body[3] = index & 0xff;
        for (let i = 0; i < 8; i++) body[8 + i] = fl[i] ?? 0;
        body.splice(40, 4, ...be32(Math.round(db * 100) | 0));
        return command('CFSP', body);
      }
      const g = Math.min(0xffff, Math.floor(Math.pow(10, db / 20) * 32768));
      return command('CAMI', [2, 0, ...be16(index), 0, 0, ...be16(g), 0, 0, 0, 0]);
    }
    case 'atem.masterGain': {
      const db = Math.max(-100, Math.min(10, Number(o.db) || 0));
      if (ctx.fairlightSources.size > 0) {
        const body = new Array<number>(20).fill(0);
        body[0] = 1 << 3;
        body.splice(12, 4, ...be32(Math.round(db * 100) | 0));
        return command('CFMP', body);
      }
      const g = Math.min(0xffff, Math.floor(Math.pow(10, db / 20) * 32768));
      return command('CAMM', [1, 0, ...be16(g), 0, 0, 0, 0]);
    }
    case 'atem.saveStartup':
      return command('SRsv', [0, 0, 0, 0]);
    case 'atem.clearStartup':
      return command('SRcl', [0, 0, 0, 0]);
    default:
      return null;
  }
}

interface InFlight {
  id: number;
  packet: Uint8Array;
  tries: number;
  timer: ReturnType<typeof setTimeout>;
  resolve: (r: SendResult) => void;
}

export class AtemSession implements Session {
  private sessionId = 0;
  private established = false;
  private ready_ = false;
  private lastRemote = 0;
  private nextId = 1;
  private inFlight: InFlight[] = [];
  private silence: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  /** 受け取った状態（動作の組み立てに使う） */
  private readonly ctx: AtemContext = { version: 0, fairlightSources: new Map(), values: {} };

  constructor(private readonly io: SessionIO) {}

  ready(): void {
    this.io.setStatus('connecting', 'ATEM の応答を待っています');
    this.established = false;
    this.ready_ = false;
    this.sessionId = 0;
    this.nextId = 1;
    void this.io.write(HELLO).catch(() => undefined);
    this.watch();
  }

  private watch(): void {
    if (this.silence) clearTimeout(this.silence);
    this.silence = setTimeout(() => {
      if (!this.closed) this.io.fail('ATEM から応答がありません。IP アドレスを確認してください');
    }, ATEM_TIMING.silenceMs);
  }

  data(bytes: Uint8Array): void {
    if (bytes.length < 12) return;
    const length = u16(bytes, 0) & 0x07ff;
    if (length !== bytes.length) return;
    this.watch();
    const flags = (bytes[0] ?? 0) >> 3;
    this.sessionId = u16(bytes, 2);
    const remoteId = u16(bytes, 10);
    if (flags & PacketFlag.NewSessionId) {
      this.established = true;
      this.lastRemote = remoteId;
      this.ack(remoteId);
      return;
    }
    if (!this.established) return;
    if (flags & PacketFlag.AckReply) this.acked(u16(bytes, 4));
    if (flags & PacketFlag.AckRequest && remoteId < MAX_PACKET_ID) {
      const distance = (remoteId - this.lastRemote + MAX_PACKET_ID) % MAX_PACKET_ID;
      if (distance === 1) {
        this.lastRemote = remoteId;
        if (length > 12) this.commands(bytes.subarray(12));
      }
      // 同じ番号の送り直し・飛んだ番号は中身を使わず、受け取り済みの最後の番号で ack（ATEM が送り直す）
      this.ack(this.lastRemote);
    }
  }

  private commands(payload: Uint8Array): void {
    const updates: Record<string, string> = {};
    for (const c of parseCommands(payload)) {
      if (c.name === '_ver' && c.body.length >= 4) this.ctx.version = ((c.body[0]! << 24) >>> 0) + (c.body[1]! << 16) + u16(c.body, 2);
      if (c.name === 'FASP' && c.body.length >= 16) {
        const index = u16(c.body, 0);
        if (!this.ctx.fairlightSources.has(index)) this.ctx.fairlightSources.set(index, Uint8Array.from(c.body.subarray(8, 16)));
      }
      const v = commandToValues(c.name, c.body, this.ctx.version);
      if (v === 'init') {
        if (!this.ready_) {
          this.ready_ = true;
          this.io.setStatus('connected');
          this.io.log('info', '初期の状態を受け取りました');
        }
      } else if (v) Object.assign(updates, v);
    }
    if (Object.keys(updates).length) {
      Object.assign(this.ctx.values, updates);
      this.io.setValues(applyDerive(this.io.def.derive, updates));
    }
  }

  private ack(id: number): void {
    void this.io.write(header(PacketFlag.AckReply, 12, this.sessionId, id, 0)).catch(() => undefined);
  }

  private acked(ackId: number): void {
    const tol = MAX_PACKET_ID / 2;
    this.inFlight = this.inFlight.filter((p) => {
      const covered = p.id === ackId || (p.id < ackId && p.id + tol > ackId) || p.id > ackId + tol;
      if (covered) {
        clearTimeout(p.timer);
        p.resolve({ ok: true });
      }
      return !covered;
    });
  }

  async send(): Promise<SendResult> {
    return { ok: false, reason: 'ATEM には決まった動作だけ送れます' };
  }

  sendBuiltin(name: string, option: Values): Promise<SendResult> {
    if (!this.ready_) return Promise.resolve({ ok: false, reason: 'ATEM の準備ができていません' });
    const cmd = buildAtemCommand(name, option, this.ctx);
    if (!cmd) return Promise.resolve({ ok: false, reason: `知らない動作です（${name}）` });
    const id = this.nextId;
    this.nextId = (this.nextId + 1) % MAX_PACKET_ID;
    const packet = new Uint8Array(12 + cmd.length);
    packet.set(header(PacketFlag.AckRequest, 12 + cmd.length, this.sessionId, 0, id));
    packet.set(cmd, 12);
    return new Promise<SendResult>((resolve) => {
      const entry: InFlight = { id, packet, tries: 0, resolve, timer: setTimeout(() => undefined, 0) };
      const attempt = () => {
        entry.tries += 1;
        const p = entry.tries > 1 ? withRetransmitFlag(packet) : packet;
        void this.io.write(p).catch((e: unknown) => {
          this.drop(entry, { ok: false, reason: e instanceof Error ? e.message : String(e) });
        });
        entry.timer = setTimeout(() => {
          if (entry.tries >= ATEM_TIMING.resendTimes) this.drop(entry, { ok: false, reason: 'ATEM から受理の応答（ack）がありません' });
          else attempt();
        }, ATEM_TIMING.resendMs);
      };
      this.inFlight.push(entry);
      this.io.log('debug', `送信 ${String.fromCharCode(...cmd.subarray(4, 8))}`);
      attempt();
    });
  }

  private drop(entry: InFlight, r: SendResult): void {
    clearTimeout(entry.timer);
    if (!this.inFlight.includes(entry)) return;
    this.inFlight = this.inFlight.filter((p) => p !== entry);
    entry.resolve(r);
  }

  dispose(): void {
    this.closed = true;
    if (this.silence) clearTimeout(this.silence);
    for (const p of this.inFlight) {
      clearTimeout(p.timer);
      p.resolve({ ok: false, reason: '接続が切れました' });
    }
    this.inFlight = [];
  }
}

function withRetransmitFlag(p: Uint8Array): Uint8Array {
  const copy = Uint8Array.from(p);
  copy[0] = (copy[0] ?? 0) | (PacketFlag.IsRetransmit << 3);
  return copy;
}
