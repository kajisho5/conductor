/**
 * ATEM の追加の動作（Companion 相当へ広げた分）。中身の並びの正解は atem-connection（MIT）の serialize。
 */
import { AtemSession, ATEM_V8_0, ATEM_V8_0_1, buildAtemCommand, command, commandToValues, type AtemContext } from '@/drivers/atem';
import type { SessionIO } from '@/drivers/sessions';
import { getDefinition } from '@/drivers/registry';
import { withDefaults } from '@/drivers/engine';
import { header, PacketFlag } from '@/drivers/atem';

const def = getDefinition('atem')!;
const body = (name: string, o: Record<string, string | number | boolean>, ctx?: AtemContext) => {
  const c = buildAtemCommand(name, o, ctx);
  expect(c).not.toBeNull();
  return { name: String.fromCharCode(...c!.subarray(4, 8)), body: Array.from(c!.subarray(8)), len: (c![0]! << 8) | c![1]! };
};
const ctx = (p: Partial<AtemContext> = {}): AtemContext => ({ version: 0, fairlightSources: new Map(), values: {}, ...p });

describe('ATEM の追加の動作', () => {
  it('トランジション', () => {
    expect(body('atem.tbar', { position: 50, me: 1 })).toEqual({ name: 'CTPs', body: [1, 0, 0x13, 0x88], len: 12 });
    expect(body('atem.prevTrans', { on: 'on', me: 0 }).body).toEqual([0, 1, 0, 0]);
    expect(body('atem.prevTrans', { on: 'toggle', me: 0 }, ctx({ values: { prev_trans: 'ON' } })).body).toEqual([0, 0, 0, 0]);
    expect(body('atem.transStyle', { style: '2', me: 0 })).toEqual({ name: 'CTTp', body: [1, 0, 2, 0], len: 12 });
    expect(body('atem.transSelection', { bg: true, key1: false, key2: true, me: 0 }).body).toEqual([2, 0, 0, 0b101]);
    expect(body('atem.transSelection', { bg: false, me: 0 }).body).toEqual([2, 0, 0, 1]);
    expect(body('atem.transRate', { style: 'mix', rate: 30, me: 0 })).toEqual({ name: 'CTMx', body: [0, 30, 0, 0], len: 12 });
    expect(body('atem.transRate', { style: 'dip', rate: 30, me: 0 })).toEqual({ name: 'CTDp', body: [1, 0, 30, 0, 0, 0, 0, 0], len: 16 });
    const wipe = body('atem.transRate', { style: 'wipe', rate: 30, me: 1 });
    expect(wipe.name).toBe('CTWp');
    expect(wipe.len).toBe(28);
    expect(wipe.body.slice(0, 4)).toEqual([0, 1, 1, 30]);
    expect(body('atem.ftbRate', { rate: 50, me: 0 })).toEqual({ name: 'FtbC', body: [1, 0, 50, 0], len: 12 });
  });

  it('キー・DSK', () => {
    expect(body('atem.uskOnAir', { key: 2, on: 'on', me: 0 })).toEqual({ name: 'CKOn', body: [0, 1, 1, 0], len: 12 });
    expect(body('atem.uskOnAir', { key: 1, on: 'toggle', me: 0 }, ctx({ values: { usk_1: 'ON' } })).body).toEqual([0, 0, 0, 0]);
    expect(body('atem.uskFill', { key: 1, input: 3010, me: 0 })).toEqual({ name: 'CKeF', body: [0, 0, 0x0b, 0xc2], len: 12 });
    expect(body('atem.uskCut', { key: 1, input: 3011, me: 0 }).body).toEqual([0, 0, 0x0b, 0xc3]);
    expect(body('atem.uskType', { key: 1, type: '3', me: 0 })).toEqual({ name: 'CKTp', body: [1, 0, 0, 3, 0, 0, 0, 0], len: 16 });
    expect(body('atem.dskAuto', { dsk: 2 }).body).toEqual([1, 0, 0, 0]);
    expect(body('atem.dskAuto', { dsk: 2 }, ctx({ version: ATEM_V8_0_1 })).body).toEqual([0, 1, 0, 0]);
    expect(body('atem.dskTie', { dsk: 1, on: 'on' })).toEqual({ name: 'CDsT', body: [0, 1, 0, 0], len: 12 });
    expect(body('atem.dskRate', { dsk: 1, rate: 20 })).toEqual({ name: 'CDsR', body: [0, 20, 0, 0], len: 12 });
    expect(body('atem.dskFill', { dsk: 1, input: 3010 }).body).toEqual([0, 0, 0x0b, 0xc2]);
    expect(body('atem.dskCut', { dsk: 2, input: 3011 }).body).toEqual([1, 0, 0x0b, 0xc3]);
    expect(body('atem.dsk', { dsk: 1, onAir: 'toggle' }, ctx({ values: { dsk_1: 'OFF' } })).body).toEqual([0, 1, 0, 0]);
  });

  it('マクロ・メディア・マルチビュー・入力名', () => {
    expect(body('atem.macroStop', {}).body).toEqual([0xff, 0xff, 1, 0]);
    expect(body('atem.macroContinue', {}).body).toEqual([0xff, 0xff, 4, 0]);
    expect(body('atem.macroLoop', { on: 'on' })).toEqual({ name: 'MRCP', body: [1, 1, 0, 0], len: 12 });
    expect(body('atem.mpSource', { mp: 1, kind: 'still', n: 3 })).toEqual({ name: 'MPSS', body: [3, 0, 1, 2, 0, 0, 0, 0], len: 16 });
    expect(body('atem.mpSource', { mp: 2, kind: 'clip', n: 1 }).body).toEqual([5, 1, 2, 0, 0, 0, 0, 0]);
    expect(body('atem.mpPlay', { mp: 1, on: 'on' })).toEqual({ name: 'SCPS', body: [1, 0, 1, 0, 0, 0, 0, 0], len: 16 });
    expect(body('atem.mpLoop', { mp: 1, on: 'on' }).body).toEqual([2, 0, 0, 1, 0, 0, 0, 0]);
    expect(body('atem.mpBegin', { mp: 1 }).body).toEqual([4, 0, 0, 0, 1, 0, 0, 0]);
    expect(body('atem.captureStill', {})).toEqual({ name: 'Capt', body: [], len: 8 });
    expect(body('atem.clearStill', { n: 5 })).toEqual({ name: 'CSTL', body: [4, 0, 0, 0], len: 12 });
    expect(body('atem.mvSource', { mv: 1, window: 3, input: 2 })).toEqual({ name: 'CMvI', body: [0, 2, 0, 2], len: 12 });
    expect(body('atem.mvLayout', { mv: 2, layout: '12' })).toEqual({ name: 'CMvP', body: [1, 1, 12, 0], len: 12 });
    const name = body('atem.inputName', { input: 1, long: 'CAM A', short: 'CAMA' });
    expect(name.name).toBe('CInL');
    expect(name.len).toBe(40);
    expect(name.body.slice(0, 9)).toEqual([3, 0, 0, 1, 0x43, 0x41, 0x4d, 0x20, 0x41]);
    expect(name.body.slice(24, 28)).toEqual([0x43, 0x41, 0x4d, 0x41]);
    expect(buildAtemCommand('atem.inputName', { input: 1, long: '', short: '' })).toBeNull();
  });

  it('収録・配信・SuperSource・本体', () => {
    expect(body('atem.record', { on: 'toggle' }, ctx({ values: { recording: 'OFF' } }))).toEqual({ name: 'RcTM', body: [1, 0, 0, 0], len: 12 });
    expect(body('atem.stream', { on: 'toggle' }, ctx({ values: { streaming: 'ON' } }))).toEqual({ name: 'StrR', body: [0, 0, 0, 0], len: 12 });
    const old = body('atem.ssrcBox', { box: 2, input: 3, on: 'on', ssrc: 1 });
    expect(old.len).toBe(32);
    expect(old.body.slice(0, 6)).toEqual([0, 3, 1, 1, 0, 3]);
    const v8 = body('atem.ssrcBox', { box: 2, input: 3, on: 'on', ssrc: 2 }, ctx({ version: ATEM_V8_0 }));
    expect(v8.body.slice(0, 8)).toEqual([0, 3, 1, 1, 1, 0, 0, 3]);
    expect(body('atem.saveStartup', {})).toEqual({ name: 'SRsv', body: [0, 0, 0, 0], len: 12 });
    expect(body('atem.clearStartup', {}).name).toBe('SRcl');
  });

  it('音声（従来は CAMI、Fairlight は届いた音源 ID で CFSP）', () => {
    expect(body('atem.audioMix', { input: 2, mode: 'afv' })).toEqual({ name: 'CAMI', body: [1, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 0], len: 20 });
    // 0 dB → 32768
    expect(body('atem.audioGain', { input: 1, db: 0 }).body).toEqual([2, 0, 0, 1, 0, 0, 0x80, 0x00, 0, 0, 0, 0]);
    expect(body('atem.masterGain', { db: 0 })).toEqual({ name: 'CAMM', body: [1, 0, 0x80, 0x00, 0, 0, 0, 0], len: 16 });
    const src = Uint8Array.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01, 0x00]);
    const fl = ctx({ fairlightSources: new Map([[1, src]]) });
    const mix = body('atem.audioMix', { input: 1, mode: 'on' }, fl);
    expect(mix.name).toBe('CFSP');
    expect(mix.len).toBe(56);
    expect(mix.body.slice(0, 4)).toEqual([0x01, 0, 0, 1]);
    expect(mix.body.slice(8, 16)).toEqual(Array.from(src));
    expect(mix.body[44]).toBe(2);
    const gain = body('atem.audioGain', { input: 1, db: -10 }, fl);
    expect(gain.body.slice(0, 2)).toEqual([0, 0x80]);
    expect(gain.body.slice(40, 44)).toEqual([0xff, 0xff, 0xfc, 0x18]);
    const master = body('atem.masterGain', { db: -10 }, fl);
    expect(master).toMatchObject({ name: 'CFMP', len: 28 });
    expect(master.body.slice(0, 1)).toEqual([8]);
    expect(master.body.slice(12, 16)).toEqual([0xff, 0xff, 0xfc, 0x18]);
  });

  it('受信 → 変数', () => {
    expect(commandToValues('TrSS', Uint8Array.from([0, 2, 1, 0, 3, 0, 0, 0]))).toEqual({ trans_style: 'WIPE', trans_next_style: 'MIX', trans_next_selection: '3' });
    expect(commandToValues('TrPs', Uint8Array.from([0, 1, 10, 0, 0x13, 0x88, 0, 0]))).toEqual({ in_transition: 'ON', tbar: '50' });
    expect(commandToValues('KeOn', Uint8Array.from([1, 0, 1, 0]))).toEqual({ usk_1_me2: 'ON' });
    expect(commandToValues('DskP', Uint8Array.from([0, 1, 25, 0]))).toEqual({ dsk_1_tie: 'ON', dsk_1_rate: '25' });
    expect(commandToValues('MRPr', Uint8Array.from([1, 0, 0, 4]))).toEqual({ macro_running: 'ON', macro_waiting: 'OFF', macro_loop: 'OFF', macro_running_index: '5' });
    expect(commandToValues('MPCE', Uint8Array.from([0, 2, 0, 1]))).toEqual({ mp_1_source: 'クリップ 2' });
    expect(commandToValues('RTMS', Uint8Array.from([0, 1, 0, 0]))).toEqual({ recording: 'ON' });
    expect(commandToValues('StRS', Uint8Array.from([0, 4, 0, 0]))).toEqual({ streaming: 'ON' });
    expect(commandToValues('StRS', Uint8Array.from([0, 2, 0, 0]))).toEqual({ streaming: '接続中' });
    expect(commandToValues('_ver', Uint8Array.from([0, 2, 0, 0x1d]))).toEqual({ protocol_version: '2.29' });
    const fasp = new Uint8Array(56);
    fasp[1] = 3;
    fasp[49] = 4;
    expect(commandToValues('FASP', fasp)).toEqual({ audio_3: 'AFV' });
    expect(commandToValues('SSBP', Uint8Array.from([0, 1, 1, 0, 0, 5]), ATEM_V8_0)).toEqual({ ssrc_box_2: 'ON', ssrc_box_2_source: '5' });
  });

  it('定義の動作はどれも既定値でコマンドになる', () => {
    expect(def.actions.length).toBeGreaterThanOrEqual(40);
    for (const a of def.actions) {
      if (a.send.kind !== 'builtin') continue;
      const o = withDefaults(a.options, {}) as Record<string, string | number | boolean>;
      if (a.id === 'input_name') o.long = 'X';
      expect(buildAtemCommand(a.send.name, o)).not.toBeNull();
    }
  });
});

describe('ATEM のセッションが状態を覚える', () => {
  it('_ver と FASP を覚えて動作に使う', async () => {
    const written: Uint8Array[] = [];
    const io: SessionIO = {
      def,
      config: { host: '192.0.2.10', port: 9910 },
      write: async (b) => {
        written.push(b);
      },
      setStatus: () => undefined,
      setValues: () => undefined,
      log: () => undefined,
      fail: () => undefined,
    };
    const s = new AtemSession(io);
    s.ready();
    const pkt = (flags: number, remote: number, payload: Uint8Array = new Uint8Array(0)) => {
      const out = new Uint8Array(12 + payload.length);
      out.set(header(flags, out.length, 0x8001, 0, remote));
      out.set(payload, 12);
      return out;
    };
    s.data(pkt(PacketFlag.NewSessionId, 0));
    const fasp = new Array<number>(48).fill(0);
    fasp[1] = 1;
    fasp.splice(8, 8, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01, 0x00);
    const all = [...command('_ver', [0, 2, 0, 0x1e]), ...command('FASP', fasp), ...command('InCm', [1, 0, 0, 0])];
    s.data(pkt(PacketFlag.AckRequest, 1, Uint8Array.from(all)));
    void s.sendBuiltin('atem.dskAuto', { dsk: 2 });
    const dsk = written.at(-1)!;
    expect(Array.from(dsk.subarray(16, 24))).toEqual([...'DDsA'].map((c) => c.charCodeAt(0)).concat([0, 1, 0, 0]));
    void s.sendBuiltin('atem.audioMix', { input: 1, mode: 'off' });
    const mix = written.at(-1)!;
    expect(String.fromCharCode(...mix.subarray(16, 20))).toBe('CFSP');
    expect(mix[20 + 44]).toBe(1);
    s.dispose();
  });
});
