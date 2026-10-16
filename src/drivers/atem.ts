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

/** 受け取ったコマンドを変数へ（me は 0 始まり。ME1 は pgm / pvw、ME2 以降は pgm_me2 など） */
export function commandToValues(name: string, b: Uint8Array): Record<string, string> | 'init' | null {
  const me = (n: number) => (n === 0 ? '' : `_me${n + 1}`);
  switch (name) {
    case 'InCm':
      return 'init';
    case '_pin':
      return { model: cstr(b, 0, 40) };
    case 'PrgI':
      return { [`pgm${me(b[0] ?? 0)}`]: String(u16(b, 2)) };
    case 'PrvI':
      return { [`pvw${me(b[0] ?? 0)}`]: String(u16(b, 2)) };
    case 'FtbS':
      return { [`ftb${me(b[0] ?? 0)}`]: b[1] === 1 || b[2] === 1 ? 'ON' : 'OFF' };
    case 'DskS':
      return { [`dsk_${(b[0] ?? 0) + 1}`]: b[1] === 1 ? 'ON' : 'OFF' };
    case 'AuxS':
      return { [`aux_${(b[0] ?? 0) + 1}`]: String(u16(b, 2)) };
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

/** 動作 → コマンド（中身の並びは atem-connection の serialize と同じ） */
export function buildAtemCommand(name: string, o: Values): Uint8Array | null {
  const me = Math.max(0, int(o.me));
  const src = Math.max(0, Math.min(0xffff, int(o.input)));
  switch (name) {
    case 'atem.pgm':
      return command('CPgI', [me, 0, (src >> 8) & 0xff, src & 0xff]);
    case 'atem.pvw':
      return command('CPvI', [me, 0, (src >> 8) & 0xff, src & 0xff]);
    case 'atem.cut':
      return command('DCut', [me, 0, 0, 0]);
    case 'atem.auto':
      return command('DAut', [me, 0, 0, 0]);
    case 'atem.ftb':
      return command('FtbA', [me, 0, 0, 0]);
    case 'atem.macro': {
      const index = Math.max(0, int(o.n, 1) - 1);
      return command('MAct', [(index >> 8) & 0xff, index & 0xff, 0, 0]);
    }
    case 'atem.dsk': {
      const index = Math.max(0, int(o.dsk, 1) - 1);
      return command('CDsL', [index, o.onAir === 'off' ? 0 : 1, 0, 0]);
    }
    case 'atem.aux': {
      const aux = Math.max(0, int(o.aux, 1) - 1);
      return command('CAuS', [0x01, aux, (src >> 8) & 0xff, src & 0xff]);
    }
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
      const v = commandToValues(c.name, c.body);
      if (v === 'init') {
        if (!this.ready_) {
          this.ready_ = true;
          this.io.setStatus('connected');
          this.io.log('info', '初期の状態を受け取りました');
        }
      } else if (v) Object.assign(updates, v);
    }
    if (Object.keys(updates).length) this.io.setValues(applyDerive(this.io.def.derive, updates));
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
    const cmd = buildAtemCommand(name, option);
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
