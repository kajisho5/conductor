import { getConductorNet, type ConductorNet, type NetState } from '../../modules/conductor-net/src';
import { fromBase64, printable, toBase64 } from '@/drivers/bytes';
import { buildPayloads, PayloadError, withDefaults, type Payload, type Values } from '@/drivers/engine';
import { createSession, type Session, type SessionIO } from '@/drivers/sessions';
import { MidiLink } from './midiLink';
import type { ConductorMidi } from '../../modules/conductor-midi/src';
import { getConductorMidi } from '../../modules/conductor-midi/src';
import { getDefinition } from '@/drivers/registry';
import type { ActionDef, DriverDefinition } from '@/drivers/types';
import type { Device, Show } from '@/model/types';
import { log } from '@/stores/log';
import { useRuntimeStore } from '@/stores/runtime';
import { demoStatus, type SendResult } from './demoDriver';

/**
 * 機器の接続（SPEC 7・11 章）。
 * - TCP：接続を保ち、切れたら 1, 2, 4, 8 … 最大 30 秒の間隔で再接続
 * - UDP / OSC：送受信用の口を開く（接続の概念は無いので開けたら「接続中」）
 * - HTTP：都度 fetch。設定が正しければ「接続中」
 * - アプリが裏に回ったら全部閉じ、前面に戻ったら開き直す（iOS は前面の間だけ動く）
 */

export const RECONNECT_STEPS_MS = [1000, 2000, 4000, 8000, 16000, 30000] as const;
export const HTTP_TIMEOUT_MS = 5000;

interface Conn {
  device: Device;
  def: DriverDefinition;
  config: Values;
  /** 接続し直すかどうかの判定に使う、設定の要約 */
  key: string;
  /** ネイティブ側の接続 ID（開き直すたびに変える。古い接続のイベントを無視するため） */
  netId: string;
  /** 口が開いている間の通信手順（認証・ack 待ち・受信の解析） */
  session: Session | null;
  /** USB / Bluetooth MIDI でつないでいる時（Roland） */
  midi: MidiLink | null;
  attempt: number;
  retry: ReturnType<typeof setTimeout> | null;
  wanted: boolean;
}

function configKey(device: Device): string {
  return JSON.stringify([device.driverId, device.enabled, device.config]);
}

function host(config: Values): string {
  return String(config.host ?? '').trim();
}

function port(config: Values, name = 'port'): number {
  return Math.trunc(Number(config[name] ?? 0));
}

export class DeviceManager {
  private conns = new Map<string, Conn>();
  private byNetId = new Map<string, string>();
  private gen = 0;
  private subscribed = false;
  private suspended = false;

  constructor(
    private readonly netProvider: () => ConductorNet | null = getConductorNet,
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
    private readonly midiProvider: () => ConductorMidi | null = getConductorMidi,
  ) {}

  private net(): ConductorNet | null {
    const n = this.netProvider();
    if (n && !this.subscribed) {
      this.subscribed = true;
      n.addListener('onState', (ev) => this.onNetState(ev.id, ev.state, ev.error));
      n.addListener('onData', (ev) => this.onNetData(ev.id, ev.base64));
    }
    return n;
  }

  /** ショーの機器一覧に合わせて、開く・閉じる・開き直す */
  sync(show: Show): void {
    const ids = new Set(show.devices.map((d) => d.id));
    for (const [id, c] of this.conns) {
      if (!ids.has(id)) this.drop(c, '機器を削除しました');
    }
    for (const device of show.devices) {
      const existing = this.conns.get(device.id);
      const key = configKey(device);
      if (existing && existing.key === key) {
        existing.device = device;
        continue;
      }
      if (existing) this.drop(existing, existing.device.enabled && device.enabled ? '設定を変えたので接続し直します' : undefined);
      this.start(device);
    }
  }

  /** アプリが裏に回る */
  suspend(): void {
    this.suspended = true;
    for (const c of this.conns.values()) {
      this.clearRetry(c);
      void this.closeNet(c);
      if (c.device.enabled && c.def.transport !== 'demo') useRuntimeStore.getState().setDeviceStatus(c.device.id, 'reconnecting');
    }
  }

  /** 前面に戻る */
  resume(show: Show): void {
    if (!this.suspended) return;
    this.suspended = false;
    for (const c of [...this.conns.values()]) this.drop(c);
    this.sync(show);
  }

  stopAll(): void {
    for (const c of [...this.conns.values()]) this.drop(c);
  }

  private start(device: Device): void {
    const def = getDefinition(device.driverId);
    const rt = useRuntimeStore.getState();
    if (!def) {
      rt.setDeviceStatus(device.id, 'error', `ドライバ ${device.driverId} がありません`);
      return;
    }
    const conn: Conn = {
      device,
      def,
      config: withDefaults(def.configFields, device.config),
      key: configKey(device),
      netId: '',
      session: null,
      midi: null,
      attempt: 0,
      retry: null,
      wanted: device.enabled,
    };
    this.conns.set(device.id, conn);
    if (!device.enabled) {
      rt.setDeviceStatus(device.id, 'disabled');
      return;
    }
    this.connect(conn);
  }

  private connect(c: Conn): void {
    const rt = useRuntimeStore.getState();
    const id = c.device.id;
    const t = c.def.transport;
    if (t === 'demo') {
      rt.setDeviceStatus(id, demoStatus(c.device));
      return;
    }
    if (t === 'http') {
      const base = String(c.config.baseUrl ?? '');
      if (!/^https?:\/\/.+/.test(base)) rt.setDeviceStatus(id, 'error', 'URL の先頭（http://…）を入れてください');
      else rt.setDeviceStatus(id, 'connected');
      return;
    }
    if (this.suspended) return;
    if (c.def.midiModelId && c.config.link === 'midi') {
      this.connectMidi(c);
      return;
    }
    const h = host(c.config);
    const p = port(c.config);
    if (!h) {
      rt.setDeviceStatus(id, 'error', 'IP アドレスを入れてください');
      return;
    }
    if (!(p >= 1 && p <= 65535)) {
      rt.setDeviceStatus(id, 'error', 'ポート番号を 1〜65535 で入れてください');
      return;
    }
    const net = this.net();
    if (!net) {
      rt.setDeviceStatus(id, 'error', '通信モジュールがありません（アプリのビルドに含まれていません）');
      log('error', c.device.label, '通信モジュールがありません', id);
      return;
    }
    this.gen += 1;
    c.netId = `${id}#${this.gen}`;
    this.byNetId.set(c.netId, id);
    const proto = t === 'tcp' ? 'tcp' : 'udp';
    rt.setDeviceStatus(id, c.attempt > 0 ? 'reconnecting' : 'connecting');
    log('info', c.device.label, `${proto.toUpperCase()} ${h}:${p} に接続します`, id);
    const netId = c.netId;
    net.open(netId, proto, h, p, proto === 'udp' ? Math.max(0, port(c.config, 'localPort')) : 0).catch((e: unknown) => {
      if (c.netId !== netId) return;
      const msg = e instanceof Error ? e.message : String(e);
      this.failed(c, msg);
    });
  }

  /** Roland の USB / Bluetooth MIDI（同時に 1 台まで） */
  private connectMidi(c: Conn): void {
    const other = [...this.conns.values()].find((x) => x !== c && x.midi);
    if (other) {
      useRuntimeStore
        .getState()
        .setDeviceStatus(c.device.id, 'error', `MIDI は同時に 1 台までです（${other.device.label} が使っています）`);
      return;
    }
    const io: SessionIO = {
      def: c.def,
      config: c.config,
      write: async () => {
        throw new Error('MIDI では使いません');
      },
      setStatus: (status, error) => {
        if (this.conns.get(c.device.id) === c) useRuntimeStore.getState().setDeviceStatus(c.device.id, status, error);
      },
      setValues: (updates) => {
        if (this.conns.get(c.device.id) === c) useRuntimeStore.getState().setDeviceValues(c.device.id, updates);
      },
      log: (level, message) => log(level, c.device.label, message, c.device.id),
      fail: () => undefined,
    };
    c.midi = new MidiLink(io, this.midiProvider);
    void c.midi.start();
  }

  private onNetState(netId: string, state: NetState, error?: string): void {
    const id = this.byNetId.get(netId);
    const c = id ? this.conns.get(id) : undefined;
    if (!c || c.netId !== netId) return;
    const rt = useRuntimeStore.getState();
    if (state === 'ready') {
      c.attempt = 0;
      log('info', c.device.label, '接続しました', c.device.id);
      c.session?.dispose();
      c.session = createSession(this.sessionIO(c, netId));
      c.session.ready();
    } else if (state === 'connecting') {
      rt.setDeviceStatus(c.device.id, c.attempt > 0 ? 'reconnecting' : 'connecting');
    } else if (state === 'waiting') {
      // 経路が無い・相手が拒否など。Network.framework が自分で再試行するが、こちらも数えて開き直す
      this.failed(c, error ?? '接続を待っています');
    } else if (state === 'failed' || state === 'closed') {
      this.failed(c, error ?? (state === 'closed' ? '相手が接続を閉じました' : '接続できませんでした'));
    }
  }

  private failed(c: Conn, reason: string): void {
    if (!c.wanted || this.suspended) return;
    const rt = useRuntimeStore.getState();
    const delay = RECONNECT_STEPS_MS[Math.min(c.attempt, RECONNECT_STEPS_MS.length - 1)]!;
    c.attempt += 1;
    rt.setDeviceStatus(c.device.id, 'reconnecting', reason);
    log('warn', c.device.label, `${reason}。${delay / 1000} 秒後に接続し直します`, c.device.id);
    void this.closeNet(c);
    this.clearRetry(c);
    c.retry = setTimeout(() => {
      c.retry = null;
      if (c.wanted && this.conns.get(c.device.id) === c) this.connect(c);
    }, delay);
  }

  private onNetData(netId: string, base64: string): void {
    const id = this.byNetId.get(netId);
    const c = id ? this.conns.get(id) : undefined;
    if (!c || c.netId !== netId) return;
    const bytes = fromBase64(base64);
    log('debug', c.device.label, `受信 ${printable(bytes)}`, c.device.id);
    c.session?.data(bytes);
  }

  /** 通信手順に渡す口（この接続が古くなったら何もしない） */
  private sessionIO(c: Conn, netId: string): SessionIO {
    const alive = () => c.netId === netId && this.conns.get(c.device.id) === c;
    return {
      def: c.def,
      config: c.config,
      write: async (bytes) => {
        const net = this.net();
        if (!net || !alive()) throw new Error(`${c.device.label} に接続していません`);
        await net.send(netId, toBase64(bytes));
      },
      setStatus: (status, error) => {
        if (alive()) useRuntimeStore.getState().setDeviceStatus(c.device.id, status, error);
      },
      setValues: (updates) => {
        if (alive()) useRuntimeStore.getState().setDeviceValues(c.device.id, updates);
      },
      log: (level, message) => log(level, c.device.label, message, c.device.id),
      fail: (reason) => {
        if (alive()) this.failed(c, reason);
      },
    };
  }

  private clearRetry(c: Conn): void {
    if (c.retry) clearTimeout(c.retry);
    c.retry = null;
  }

  private async closeNet(c: Conn): Promise<void> {
    c.session?.dispose();
    c.session = null;
    c.midi?.stop();
    c.midi = null;
    if (!c.netId) return;
    const netId = c.netId;
    this.byNetId.delete(netId);
    c.netId = '';
    const net = this.netProvider();
    if (net) await net.close(netId).catch(() => undefined);
  }

  private drop(c: Conn, reason?: string): void {
    c.wanted = false;
    this.clearRetry(c);
    void this.closeNet(c);
    this.conns.delete(c.device.id);
    if (reason) log('info', c.device.label, reason, c.device.id);
  }

  /** 1 つの動作を送る（SPEC 4 章「送れた」の判定：TCP は書き込み完了、UDP/OSC は送信完了、HTTP は 2xx） */
  async send(device: Device, action: ActionDef, option: Values): Promise<SendResult> {
    const c = this.conns.get(device.id);
    if (!c) return { ok: false, reason: `${device.label} を準備していません` };
    const status = useRuntimeStore.getState().deviceStatus[device.id];
    if (status !== 'connected') return { ok: false, reason: `${device.label} に接続していません` };
    let payloads: Payload[];
    try {
      payloads = buildPayloads(c.def, action, option, c.config);
    } catch (e) {
      const msg = e instanceof PayloadError ? e.message : String(e);
      log('error', device.label, `${action.name}：${msg}`, device.id);
      return { ok: false, reason: msg };
    }
    // send と more を順に送る。途中で失敗したら残りは送らない
    for (const payload of payloads) {
      const r = await this.sendOne(c, device, action, option, payload);
      if (!r.ok) return r;
    }
    return { ok: true };
  }

  private async sendOne(c: Conn, device: Device, action: ActionDef, option: Values, payload: Payload): Promise<SendResult> {
    if (payload.kind === 'builtin') {
      if (!c.session?.sendBuiltin) return { ok: false, reason: `${action.name} はこの機器では使えません` };
      const r = await c.session.sendBuiltin(payload.name, option);
      if (!r.ok) log('error', device.label, `${action.name}：送れませんでした（${r.reason}）`, device.id);
      return r;
    }
    if (payload.kind === 'bytes' && c.midi) {
      const r = await c.midi.send(payload.bytes);
      if (!r.ok) log('error', device.label, `${action.name}：送れませんでした（${r.reason}）`, device.id);
      return r;
    }
    if (payload.kind === 'bytes') {
      if (!c.session) return { ok: false, reason: `${device.label} に接続していません` };
      if (c.def.session !== 'roland-lan') log('debug', device.label, `送信 ${printable(payload.bytes)}`, device.id);
      const r = await c.session.send(payload.bytes);
      if (!r.ok) log('error', device.label, `${action.name}：送れませんでした（${r.reason}）`, device.id);
      return r;
    }
    return this.sendHttp(c, payload);
  }

  private async sendHttp(c: Conn, p: { method: string; url: string; headers: Record<string, string>; body?: string }): Promise<SendResult> {
    const label = c.device.label;
    log('debug', label, `${p.method} ${p.url}`, c.device.id);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
    try {
      const res = await this.fetchImpl(p.url, { method: p.method, headers: p.headers, body: p.body, signal: ctrl.signal });
      const text = await res.text().catch(() => '');
      const vars = c.def.httpResponse;
      const updates: Record<string, string> = {};
      if (vars?.status) updates[vars.status] = String(res.status);
      if (vars?.body) updates[vars.body] = text.slice(0, 4096);
      if (Object.keys(updates).length) useRuntimeStore.getState().setDeviceValues(c.device.id, updates);
      if (res.status >= 200 && res.status < 300) {
        log('debug', label, `応答 ${res.status}`, c.device.id);
        return { ok: true };
      }
      log('warn', label, `応答 ${res.status}（2xx ではありません）`, c.device.id);
      return { ok: false, reason: `応答 ${res.status}` };
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      const msg = aborted ? `${HTTP_TIMEOUT_MS / 1000} 秒以内に応答がありません` : e instanceof Error ? e.message : String(e);
      log('error', label, `送れませんでした：${msg}`, c.device.id);
      return { ok: false, reason: msg };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** アプリ全体で 1 つ */
export const deviceManager = new DeviceManager();
