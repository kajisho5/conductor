import type { Session, SessionIO, SendResult } from './sessions';

/**
 * VISCA over IP（PTZ カメラ、SPEC 8.8）。
 * 根拠：Sony の VISCA コマンド一覧（ILME-FR7 VISCA command list、公開）の VISCA over IP の章：
 *   UDP 52381。8 バイトの頭＝種別（2）・中身の長さ（2）・通し番号（4、ビッグエンディアン）＋ VISCA の中身。
 *   種別 01 00＝命令、01 10＝問い合わせ、02 00＝制御（中身 01 で通し番号を 0 に戻す）。
 * 設定「頭」を「なし」にすると、頭を付けずに VISCA の中身だけを送る（頭を使わないカメラ向け【推測】）。
 * 定義の動作は VISCA の中身を 16 進で書く（例 81 01 06 04 FF）。
 */

export const VISCA_IP_PORT = 52381;

export function viscaHeader(type: number, length: number, seq: number): Uint8Array {
  const h = new Uint8Array(8);
  h[0] = (type >> 8) & 0xff;
  h[1] = type & 0xff;
  h[2] = (length >> 8) & 0xff;
  h[3] = length & 0xff;
  h[4] = (seq >>> 24) & 0xff;
  h[5] = (seq >>> 16) & 0xff;
  h[6] = (seq >>> 8) & 0xff;
  h[7] = seq & 0xff;
  return h;
}

export function wrapVisca(payload: Uint8Array, seq: number): Uint8Array {
  // 8x 09 … は問い合わせ
  const type = payload[1] === 0x09 ? 0x0110 : 0x0100;
  const out = new Uint8Array(8 + payload.length);
  out.set(viscaHeader(type, payload.length, seq));
  out.set(payload, 8);
  return out;
}

/** 返事の中身（頭を除いた部分）の意味 */
export function viscaReply(p: Uint8Array): 'ack' | 'done' | 'error' | 'other' {
  const k = (p[1] ?? 0) & 0xf0;
  if (k === 0x40) return 'ack';
  if (k === 0x50) return 'done';
  if (k === 0x60) return 'error';
  return 'other';
}

export class ViscaIpSession implements Session {
  private seq = 0;

  constructor(private readonly io: SessionIO) {}

  private get framed(): boolean {
    return String(this.io.config.framing ?? 'sony') !== 'raw';
  }

  ready(): void {
    this.io.setStatus('connected');
    if (this.framed) {
      // 通し番号を 0 に戻す（制御の RESET）
      const reset = new Uint8Array(9);
      reset.set(viscaHeader(0x0200, 1, 0));
      reset[8] = 0x01;
      this.seq = 0;
      void this.io.write(reset).catch(() => undefined);
    }
  }

  data(bytes: Uint8Array): void {
    const payload = this.framed && bytes.length > 8 ? bytes.subarray(8) : bytes;
    const r = viscaReply(payload);
    if (r === 'error') this.io.log('warn', `カメラがエラーを返しました（${Array.from(payload, (b) => b.toString(16).padStart(2, '0')).join(' ')}）`);
    this.io.setValues({ last_reply: r });
  }

  async send(bytes: Uint8Array): Promise<SendResult> {
    if (bytes.length === 0 || ((bytes[0] ?? 0) & 0xf0) !== 0x80 || bytes[bytes.length - 1] !== 0xff) {
      return { ok: false, reason: 'VISCA の命令は 8x で始まり FF で終わります' };
    }
    try {
      if (this.framed) {
        this.seq = (this.seq + 1) >>> 0;
        await this.io.write(wrapVisca(bytes, this.seq));
      } else {
        await this.io.write(bytes);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  }

  dispose(): void {
    // 止めるタイマーは無い
  }
}
