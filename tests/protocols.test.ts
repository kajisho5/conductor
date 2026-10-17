/**
 * Blackmagic の文字の手順（HyperDeck・Videohub）と VISCA over IP。資料の例と同じになるか。
 */
import { getActionDef, getDefinition } from '@/drivers/registry';
import { buildPayload, withDefaults, checkFeedback } from '@/drivers/engine';
import { utf8Decode } from '@/drivers/bytes';
import type { SessionIO } from '@/drivers/sessions';
import { blockValues, BmdTextSession } from '@/drivers/bmdText';
import { ViscaIpSession, wrapVisca } from '@/drivers/visca';

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0').toUpperCase()).join(' ');

function payload(defId: string, actionId: string, o: Record<string, string | number>) {
  const def = getDefinition(defId)!;
  const a = getActionDef(defId, actionId)!;
  const p = buildPayload(def, a, { ...withDefaults(a.options, {}), ...o }, withDefaults(def.configFields, {}));
  if (p.kind !== 'bytes') throw new Error('bytes ではない');
  return p.bytes;
}

function fakeIO(defId: string, config: Record<string, string | number> = {}) {
  const written: Uint8Array[] = [];
  const values: Record<string, string> = {};
  const io: SessionIO = {
    def: getDefinition(defId)!,
    config: { host: '192.0.2.60', ...config },
    write: async (b) => {
      written.push(b);
    },
    setStatus: () => undefined,
    setValues: (u) => Object.assign(values, u),
    log: () => undefined,
    fail: () => undefined,
  };
  return { io, written, values };
}

describe('HyperDeck', () => {
  it('命令（資料の書き方、LF 終端）', () => {
    expect(utf8Decode(payload('bmd-hyperdeck', 'play', {}))).toBe('play\n');
    expect(utf8Decode(payload('bmd-hyperdeck', 'play_speed', { speed: -200 }))).toBe('play: speed: -200\n');
    expect(utf8Decode(payload('bmd-hyperdeck', 'goto_clip', { clip: 3 }))).toBe('goto: clip id: 3\n');
    expect(utf8Decode(payload('bmd-hyperdeck', 'goto_clip_rel', { dir: '+1' }))).toBe('goto: clip id: +1\n');
    expect(utf8Decode(payload('bmd-hyperdeck', 'record_name', { name: 'DEMO-CLIP' }))).toBe('record: name: DEMO-CLIP\n');
  });
  it('返事・通知のブロック → 変数', () => {
    expect(blockValues('208 transport info:\nstatus: play\nspeed: 100\nclip id: 2\ntimecode: 00:00:01:00')).toMatchObject({
      transport_info_status: 'play',
      transport_info_speed: '100',
      transport_info_clip_id: '2',
      transport_info_timecode: '00:00:01:00',
    });
    const f = fakeIO('bmd-hyperdeck');
    const s = new BmdTextSession(f.io);
    s.ready();
    expect(f.written.map((b) => utf8Decode(b))).toContain('notify: transport: true');
    s.data(new TextEncoder().encode('500 connection info:\r\nprotocol version: 1.11\r\nmodel: DEMO-DECK\r\n\r\n508 transport info:\r\nstatus: rec'));
    s.data(new TextEncoder().encode('ord\r\n\r\n200 ok\r\n'));
    expect(f.values).toMatchObject({ connection_info_model: 'DEMO-DECK', transport_info_status: 'record', last_reply: '200 ok' });
    const fb = getDefinition('bmd-hyperdeck')!.feedbacks.find((x) => x.id === 'status')!;
    expect(checkFeedback(fb, { status: 'record' }, f.values)).toBe(true);
    s.dispose();
  });
});

describe('Videohub', () => {
  it('つなぎ替え（資料の例：出力 8 ← 入力 3 は 7 2）', () => {
    expect(utf8Decode(payload('bmd-videohub', 'route', { out: 8, in: 3 }))).toBe('VIDEO OUTPUT ROUTING:\n7 2\n\n');
    expect(utf8Decode(payload('bmd-videohub', 'output_label', { out: 7, name: 'DEMO OUT' }))).toBe('OUTPUT LABELS:\n6 DEMO OUT\n\n');
    expect(utf8Decode(payload('bmd-videohub', 'ping', {}))).toBe('PING:\n\n');
  });
  it('状態のブロック → 変数 → 状態表示', () => {
    const f = fakeIO('bmd-videohub');
    const s = new BmdTextSession(f.io);
    s.data(new TextEncoder().encode('VIDEO OUTPUT ROUTING:\n0 5\n7 2\n\nINPUT LABELS:\n0 DEMO CAM 1\n\nACK\n'));
    expect(f.values).toMatchObject({ video_output_routing_0: '5', video_output_routing_7: '2', input_labels_0: 'DEMO CAM 1', last_reply: 'ACK' });
    const fb = getDefinition('bmd-videohub')!.feedbacks.find((x) => x.id === 'routed')!;
    expect(checkFeedback(fb, { out: 8, in: 3 }, f.values)).toBe(true);
    expect(checkFeedback(fb, { out: 8, in: 4 }, f.values)).toBe(false);
  });
});

describe('VISCA over IP', () => {
  it('命令の中身（Sony の一覧と同じ）', () => {
    expect(hex(payload('visca-ip', 'move', { dir: 'left', pan: 24, tilt: 20 }))).toBe('81 01 06 01 18 14 01 03 FF');
    expect(hex(payload('visca-ip', 'stop', {}))).toBe('81 01 06 01 01 01 03 03 FF');
    expect(hex(payload('visca-ip', 'zoom_in', { speed: 7 }))).toBe('81 01 04 07 27 FF');
    expect(hex(payload('visca-ip', 'preset_recall', { n: 64 }))).toBe('81 01 04 3F 02 3F FF');
    expect(hex(payload('visca-ip', 'home', {}))).toBe('81 01 06 04 FF');
  });
  it('頭（種別・長さ・通し番号）と RESET', async () => {
    expect(hex(wrapVisca(Uint8Array.from([0x81, 0x01, 0x06, 0x04, 0xff]), 1))).toBe('01 00 00 05 00 00 00 01 81 01 06 04 FF');
    expect(hex(wrapVisca(Uint8Array.from([0x81, 0x09, 0x04, 0x47, 0xff]), 2)).slice(0, 5)).toBe('01 10');
    const f = fakeIO('visca-ip', { framing: 'sony' });
    const s = new ViscaIpSession(f.io);
    s.ready();
    expect(hex(f.written[0]!)).toBe('02 00 00 01 00 00 00 00 01');
    await s.send(Uint8Array.from([0x81, 0x01, 0x06, 0x04, 0xff]));
    await s.send(Uint8Array.from([0x81, 0x01, 0x06, 0x04, 0xff]));
    expect(hex(f.written[2]!).slice(12, 23)).toBe('00 00 00 02');
    expect(await s.send(Uint8Array.from([0x01, 0x02]))).toMatchObject({ ok: false });
    s.data(Uint8Array.from([0x01, 0x11, 0x00, 0x03, 0, 0, 0, 2, 0x90, 0x51, 0xff]));
    expect(f.values.last_reply).toBe('done');
    const raw = fakeIO('visca-ip', { framing: 'raw' });
    const r = new ViscaIpSession(raw.io);
    r.ready();
    await r.send(Uint8Array.from([0x81, 0x01, 0x06, 0x04, 0xff]));
    expect(raw.written.map(hex)).toEqual(['81 01 06 04 FF']);
  });
});

describe('OBS（obs-websocket 5）', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require('crypto') as typeof import('crypto');
  const { sha256, obsAuth, ObsSession } = require('@/drivers/obs') as typeof import('@/drivers/obs');
  const b64 = (s: string | Buffer) => nodeCrypto.createHash('sha256').update(s).digest('base64');

  it('SHA-256 と認証文字列（仕様の式）', () => {
    expect(hex(sha256(new TextEncoder().encode('abc'))).replace(/ /g, '')).toBe(
      'BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD',
    );
    const long = new TextEncoder().encode('x'.repeat(200));
    expect(Buffer.from(sha256(long)).toString('hex')).toBe(nodeCrypto.createHash('sha256').update('x'.repeat(200)).digest('hex'));
    expect(obsAuth('DEMO-PASS', 'DEMOSALT', 'DEMOCHALLENGE')).toBe(b64(b64('DEMO-PASSDEMOSALT') + 'DEMOCHALLENGE'));
  });

  it('Hello → Identify → Identified → Request、出来事を変数に', async () => {
    const f = fakeIO('obs-studio', { password: 'DEMO-PASS' });
    const s = new ObsSession(f.io);
    s.ready();
    expect(await s.send(new TextEncoder().encode('{"requestType":"StartStream"}'))).toMatchObject({ ok: false });
    s.data(new TextEncoder().encode(JSON.stringify({ op: 0, d: { rpcVersion: 1, authentication: { challenge: 'C1', salt: 'S1' } } })));
    const identify = JSON.parse(utf8Decode(f.written[0]!));
    expect(identify).toEqual({ op: 1, d: { rpcVersion: 1, authentication: obsAuth('DEMO-PASS', 'S1', 'C1') } });
    s.data(new TextEncoder().encode(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } })));
    const before = f.written.length;
    const a = getActionDef('obs-studio', 'program_scene')!;
    const p = buildPayload(getDefinition('obs-studio')!, a, { scene: 'DEMO SCENE' }, {});
    expect(await s.send(p.kind === 'bytes' ? p.bytes : new Uint8Array())).toEqual({ ok: true });
    const req = JSON.parse(utf8Decode(f.written[before]!));
    expect(req).toMatchObject({ op: 6, d: { requestType: 'SetCurrentProgramScene', requestData: { sceneName: 'DEMO SCENE' } } });
    expect(typeof req.d.requestId).toBe('string');
    s.data(new TextEncoder().encode(JSON.stringify({ op: 5, d: { eventType: 'CurrentProgramSceneChanged', eventData: { sceneName: 'DEMO SCENE' } } })));
    s.data(new TextEncoder().encode(JSON.stringify({ op: 5, d: { eventType: 'RecordStateChanged', eventData: { outputActive: true } } })));
    expect(f.values).toMatchObject({ program_scene: 'DEMO SCENE', recording: '1' });
    const fb = getDefinition('obs-studio')!.feedbacks.find((x) => x.id === 'program')!;
    expect(checkFeedback(fb, { scene: 'DEMO SCENE' }, f.values)).toBe(true);
  });
});

describe('ミキサー（OSC）', () => {
  it('X32：/ch/01/mix/on ,i 0（ミュート）、WING：/ch/1/mute ,i 1', () => {
    const osc = (defId: string, actionId: string, o: Record<string, string | number>) => utf8Decode(payload(defId, actionId, o));
    expect(osc('behringer-x32', 'ch_mute', { ch: 1, mute: '0' })).toContain('/ch/01/mix/on');
    expect(Array.from(payload('behringer-x32', 'ch_mute', { ch: 1, mute: '0' }).slice(-8))).toEqual([44, 105, 0, 0, 0, 0, 0, 0]);
    expect(osc('behringer-x32', 'scene', { n: 3 })).toContain('/-action/goscene');
    expect(osc('behringer-wing', 'ch_mute', { ch: 12, mute: '1' })).toContain('/ch/12/mute');
  });
});
