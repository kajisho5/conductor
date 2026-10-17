/**
 * OSEE GoStream シリーズの通信手順（src/drivers/osee.ts）と定義（scripts/drivers/build_osee.py）。
 * 枠の正解は、公開 OSS のモジュール osee-gostream-series（MIT）が送ったバイト列（conductor-drivers の記録）。
 */
import { getActionDef, getDefinition } from '@/drivers/registry';
import { buildPayload, withDefaults, checkFeedback, applyDerive } from '@/drivers/engine';
import { utf8Decode } from '@/drivers/bytes';
import type { SessionIO } from '@/drivers/sessions';
import { crc16Modbus, encodeOsee, OseeDecoder, oseeValues, OseeSession, parseOseeText } from '@/drivers/osee';

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));

// モジュールが接続直後に送った最初の 1 枠（{"id":"buildInfo","type":"get"}）
const BUILD_INFO = 'eba60021007b226964223a226275696c64496e666f222c2274797065223a22676574227d1bb4';

describe('OSEE の枠', () => {
  it('公開 OSS の送信と同じバイト列になる（長さ・CRC-16/MODBUS は LE）', () => {
    expect(hex(encodeOsee({ id: 'buildInfo', type: 'get' }))).toBe(BUILD_INFO);
    expect(crc16Modbus(new TextEncoder().encode('123456789'))).toBe(0x4b37);
  });

  it('くっついた・分かれた・壊れた受信を切り出す', () => {
    const a = encodeOsee({ id: 'pgmIndex', type: 'pus', value: [3] });
    const b = encodeOsee({ id: 'keyOnAir', type: 'pus', value: [1, true] });
    const both = new Uint8Array([0x00, 0x11, ...a, ...b]);
    const d = new OseeDecoder();
    expect(d.push(both.subarray(0, 9))).toEqual([]);
    expect(d.push(both.subarray(9))).toEqual([
      { id: 'pgmIndex', type: 'pus', value: [3] },
      { id: 'keyOnAir', type: 'pus', value: [1, true] },
    ]);
    const bad = encodeOsee({ id: 'pvwIndex', type: 'pus', value: [2] });
    bad[bad.length - 1] = (bad[bad.length - 1] ?? 0) ^ 0xff;
    expect(d.push(bad)).toEqual([]);
    expect(d.crcErrors).toBe(1);
    expect(d.push(fromHex(BUILD_INFO))).toEqual([{ id: 'buildInfo', type: 'get' }]);
  });

  it('受信 → 変数（番号つきは id_番号、真偽は 1 / 0）', () => {
    expect(oseeValues({ id: 'pgmIndex', type: 'pus', value: [4001] })).toEqual({ pgmIndex: '4001' });
    expect(oseeValues({ id: 'keyOnAir', type: 'pus', value: [0, true] })).toEqual({ keyOnAir_0: '1' });
    expect(oseeValues({ id: 'pgmTally', type: 'pus', value: [1, 3] })).toEqual({ pgmTally: '1,3' });
    expect(oseeValues({ id: 'shortName', type: 'res', value: [2, 'CAM 2'] })).toEqual({ shortName_2: 'CAM 2' });
  });

  it('命令の文字の読み取り', () => {
    expect(parseOseeText('{"id":"cutTransition","type":"set"}\n')).toEqual([{ id: 'cutTransition', type: 'set' }]);
    expect(() => parseOseeText('pgmIndex 1')).toThrow('命令の形が違います');
  });
});

describe('OSEE の定義', () => {
  const def = getDefinition('osee-gostream')!;
  const send = (id: string, o: Record<string, string | number>) => {
    const p = buildPayload(def, getActionDef('osee-gostream', id)!, o, withDefaults(def.configFields, {}));
    return p.kind === 'bytes' ? utf8Decode(p.bytes) : '';
  };

  it('動作の JSON', () => {
    expect(def.session).toBe('osee');
    expect(JSON.parse(send('pgm', { src: '4001' }))).toEqual({ id: 'pgmIndex', type: 'set', value: [4001] });
    expect(JSON.parse(send('cut', {}))).toEqual({ id: 'cutTransition', type: 'set' });
    expect(JSON.parse(send('key_on_air', { i: '0', on: 'true' }))).toEqual({ id: 'keyOnAir', type: 'set', value: [0, true] });
    expect(JSON.parse(send('dsk_on_air', { i: '1', on: '0' }))).toEqual({ id: 'dskOnAir', type: 'set', value: [1, 0] });
    expect(JSON.parse(send('transition_style', { style: '"Wipe"' }))).toEqual({ id: 'transitionStyle', type: 'set', value: ['Wipe'] });
    expect(JSON.parse(send('transition_rate', { kind: 'transitionDipRate', sec: 1.5 }))).toEqual({ id: 'transitionDipRate', type: 'set', value: [1.5] });
    expect(JSON.parse(send('macro_run', { i: 1 }))).toEqual({ id: 'macroRunStart', type: 'set', value: [0] });
    expect(JSON.parse(send('still_to_player', { p: '1', n: 3 }))).toEqual({ id: 'mediaPlayer', type: 'set', value: [1, 'Still', 2] });
    expect(JSON.parse(send('grab_still', {}))).toEqual({ id: 'grabStill', type: 'set', value: [] });
    expect(JSON.parse(send('ptz_move', { dir: '-9,0' }))).toEqual({ id: 'ptzPanTilt', type: 'set', value: [-9, 0] });
    // どの動作も既定値で JSON として読める
    for (const a of def.actions) {
      if (a.id === 'command') continue;
      expect(() => parseOseeText(send(a.id, withDefaults(a.options, {}) as Record<string, string | number>))).not.toThrow();
    }
  });

  it('状態表示と入力名', () => {
    const u = applyDerive(def.derive, { pgmIndex: '3', pvwIndex: '5001', keyOnAir_0: '1' });
    expect(u).toMatchObject({ pgm: '入力 3', pvw: 'マルチソース' });
    expect(checkFeedback(def.feedbacks.find((f) => f.id === 'pgm_is')!, { src: '3' }, u)).toBe(true);
    expect(checkFeedback(def.feedbacks.find((f) => f.id === 'key_on_air')!, { i: '0' }, u)).toBe(true);
  });
});

describe('OSEE の通信手順', () => {
  function fakeIO() {
    const written: Uint8Array[] = [];
    const values: Record<string, string> = {};
    const status: string[] = [];
    const io: SessionIO = {
      def: getDefinition('osee-gostream')!,
      config: { host: '192.0.2.50', port: 19010 },
      write: async (b) => {
        written.push(b);
      },
      setStatus: (s) => status.push(s),
      setValues: (u) => Object.assign(values, u),
      log: () => undefined,
      fail: () => undefined,
    };
    return { io, written, values, status };
  }

  it('つながったら状態を問い合わせ、送る命令に枠を付け、受信を変数にする', async () => {
    const f = fakeIO();
    const s = new OseeSession(f.io);
    s.ready();
    expect(f.status).toEqual(['connected']);
    const sync = new OseeDecoder().push(f.written[0]!);
    expect(sync.map((c) => c.id)).toEqual(expect.arrayContaining(['deviceType', 'pgmIndex', 'pvwIndex', 'keyOnAir']));
    const r = await s.send(new TextEncoder().encode('{"id":"pgmIndex","type":"set","value":[2]}'));
    expect(r).toEqual({ ok: true });
    expect(hex(f.written.at(-1)!)).toBe(hex(encodeOsee({ id: 'pgmIndex', type: 'set', value: [2] })));
    expect(await s.send(new TextEncoder().encode('not json'))).toMatchObject({ ok: false });
    s.data(encodeOsee({ id: 'pgmIndex', type: 'pus', value: [2] }));
    expect(f.values).toMatchObject({ pgmIndex: '2', pgm: '入力 2' });
    s.dispose();
  });
});
