import { getConductorMidi, type ConductorMidi, type MidiEndpointInfo } from '../../modules/conductor-midi/src';
import { applyDerive, renderTemplate, type Values } from '@/drivers/engine';
import { hexModelId, payloadToSysex, sysexToValues, SysexError, textToSysex } from '@/drivers/rolandMidi';
import type { SendResult, SessionIO } from '@/drivers/sessions';

/**
 * Roland の USB / Bluetooth MIDI 接続（SPEC 8.5）。CoreMIDI（modules/conductor-midi）の上で、
 * 定義の LAN 命令を SysEx に置き換えて送り、届いた DT1 を変数にする。
 * CoreMIDI モジュールは同時に 1 つの機器しか開けないので、MIDI で使える機器は 1 台まで。
 */

export const MIDI_RETRY_MS = 3000;

/** 設定の名前（空なら機種名を含む端点）に合う、つながっている端点 */
export function findEndpoint(endpoints: MidiEndpointInfo[], wanted: string, modelName: string): MidiEndpointInfo | undefined {
  const online = endpoints.filter((e) => e.online && e.sourceUniqueId !== 0);
  const w = wanted.trim().toLowerCase();
  if (w)
    return (
      online.find((e) => e.name.toLowerCase() === w || e.deviceName.toLowerCase() === w) ??
      online.find((e) => e.name.toLowerCase().includes(w))
    );
  const m = modelName.replace(/^Roland\s+/i, '').toLowerCase();
  return online.find((e) => e.name.toLowerCase().includes(m) || e.deviceName.toLowerCase().includes(m));
}

export class MidiLink {
  private midi: ConductorMidi | null = null;
  private subs: { remove: () => void }[] = [];
  private polls: ReturnType<typeof setInterval>[] = [];
  private retry: ReturnType<typeof setTimeout> | null = null;
  private open_ = false;
  private closed = false;
  private readonly modelId: number[];

  constructor(
    private readonly io: SessionIO,
    private readonly provider: () => ConductorMidi | null = getConductorMidi,
  ) {
    this.modelId = hexModelId(String(io.def.midiModelId ?? ''));
  }

  async start(): Promise<void> {
    this.midi = this.provider();
    if (!this.midi) {
      this.io.setStatus('error', 'MIDI モジュールがありません（アプリのビルドに含まれていません）');
      return;
    }
    if (this.modelId.length === 0) {
      this.io.setStatus('error', 'この機種は MIDI の定義がありません');
      return;
    }
    const midi = this.midi;
    this.subs.push(
      midi.addListener('onSysEx', (ev) => this.receive(ev.bytes)),
      midi.addListener('onLinkLost', () => {
        if (this.open_) this.lost('MIDI の機器が外れました');
      }),
      midi.addListener('onEndpointsChanged', () => {
        if (!this.open_ && !this.closed) void this.tryOpen();
      }),
    );
    await this.tryOpen();
  }

  private async tryOpen(): Promise<void> {
    const midi = this.midi;
    if (!midi || this.closed || this.open_) return;
    this.io.setStatus('connecting', 'MIDI の機器を探しています');
    let endpoints: MidiEndpointInfo[];
    try {
      endpoints = await midi.listEndpoints();
    } catch (e) {
      this.wait(`MIDI を使えません（${e instanceof Error ? e.message : String(e)}）`);
      return;
    }
    const ep = findEndpoint(endpoints, String(this.io.config.midiName ?? ''), this.io.def.name);
    if (!ep) {
      this.wait('MIDI の機器が見つかりません。USB でつなぐか、Bluetooth で追加してください');
      return;
    }
    try {
      await midi.open(ep.uniqueId, ep.sourceUniqueId);
    } catch (e) {
      this.wait(`MIDI の機器を開けません（${e instanceof Error ? e.message : String(e)}）`);
      return;
    }
    if (this.closed) return;
    this.open_ = true;
    this.io.log('info', `MIDI「${ep.name}」（${ep.transport}）を開きました`);
    this.io.setStatus('connected');
    this.routine();
  }

  /** onConnect と poll（VER; などの MIDI で送れない命令は飛ばす） */
  private routine(): void {
    const ctx = { config: this.io.config };
    const sendText = (text: string) => {
      try {
        for (const m of textToSysex(renderTemplate(text, ctx), this.modelId)) void this.midi?.sendSysEx(m).catch(() => undefined);
      } catch {
        // MIDI では使えない命令（簡易制御コマンドなど）は送らない
      }
    };
    for (const line of this.io.def.onConnect ?? []) sendText(line);
    for (const p of this.io.def.poll ?? []) if (p.intervalMs >= 100) this.polls.push(setInterval(() => sendText(p.data), p.intervalMs));
  }

  private receive(bytes: number[]): void {
    if (!this.open_) return;
    const v = sysexToValues(bytes, this.modelId);
    if (v) this.io.setValues(applyDerive(this.io.def.derive, v));
  }

  async send(payload: Uint8Array): Promise<SendResult> {
    if (!this.open_ || !this.midi) return { ok: false, reason: 'MIDI の機器を開いていません' };
    let messages: number[][];
    try {
      messages = payloadToSysex(payload, this.modelId);
    } catch (e) {
      return { ok: false, reason: e instanceof SysexError ? e.message : String(e) };
    }
    try {
      for (const m of messages) await this.midi.sendSysEx(m);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  }

  private wait(reason: string): void {
    this.io.setStatus('reconnecting', reason);
    if (this.retry) clearTimeout(this.retry);
    this.retry = setTimeout(() => {
      this.retry = null;
      void this.tryOpen();
    }, MIDI_RETRY_MS);
  }

  private lost(reason: string): void {
    this.open_ = false;
    for (const t of this.polls) clearInterval(t);
    this.polls = [];
    this.io.log('warn', reason);
    this.wait(reason);
  }

  stop(): void {
    this.closed = true;
    if (this.retry) clearTimeout(this.retry);
    for (const t of this.polls) clearInterval(t);
    this.polls = [];
    for (const s of this.subs) s.remove();
    this.subs = [];
    if (this.open_) void this.midi?.close().catch(() => undefined);
    this.open_ = false;
  }
}

export type { Values };
