import type { DeviceStatus } from '@/stores/runtime';
import type { LogLevel } from '@/stores/log';
import { printable, unescapeText, utf8Encode } from './bytes';
import { applyDerive, ReceiveParser, renderTemplate, type Values } from './engine';
import type { DriverDefinition } from './types';
import { AtemSession } from './atem';
import { OseeSession } from './osee';

/**
 * 接続ごとの通信手順（SPEC 7 章）。DeviceManager が TCP/UDP の口を開き、その上でこれが動く。
 * - RawSession：定義どおりに送って、受信を規則で変数にするだけ（汎用 TCP/UDP/OSC）
 * - RolandLanSession：Roland の LAN 制御（認証・`;` 区切り・ack 待ち・DTH の展開・キープアライブ）
 */

export type SendResult = { ok: true } | { ok: false; reason: string };

export interface SessionIO {
  def: DriverDefinition;
  config: Values;
  write(bytes: Uint8Array): Promise<void>;
  setStatus(status: DeviceStatus, error?: string): void;
  setValues(updates: Record<string, string>): void;
  log(level: LogLevel, message: string): void;
  /** 接続を閉じて、間をあけて接続し直す */
  fail(reason: string): void;
}

export interface Session {
  /** 口が開いた（TCP は接続できた、UDP は送れる状態になった） */
  ready(): void;
  data(bytes: Uint8Array): void;
  send(bytes: Uint8Array): Promise<SendResult>;
  /** 定義の送信形式が builtin の動作（ATEM などアプリに組み込みのコマンド） */
  sendBuiltin?(name: string, option: Values): Promise<SendResult>;
  /** タイマーなどを止める（閉じる時に必ず呼ぶ） */
  dispose(): void;
}

/** 接続できた後の共通処理：onConnect を送り、poll を回す */
class Routine {
  private timers: ReturnType<typeof setInterval>[] = [];

  constructor(
    private readonly io: SessionIO,
    private readonly write: (text: string) => void,
  ) {}

  start(): void {
    this.stop();
    const ctx = { config: this.io.config };
    for (const line of this.io.def.onConnect ?? []) this.write(renderTemplate(line, ctx));
    for (const p of this.io.def.poll ?? []) {
      if (!(p.intervalMs >= 100)) continue;
      const text = renderTemplate(p.data, ctx);
      this.timers.push(setInterval(() => this.write(text), p.intervalMs));
    }
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }
}

export class RawSession implements Session {
  private readonly parser: ReceiveParser;
  private readonly routine: Routine;

  constructor(private readonly io: SessionIO) {
    this.parser = new ReceiveParser(io.def);
    this.routine = new Routine(io, (text) => {
      void this.io.write(unescapeText(text)).catch(() => undefined);
    });
  }

  ready(): void {
    this.io.setStatus('connected');
    this.routine.start();
  }

  data(bytes: Uint8Array): void {
    const { updates } = this.parser.feed(bytes);
    const all = applyDerive(this.io.def.derive, updates);
    if (Object.keys(all).length) this.io.setValues(all);
  }

  async send(bytes: Uint8Array): Promise<SendResult> {
    try {
      await this.io.write(bytes);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  }

  dispose(): void {
    this.routine.stop();
  }
}

/* ===================================================================================
 * Roland LAN（V-160HD / V-80HD / VR-120HD）
 * 根拠：各機種の Remote Control Guide、Roland サポート記事、kajisho5/crosspoint の SPEC 3 章（実装と実機観測）
 * ================================================================================= */

export const ROLAND_PROMPT = 'Enter password:';
const WELCOME_PREFIX = 'Welcome to ';
const ACK = '\x06';
const IAC = '\xff';
const DROP_RE = /[\x02\x11\x13\r]/g;

export type RolandToken = { kind: 'text'; text: string } | { kind: 'ack' };

/** 受信の切り出し（crosspoint の LanParser と同じ規則）：`;` `\n` 0x06 で区切り、認証文は区切り無しでも 1 件にする */
export class RolandLanParser {
  private buf = '';

  feed(chunk: string): RolandToken[] {
    const out: RolandToken[] = [];
    this.buf = stripIac(this.buf + chunk).replace(DROP_RE, '');
    for (;;) {
      this.buf = this.buf.replace(/^[ \t\n]+/, '');
      if (this.buf.length === 0) break;
      if (this.buf.startsWith(ROLAND_PROMPT)) {
        out.push({ kind: 'text', text: ROLAND_PROMPT });
        this.buf = this.buf.slice(ROLAND_PROMPT.length);
        continue;
      }
      const sep = earliestSeparator(this.buf);
      if (this.buf.startsWith(WELCOME_PREFIX)) {
        const dot = this.buf.indexOf('.');
        if (dot >= 0 && (sep < 0 || dot < sep)) {
          out.push({ kind: 'text', text: this.buf.slice(0, dot + 1) });
          this.buf = this.buf.slice(dot + 1);
          continue;
        }
        if (sep < 0) break;
      }
      if (sep < 0) break;
      const seg = this.buf.slice(0, sep).trim();
      const ch = this.buf[sep];
      this.buf = this.buf.slice(sep + 1);
      if (seg === 'ACK') out.push({ kind: 'ack' });
      else if (seg.length > 0) out.push({ kind: 'text', text: seg });
      if (ch === ACK) out.push({ kind: 'ack' });
    }
    if (this.buf.length > 8192) this.buf = this.buf.slice(-8192);
    return out;
  }
}

function earliestSeparator(s: string): number {
  let best = -1;
  for (const c of [';', '\n', ACK]) {
    const i = s.indexOf(c);
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  return best;
}

function stripIac(s: string): string {
  if (s.indexOf(IAC) < 0) return s;
  let out = '';
  for (let i = 0; i < s.length;) {
    if (s[i] === IAC) {
      if (i + 3 > s.length) {
        out += s.slice(i);
        break;
      }
      i += 3;
      continue;
    }
    out += s[i];
    i += 1;
  }
  return out;
}

/** バイト列をそのまま 1 バイト 1 文字に（0xFF などを壊さない） */
export function latin1(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

/** Roland のアドレスは 7 ビット × 3 バイト。1 つ進める（下位が 0x7F を超えたら繰り上げ） */
export function nextRolandAddr(addr: number): number {
  let a0 = (addr >> 16) & 0x7f;
  let a1 = (addr >> 8) & 0x7f;
  let a2 = (addr & 0x7f) + 1;
  if (a2 > 0x7f) {
    a2 = 0;
    a1 += 1;
    if (a1 > 0x7f) {
      a1 = 0;
      a0 = (a0 + 1) & 0x7f;
    }
  }
  return (a0 << 16) | (a1 << 8) | a2;
}

function hex6(n: number): string {
  return n.toString(16).toUpperCase().padStart(6, '0');
}

/** `DTH:aaaaaa,vvvv…` を addr_aaaaaa ごとの 1 バイト（16 進 2 桁）に分ける */
export function expandDth(text: string): Record<string, string> | null {
  const m = /^DTH:([0-9A-Fa-f]{6}),([0-9A-Fa-f]*)$/.exec(text);
  if (!m) return null;
  const out: Record<string, string> = {};
  let addr = parseInt(m[1]!, 16);
  const data = m[2]!;
  for (let i = 0; i + 1 < data.length; i += 2) {
    out[`addr_${hex6(addr)}`] = data.slice(i, i + 2).toUpperCase();
    addr = nextRolandAddr(addr);
  }
  return out;
}

export const ROLAND_ERRORS: Record<string, string> = {
  '0': '命令の形が正しくありません（ERR:0）',
  '4': '本体の他の設定で無効になっています（ERR:4）',
  '5': '値が範囲外です（ERR:5）',
  '6': 'stx がありません（ERR:6）',
};

export const ROLAND_TIMING = {
  /** 接続してから認証の案内を待つ時間。来なければ認証なしとみなして VER; を送る */
  promptWaitMs: 3000,
  /** パスワードを送ってから Welcome を待つ時間 */
  welcomeWaitMs: 5000,
  /** 送った命令の ack / ERR を待つ時間 */
  ackWaitMs: 1500,
  /** 命令の間隔（SPEC 3-6：最小 20ms） */
  minGapMs: 20,
  /** 無通信がこれだけ続いたら VER; で確かめる */
  idleMs: 10000,
  /** VER; の応答を待つ時間 */
  keepaliveWaitMs: 5000,
} as const;

interface Pending {
  acksLeft: number;
  resolve: (r: SendResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class RolandLanSession implements Session {
  private readonly parser = new RolandLanParser();
  private readonly routine: Routine;
  private phase: 'waitPrompt' | 'waitWelcome' | 'probe' | 'ready' | 'closed' = 'waitPrompt';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setTimeout> | null = null;
  private passwordSent = false;
  private queue: Promise<void> = Promise.resolve();
  private lastWrite = 0;
  private pending: Pending[] = [];

  constructor(private readonly io: SessionIO) {
    this.routine = new Routine(io, (text) => {
      void this.writeText(text);
    });
  }

  ready(): void {
    this.phase = 'waitPrompt';
    this.io.setStatus('connecting', '認証を待っています');
    this.setTimer(ROLAND_TIMING.promptWaitMs, () => {
      // 案内が来ない：パスワード無しの設定か古い版。VER; を送って応答を見る【推測による防御。crosspoint SPEC 3-2】
      this.phase = 'probe';
      void this.writeText('VER;');
      this.setTimer(ROLAND_TIMING.welcomeWaitMs, () => this.io.fail('応答がありません。IP アドレスとポート（8023）を確認してください'));
    });
  }

  data(bytes: Uint8Array): void {
    this.touch();
    for (const t of this.parser.feed(latin1(bytes))) this.token(t);
  }

  private token(t: RolandToken): void {
    if (t.kind === 'ack') {
      this.ack();
      return;
    }
    const text = t.text;
    if (text === ROLAND_PROMPT) {
      if (this.passwordSent) return;
      const pw = String(this.io.config.password ?? '');
      if (!pw) {
        this.io.setStatus('error', 'パスワードを入れてください（本体の LAN CONTROL の NETWORK PASSWORD）');
        this.clearTimer();
        return;
      }
      this.passwordSent = true;
      this.phase = 'waitWelcome';
      this.io.log('info', 'パスワードを送ります');
      void this.writeRaw(utf8Encode(`${pw}\n`));
      this.setTimer(ROLAND_TIMING.welcomeWaitMs, () => this.io.fail('パスワードが違う可能性があります'));
      return;
    }
    if (text.startsWith(WELCOME_PREFIX)) {
      this.io.log('info', text);
      this.connected();
      return;
    }
    if (this.phase === 'probe') this.connected();
    const ver = /^VER:([^,]+),(.+)$/.exec(text);
    if (ver) {
      this.io.setValues({ model: ver[1]!.trim(), version: ver[2]!.trim() });
      return;
    }
    const err = /^ERR:(\d+)$/.exec(text);
    if (err) {
      const msg = ROLAND_ERRORS[err[1]!] ?? `エラー（ERR:${err[1]}）`;
      this.io.log('warn', msg);
      this.rejectFirst(msg);
      return;
    }
    const d = expandDth(text);
    if (d) {
      this.io.setValues(applyDerive(this.io.def.derive, d));
      return;
    }
    // 簡易制御コマンドの応答（SQS:ON など）はそのまま last_reply に
    this.io.setValues({ last_reply: text });
  }

  private connected(): void {
    if (this.phase === 'ready') return;
    this.phase = 'ready';
    this.clearTimer();
    this.io.setStatus('connected');
    this.routine.start();
    this.touch();
  }

  async send(bytes: Uint8Array): Promise<SendResult> {
    if (this.phase !== 'ready') return { ok: false, reason: '本体の認証が済んでいません' };
    const text = latin1(bytes);
    const count = Math.max(1, (text.match(/;/g) ?? []).length);
    return new Promise<SendResult>((resolve) => {
      const entry: Pending = {
        acksLeft: count,
        resolve,
        timer: setTimeout(() => {
          this.pending = this.pending.filter((p) => p !== entry);
          resolve({ ok: false, reason: '本体から受理の応答（ack）がありません' });
        }, ROLAND_TIMING.ackWaitMs),
      };
      this.pending.push(entry);
      void this.writeRaw(bytes).catch((e: unknown) => {
        clearTimeout(entry.timer);
        this.pending = this.pending.filter((p) => p !== entry);
        resolve({ ok: false, reason: e instanceof Error ? e.message : String(e) });
      });
    });
  }

  private ack(): void {
    const p = this.pending[0];
    if (!p) return;
    p.acksLeft -= 1;
    if (p.acksLeft <= 0) {
      clearTimeout(p.timer);
      this.pending.shift();
      p.resolve({ ok: true });
    }
  }

  private rejectFirst(reason: string): void {
    const p = this.pending.shift();
    if (!p) return;
    clearTimeout(p.timer);
    p.resolve({ ok: false, reason });
  }

  /** 改行（LF）を付けて送る。LAN は LF 終端・stx 省略（Roland サポート記事） */
  private writeText(text: string): Promise<void> {
    const t = text.endsWith('\n') ? text : `${text}\n`;
    return this.writeRaw(unescapeText(t));
  }

  /** 命令の間を 20ms 以上あける（SPEC 3-6） */
  private writeRaw(bytes: Uint8Array): Promise<void> {
    const run = async () => {
      const wait = this.lastWrite + ROLAND_TIMING.minGapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastWrite = Date.now();
      this.io.log('debug', `送信 ${printable(bytes)}`);
      await this.io.write(bytes);
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  /** 無通信の見張り：10 秒静かなら VER; を送り、5 秒応答が無ければ接続し直す（crosspoint SPEC 3-7） */
  private touch(): void {
    if (this.keepaliveTimer) {
      clearTimeout(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.phase !== 'ready') return;
    this.idleTimer = setTimeout(() => {
      void this.writeText('VER;');
      this.keepaliveTimer = setTimeout(() => this.io.fail('本体から応答がありません'), ROLAND_TIMING.keepaliveWaitMs);
    }, ROLAND_TIMING.idleMs);
  }

  private setTimer(ms: number, fn: () => void): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      fn();
    }, ms);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  dispose(): void {
    this.phase = 'closed';
    this.clearTimer();
    this.routine.stop();
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    for (const p of this.pending) {
      clearTimeout(p.timer);
      p.resolve({ ok: false, reason: '接続が切れました' });
    }
    this.pending = [];
  }
}

export function createSession(io: SessionIO): Session {
  if (io.def.session === 'roland-lan') return new RolandLanSession(io);
  if (io.def.session === 'atem') return new AtemSession(io);
  if (io.def.session === 'osee') return new OseeSession(io);
  return new RawSession(io);
}
