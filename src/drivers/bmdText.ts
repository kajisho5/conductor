import { unescapeText } from './bytes';
import { applyDerive } from './engine';
import { latin1, Routine, type Session, type SessionIO, type SendResult } from './sessions';

/**
 * Blackmagic の文字の通信手順（HyperDeck・Videohub など、SPEC 8.7）。
 * 根拠：Blackmagic 公式の HyperDeck Ethernet Protocol（TCP 9993）・Videohub Ethernet Protocol（TCP 9990）。
 * 受信は空行で区切られた「ブロック」。1 行目が見出し（例「208 transport info:」「VIDEO OUTPUT ROUTING:」）、
 * 続く行が「名前: 値」か「番号 値」。これを変数にする：
 *   見出しの番号（208 など）を外し、英数字以外を _ にした小文字 → 例 transport_info
 *   「名前: 値」→ transport_info_status = play
 *   「番号 値」→ video_output_routing_7 = 2
 * 送る内容は定義のテンプレートのまま（\n を含めてよい）。
 */

export function slug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** ブロック 1 つ → 変数 */
export function blockValues(block: string): Record<string, string> {
  const lines = block.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return {};
  const head = lines[0]!.replace(/^\d{3}\s+/, '').replace(/:$/, '');
  const base = slug(head);
  const out: Record<string, string> = {};
  if (lines.length === 1) {
    // 「200 ok」「ACK」など 1 行だけの返事
    out.last_reply = lines[0]!.trim();
    return out;
  }
  for (const line of lines.slice(1)) {
    const kv = /^([^:]+):\s?(.*)$/.exec(line);
    const nv = /^(\d+)\s(.*)$/.exec(line);
    if (nv) out[`${base}_${nv[1]}`] = nv[2]!.trim();
    else if (kv) out[`${base}_${slug(kv[1]!)}`] = kv[2]!.trim();
  }
  out.last_reply = lines[0]!.trim();
  return out;
}

export class BmdTextSession implements Session {
  private buf = '';
  private readonly routine: Routine;

  constructor(private readonly io: SessionIO) {
    this.routine = new Routine(io, (text) => {
      void this.io.write(unescapeText(text)).catch(() => undefined);
    });
  }

  ready(): void {
    this.io.setStatus('connected');
    this.routine.start();
  }

  data(bytes: Uint8Array): void {
    this.buf += latin1(bytes).replace(/\r\n/g, '\n');
    const parts = this.buf.split(/\n\n+/);
    this.buf = parts.pop() ?? '';
    const updates: Record<string, string> = {};
    for (const p of parts) Object.assign(updates, blockValues(p));
    // 1 行だけの返事（200 ok・ACK）は空行が来ないことがあるので、行で終わっていれば読む
    if (/^(\d{3} [^\n:]*|ACK|NAK)\n$/.test(this.buf)) {
      Object.assign(updates, blockValues(this.buf));
      this.buf = '';
    }
    if (this.buf.length > 64 * 1024) this.buf = '';
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
