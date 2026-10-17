import { toBase64, utf8Decode, utf8Encode } from './bytes';
import { applyDerive } from './engine';
import type { Session, SessionIO, SendResult } from './sessions';

/**
 * OBS Studio（obs-websocket 5.x、WebSocket 4455、SPEC 8.9）。
 * 根拠：obs-websocket の公開仕様（docs/generated/protocol.md）：
 *   つなぐと Hello（op 0）。認証があれば challenge と salt が付く。
 *   Identify（op 1）で rpcVersion 1 と authentication = base64(sha256(base64(sha256(パスワード + salt)) + challenge)) を送る。
 *   Identified（op 2）の後、Request（op 6：requestType・requestId・requestData）。返事は op 7、出来事は op 5。
 * 定義の動作は {"requestType":…,"requestData":{…}} を書く（1 行に 1 つ）。ここで op 6 に包み、通し番号の requestId を付ける。
 * 受け取った出来事・返事のうち、よく使うものを変数にする（program_scene・preview_scene・streaming・recording など）。
 */

export const OBS_PORT = 4455;

// ---------------------------------------------------------------- SHA-256（FIPS 180-4）
const K = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256(data: Uint8Array): Uint8Array {
  const bitLen = data.length * 8;
  const padLen = (((data.length + 9 + 63) >> 6) << 6) - data.length;
  const msg = new Uint8Array(data.length + padLen);
  msg.set(data);
  msg[data.length] = 0x80;
  const view = new DataView(msg.buffer);
  view.setUint32(msg.length - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(msg.length - 4, bitLen >>> 0);
  const h = Uint32Array.from([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < msg.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, h[i]!);
  return out;
}

/** obs-websocket の認証文字列 */
export function obsAuth(password: string, salt: string, challenge: string): string {
  const secret = toBase64(sha256(utf8Encode(password + salt)));
  return toBase64(sha256(utf8Encode(secret + challenge)));
}

/** 出来事・返事 → 変数 */
export function obsValues(msg: { op: number; d?: Record<string, unknown> }): Record<string, string> {
  const d = msg.d ?? {};
  const data = ((msg.op === 5 ? d.eventData : d.responseData) ?? {}) as Record<string, unknown>;
  const type = String(msg.op === 5 ? d.eventType : d.requestType);
  const out: Record<string, string> = {};
  const str = (v: unknown) => (v === undefined || v === null ? '' : typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  switch (type) {
    case 'CurrentProgramSceneChanged':
    case 'GetCurrentProgramScene':
      out.program_scene = str(data.sceneName ?? data.currentProgramSceneName);
      break;
    case 'CurrentPreviewSceneChanged':
    case 'GetCurrentPreviewScene':
      out.preview_scene = str(data.sceneName ?? data.currentPreviewSceneName);
      break;
    case 'StreamStateChanged':
    case 'GetStreamStatus':
      out.streaming = str(data.outputActive);
      if (data.outputTimecode !== undefined) out.stream_timecode = str(data.outputTimecode);
      break;
    case 'RecordStateChanged':
    case 'GetRecordStatus':
      out.recording = str(data.outputActive);
      if (data.outputPaused !== undefined) out.record_paused = str(data.outputPaused);
      if (data.outputTimecode !== undefined) out.record_timecode = str(data.outputTimecode);
      break;
    case 'ReplayBufferStateChanged':
    case 'GetReplayBufferStatus':
      out.replay_buffer = str(data.outputActive);
      break;
    case 'VirtualcamStateChanged':
    case 'GetVirtualCamStatus':
      out.virtualcam = str(data.outputActive);
      break;
    case 'StudioModeStateChanged':
    case 'GetStudioModeEnabled':
      out.studio_mode = str(data.studioModeEnabled);
      break;
    case 'InputMuteStateChanged':
      if (typeof data.inputName === 'string') out[`mute_${data.inputName}`] = str(data.inputMuted);
      break;
    case 'CurrentSceneTransitionChanged':
    case 'GetCurrentSceneTransition':
      out.transition = str(data.transitionName);
      break;
    default:
      break;
  }
  if (msg.op === 7) {
    const st = d.requestStatus as { result?: boolean; comment?: string } | undefined;
    out.last_reply = st?.result ? 'ok' : `error${st?.comment ? `: ${st.comment}` : ''}`;
  }
  return out;
}

export class ObsSession implements Session {
  private identified = false;
  private nextId = 1;

  constructor(private readonly io: SessionIO) {}

  ready(): void {
    // Hello を待つ
    this.io.setStatus('connecting', 'OBS の返事を待っています');
  }

  private writeJson(v: unknown): Promise<void> {
    return this.io.write(utf8Encode(JSON.stringify(v)));
  }

  private request(requestType: string, requestData?: Record<string, unknown>): Promise<void> {
    const d: Record<string, unknown> = { requestType, requestId: `c${this.nextId++}` };
    if (requestData) d.requestData = requestData;
    return this.writeJson({ op: 6, d });
  }

  data(bytes: Uint8Array): void {
    let msg: { op: number; d?: Record<string, unknown> };
    try {
      msg = JSON.parse(utf8Decode(bytes)) as { op: number; d?: Record<string, unknown> };
    } catch {
      return;
    }
    if (msg.op === 0) {
      const auth = msg.d?.authentication as { challenge?: string; salt?: string } | undefined;
      const d: Record<string, unknown> = { rpcVersion: 1 };
      if (auth?.challenge && auth.salt) {
        const pw = String(this.io.config.password ?? '');
        if (!pw) {
          this.io.setStatus('error', 'OBS にパスワードが設定されています。機器の設定に入れてください');
          return;
        }
        d.authentication = obsAuth(pw, auth.salt, auth.challenge);
      }
      void this.writeJson({ op: 1, d }).catch(() => undefined);
      return;
    }
    if (msg.op === 2) {
      this.identified = true;
      this.io.setStatus('connected');
      for (const t of ['GetCurrentProgramScene', 'GetCurrentPreviewScene', 'GetStreamStatus', 'GetRecordStatus', 'GetStudioModeEnabled', 'GetVirtualCamStatus']) {
        void this.request(t).catch(() => undefined);
      }
      return;
    }
    if (msg.op === 5 || msg.op === 7) {
      const updates = obsValues(msg);
      const all = applyDerive(this.io.def.derive, updates);
      if (Object.keys(all).length) this.io.setValues(all);
    }
  }

  async send(bytes: Uint8Array): Promise<SendResult> {
    if (!this.identified) return { ok: false, reason: 'OBS との接続（認証）が済んでいません' };
    const lines = utf8Decode(bytes)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    try {
      for (const line of lines) {
        const r = JSON.parse(line) as { requestType?: unknown; requestData?: Record<string, unknown> };
        if (typeof r.requestType !== 'string') return { ok: false, reason: 'requestType がありません' };
        await this.request(r.requestType, r.requestData);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  }

  dispose(): void {
    this.identified = false;
  }
}
