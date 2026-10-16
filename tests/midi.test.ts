import type { ConductorMidi, ConductorMidiEvents, MidiEndpointInfo } from '../modules/conductor-midi/src';
import { dt1, rolandChecksum, rq1, sysexToValues, textToSysex } from '@/drivers/rolandMidi';
import { findEndpoint, MidiLink, MIDI_RETRY_MS } from '@/engine/midiLink';
import { DeviceManager } from '@/engine/devices';
import { getActionDef, getDefinition } from '@/drivers/registry';
import { withDefaults } from '@/drivers/engine';
import type { SessionIO } from '@/drivers/sessions';
import { newDevice } from '@/model/devices';
import { newShow } from '@/model/defaults';
import { useRuntimeStore } from '@/stores/runtime';

const V160 = [0, 0, 0, 0, 2];
const hex = (a: number[]) => a.map((x) => x.toString(16).toUpperCase().padStart(2, '0')).join(' ');

describe('Roland SysEx（crosspoint SPEC 4-2 のテストベクタ）', () => {
  it.each([
    [dt1(V160, 0x002100, [0x01]), 'F0 41 10 00 00 00 00 02 12 00 21 00 01 5E F7'],
    [dt1(V160, 0x002100, [0x22]), 'F0 41 10 00 00 00 00 02 12 00 21 00 22 3D F7'],
    [dt1(V160, 0x0b001e, [0x01]), 'F0 41 10 00 00 00 00 02 12 0B 00 1E 01 56 F7'],
    [dt1(V160, 0x0b001e, [0x00]), 'F0 41 10 00 00 00 00 02 12 0B 00 1E 00 57 F7'],
    [dt1(V160, 0x0b001f, [0x01]), 'F0 41 10 00 00 00 00 02 12 0B 00 1F 01 55 F7'],
    [dt1(V160, 0x002102, [0x08, 0x00]), 'F0 41 10 00 00 00 00 02 12 00 21 02 08 00 55 F7'],
    [rq1(V160, 0x002100, 2), 'F0 41 10 00 00 00 00 02 11 00 21 00 00 00 02 5D F7'],
    [rq1(V160, 0x020000, 6), 'F0 41 10 00 00 00 00 02 11 02 00 00 00 00 06 78 F7'],
  ])('%#', (bytes, want) => {
    expect(hex(bytes)).toBe(want);
  });
  it('LAN の命令から SysEx へ（CUT は 2 通、VER は送らない、簡易制御コマンドは使えない）', () => {
    expect(textToSysex('DTH:0B001E,01;DTH:0B001E,00;\n', V160).map(hex)).toEqual([
      'F0 41 10 00 00 00 00 02 12 0B 00 1E 01 56 F7',
      'F0 41 10 00 00 00 00 02 12 0B 00 1E 00 57 F7',
    ]);
    expect(textToSysex('VER;', V160)).toEqual([]);
    expect(() => textToSysex('CUT;', [1, 5, 0x14])).toThrow('LAN で接続');
  });
  it('届いた DT1 を変数へ（機種が違う・壊れているものは無視）', () => {
    expect(sysexToValues(dt1(V160, 0x002100, [0x20, 0x22]), V160)).toEqual({ addr_002100: '20', addr_002101: '22' });
    expect(sysexToValues(dt1([1, 5, 0x14], 0x002100, [1]), V160)).toBeNull();
    const bad = dt1(V160, 0x002100, [1]);
    bad[bad.length - 2] = 0;
    expect(sysexToValues(bad, V160)).toBeNull();
    expect(rolandChecksum([0x00, 0x21, 0x00, 0x01])).toBe(0x5e);
  });
});

function ep(over: Partial<MidiEndpointInfo>): MidiEndpointInfo {
  return {
    uniqueId: 1,
    sourceUniqueId: 2,
    name: 'V-160HD',
    deviceName: 'V-160HD',
    transport: 'usb',
    online: true,
    driverOwner: '',
    ...over,
  };
}

class FakeMidi implements ConductorMidi {
  endpoints: MidiEndpointInfo[] = [];
  sent: number[][] = [];
  opened: number[] = [];
  private l: { [K in keyof ConductorMidiEvents]: ConductorMidiEvents[K][] } = {
    onSysEx: [],
    onEndpointsChanged: [],
    onLinkLost: [],
    onLog: [],
  };
  async listEndpoints() {
    return this.endpoints;
  }
  async open(dest: number) {
    this.opened.push(dest);
  }
  async close() {}
  async sendSysEx(b: number[]) {
    this.sent.push(b);
  }
  async presentBluetoothPicker() {}
  addListener<K extends keyof ConductorMidiEvents>(event: K, listener: ConductorMidiEvents[K]) {
    this.l[event].push(listener);
    return { remove: () => undefined };
  }
  emit<K extends keyof ConductorMidiEvents>(event: K, ev: Parameters<ConductorMidiEvents[K]>[0]) {
    for (const fn of this.l[event]) (fn as (e: typeof ev) => void)(ev);
  }
}

describe('MIDI でつなぐ', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('端点の選び方', () => {
    const list = [
      ep({ name: 'Bluetooth', deviceName: 'BT-MIDI', online: true }),
      ep({ uniqueId: 5, name: 'V-160HD Control', deviceName: 'V-160HD' }),
      ep({ name: 'X', deviceName: 'X', online: false }),
    ];
    expect(findEndpoint(list, '', 'Roland V-160HD')?.uniqueId).toBe(5);
    expect(findEndpoint(list, 'bluetooth', 'Roland V-160HD')?.name).toBe('Bluetooth');
    expect(findEndpoint(list, '', 'Roland V-80HD')).toBeUndefined();
  });

  it('見つかるまで待ち、開いたら状態を問い合わせ、送る・受け取る', async () => {
    const midi = new FakeMidi();
    useRuntimeStore.setState({ deviceStatus: {}, deviceError: {}, deviceValues: {} });
    const m = new DeviceManager(
      () => null,
      fetch,
      () => midi,
    );
    const base = newDevice(getDefinition('roland-v160hd')!, []);
    const d = { ...base, config: { ...base.config, link: 'midi' } };
    const show = newShow('T');
    show.devices = [d];
    m.sync(show);
    await jest.advanceTimersByTimeAsync(1);
    expect(useRuntimeStore.getState().deviceStatus[d.id]).toBe('reconnecting');
    midi.endpoints = [ep({})];
    await jest.advanceTimersByTimeAsync(MIDI_RETRY_MS);
    expect(useRuntimeStore.getState().deviceStatus[d.id]).toBe('connected');
    // onConnect の RQH が SysEx で出ている（DTH:0C0100 のタリー購読も）
    expect(midi.sent.map(hex)).toContain('F0 41 10 00 00 00 00 02 11 00 21 00 00 00 02 5D F7');
    const r = await m.send(d, getActionDef('roland-v160hd', 'pgm')!, { input: '22' });
    expect(r).toEqual({ ok: true });
    expect(hex(midi.sent[midi.sent.length - 1]!)).toBe('F0 41 10 00 00 00 00 02 12 00 21 00 22 3D F7');
    midi.emit('onSysEx', { bytes: dt1(V160, 0x002100, [0x23]), ts: 0 });
    expect(useRuntimeStore.getState().deviceValues[d.id]?.pgm).toBe('4');
    midi.emit('onLinkLost', { uniqueId: 1 });
    expect(useRuntimeStore.getState().deviceStatus[d.id]).toBe('reconnecting');
    m.stopAll();
  });

  it('MIDI で使えない命令・2 台目', async () => {
    const midi = new FakeMidi();
    midi.endpoints = [ep({ name: 'V-80HD', deviceName: 'V-80HD' })];
    useRuntimeStore.setState({ deviceStatus: {}, deviceError: {}, deviceValues: {} });
    const m = new DeviceManager(
      () => null,
      fetch,
      () => midi,
    );
    const def = getDefinition('roland-v80hd')!;
    const a = { ...newDevice(def, []), config: { ...withDefaults(def.configFields, {}), link: 'midi' } };
    const b = { ...newDevice(def, [a]), config: { ...withDefaults(def.configFields, {}), link: 'midi' } };
    const show = newShow('T');
    show.devices = [a, b];
    m.sync(show);
    await jest.advanceTimersByTimeAsync(1);
    expect(useRuntimeStore.getState().deviceStatus[a.id]).toBe('connected');
    expect(useRuntimeStore.getState().deviceStatus[b.id]).toBe('error');
    const r = await m.send(a, getActionDef('roland-v80hd', 'cut')!, {});
    expect(r.ok).toBe(false);
    m.stopAll();
  });

  it('モジュールが無い時', async () => {
    const f: SessionIO = {
      def: getDefinition('roland-v160hd')!,
      config: {},
      write: async () => undefined,
      setStatus: jest.fn(),
      setValues: jest.fn(),
      log: jest.fn(),
      fail: jest.fn(),
    };
    const link = new MidiLink(f, () => null);
    await link.start();
    expect(f.setStatus).toHaveBeenCalledWith('error', expect.stringContaining('MIDI モジュール'));
  });
});
