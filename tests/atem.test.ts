import {
  AtemSession,
  ATEM_TIMING,
  buildAtemCommand,
  command,
  commandToValues,
  header,
  HELLO,
  PacketFlag,
  parseCommands,
} from '@/drivers/atem';
import type { SessionIO } from '@/drivers/sessions';
import { getDefinition, getActionDef } from '@/drivers/registry';
import { buttonFromPreset } from '@/model/presets';
import { newDevice, renameDeviceReferences } from '@/model/devices';
import { demoShow } from '@/model/defaults';
import { cellKey } from '@/model/grid';

const def = getDefinition('atem')!;

function packet(flags: number, session: number, remoteId: number, payload: Uint8Array = new Uint8Array(0), ackId = 0): Uint8Array {
  const p = new Uint8Array(12 + payload.length);
  p.set(header(flags, 12 + payload.length, session, ackId, remoteId));
  p.set(payload, 12);
  return p;
}

function concat(...a: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of a) {
    out.set(x, o);
    o += x.length;
  }
  return out;
}

function str(s: string, len: number): number[] {
  const out = new Array(len).fill(0);
  for (let i = 0; i < s.length && i < len; i++) out[i] = s.charCodeAt(i);
  return out;
}

function fakeIO() {
  const written: Uint8Array[] = [];
  const status: string[] = [];
  const values: Record<string, string> = {};
  const failures: string[] = [];
  const io: SessionIO = {
    def,
    config: { host: '192.0.2.40', port: 9910 },
    write: async (b) => {
      written.push(b);
    },
    setStatus: (s) => status.push(s),
    setValues: (u) => Object.assign(values, u),
    log: () => undefined,
    fail: (r) => failures.push(r),
  };
  return { io, written, status, values, failures };
}

describe('ATEM の部品', () => {
  it('コマンドの組み立て（atem-connection と同じ並び）', () => {
    expect(Array.from(buildAtemCommand('atem.pgm', { input: 3, me: 1 })!)).toEqual([
      0,
      12,
      0,
      0,
      ...'CPgI'.split('').map((c) => c.charCodeAt(0)),
      1,
      0,
      0,
      3,
    ]);
    expect(Array.from(buildAtemCommand('atem.cut', { me: 0 })!.subarray(4, 8))).toEqual([...'DCut'].map((c) => c.charCodeAt(0)));
    expect(Array.from(buildAtemCommand('atem.macro', { n: 2 })!.subarray(8))).toEqual([0, 1, 0, 0]);
    expect(Array.from(buildAtemCommand('atem.aux', { aux: 2, input: 1000 })!.subarray(8))).toEqual([1, 1, 0x03, 0xe8]);
    expect(Array.from(buildAtemCommand('atem.dsk', { dsk: 1, onAir: 'off' })!.subarray(8))).toEqual([0, 0, 0, 0]);
    expect(buildAtemCommand('atem.nope', {})).toBeNull();
  });
  it('頭の 12 バイト', () => {
    expect(Array.from(header(PacketFlag.AckReply, 12, 0x1234, 7, 0))).toEqual([0x80, 0x0c, 0x12, 0x34, 0, 7, 0, 0, 0, 0, 0, 0]);
    expect(HELLO[0]! >> 3).toBe(PacketFlag.NewSessionId);
  });
  it('受け取ったコマンドを変数へ', () => {
    const cmds = parseCommands(
      concat(
        command('_pin', [...str('ATEM Mini', 40), 0x0d, 0, 0, 0]),
        command('PrgI', [0, 0, 0, 2]),
        command('PrvI', [1, 0, 0, 5, 0, 0, 0, 0]),
        command('TlSr', [0, 2, 0, 1, 1, 0, 2, 2]),
        command('InPr', [0, 1, ...str('Camera 1', 20), ...str('CAM1', 4), ...new Array(12).fill(0)]),
        command('FtbS', [0, 1, 0, 0]),
      ),
    );
    const all = Object.assign({}, ...cmds.map((c) => commandToValues(c.name, c.body)));
    expect(all).toEqual({
      model: 'ATEM Mini',
      pgm: '2',
      pvw_me2: '5',
      tally_1: 'PGM',
      tally_2: 'PST',
      input_1_name: 'Camera 1',
      input_1_short: 'CAM1',
      ftb: 'ON',
    });
  });
});

describe('ATEM の接続の手順', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('HELLO → セッション → 初期の状態 → 接続中 → 送って ack', async () => {
    const f = fakeIO();
    const s = new AtemSession(f.io);
    s.ready();
    expect(f.written[0]).toEqual(HELLO);
    s.data(packet(PacketFlag.NewSessionId, 0x8001, 0));
    expect(Array.from(f.written[1]!.subarray(0, 6))).toEqual([0x80, 0x0c, 0x80, 0x01, 0, 0]);
    s.data(packet(PacketFlag.AckRequest, 0x8001, 1, concat(command('PrgI', [0, 0, 0, 4]), command('InCm', [1, 0, 0, 0]))));
    expect(f.status).toContain('connected');
    expect(f.values.pgm).toBe('4');
    // 同じ番号の送り直しは中身を使わない
    s.data(packet(PacketFlag.AckRequest, 0x8001, 1, command('PrgI', [0, 0, 0, 9])));
    expect(f.values.pgm).toBe('4');
    const p = s.sendBuiltin('atem.pgm', { input: 2, me: 0 });
    const sent = f.written[f.written.length - 1]!;
    expect(sent[0]! >> 3).toBe(PacketFlag.AckRequest);
    const id = (sent[10]! << 8) | sent[11]!;
    s.data(packet(PacketFlag.AckReply, 0x8001, 0, new Uint8Array(0), id));
    expect(await p).toEqual({ ok: true });
    s.dispose();
  });

  it('ack が来なければ送り直し、それでも来なければ送れなかった', async () => {
    const f = fakeIO();
    const s = new AtemSession(f.io);
    s.ready();
    s.data(packet(PacketFlag.NewSessionId, 1, 0));
    s.data(packet(PacketFlag.AckRequest, 1, 1, command('InCm', [1, 0, 0, 0])));
    const before = f.written.length;
    const p = s.sendBuiltin('atem.cut', { me: 0 });
    await jest.advanceTimersByTimeAsync(ATEM_TIMING.resendMs * ATEM_TIMING.resendTimes + 10);
    expect(await p).toEqual({ ok: false, reason: 'ATEM から受理の応答（ack）がありません' });
    const sends = f.written.slice(before).filter((b) => b[0]! >> 3 !== PacketFlag.AckReply);
    expect(sends).toHaveLength(ATEM_TIMING.resendTimes);
    expect((sends[1]![0]! >> 3) & PacketFlag.IsRetransmit).toBeTruthy();
    s.dispose();
  });

  it('準備前は送らない・応答が無ければ接続し直し', async () => {
    const f = fakeIO();
    const s = new AtemSession(f.io);
    s.ready();
    expect(await s.sendBuiltin('atem.cut', {})).toEqual({ ok: false, reason: 'ATEM の準備ができていません' });
    await jest.advanceTimersByTimeAsync(ATEM_TIMING.silenceMs + 1);
    expect(f.failures).toHaveLength(1);
    s.dispose();
  });
});

describe('ATEM の定義・プリセット', () => {
  it('定義の動作は builtin、プリセットは入力名をボタン変数で出す', () => {
    expect(getActionDef('atem', 'pgm')!.send).toEqual({ kind: 'builtin', name: 'atem.pgm' });
    const device = { ...newDevice(def, []), label: 'ATEM-1' };
    const preset = def.presets!.find((p) => p.id === 'pgm3')!;
    const b = buttonFromPreset(device, preset);
    expect(b.localVariables[0]).toMatchObject({ name: 'name', value: '$(ATEM-1:input_3_short)' });
    expect(b.feedbacks[0]).toMatchObject({ definitionId: 'pgm_is', options: { input: '3' } });
  });
  it('機器の名前を変えると $(…) も変わる', () => {
    const s = demoShow();
    const key = cellKey(0, 0);
    s.pages[0]!.buttons[key]!.style.text = 'PGM $(DEMO-SW-A:pgm)';
    const r = renameDeviceReferences(s, 'DEMO-SW-A', 'SW-MAIN');
    expect(r.pages[0]!.buttons[key]!.style.text).toBe('PGM $(SW-MAIN:pgm)');
    expect(renameDeviceReferences(s, 'X', 'X')).toBe(s);
  });
});
