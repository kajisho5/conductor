/**
 * Roland LAN の通信手順。前半は部品の単体テスト、後半は mock/roland.mjs を立てて本物の TCP で通す。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import type { ConductorNet, ConductorNetEvents } from '../modules/conductor-net/src';
import { DeviceManager } from '@/engine/devices';
import { expandDth, nextRolandAddr, RolandLanParser } from '@/drivers/sessions';
import { getActionDef, getDefinition } from '@/drivers/registry';
import { applyDerive, buildPayload, checkFeedback, withDefaults } from '@/drivers/engine';
import { utf8Decode } from '@/drivers/bytes';
import { newDevice } from '@/model/devices';
import { newShow } from '@/model/defaults';
import { useRuntimeStore } from '@/stores/runtime';
import { fromBase64, toBase64 } from '@/drivers/bytes';

describe('受信の切り出し（crosspoint SPEC 3-4 の必須ケース）', () => {
  const run = (chunks: string[]) => {
    const p = new RolandLanParser();
    return chunks.flatMap((c) => p.feed(c)).map((t) => (t.kind === 'ack' ? 'ACK' : t.text));
  };
  it.each([
    [['Enter pass', 'word:'], ['Enter password:']],
    [['Welcome to V', '-160HD.'], ['Welcome to V-160HD.']],
    [['DTH:002100,01;Enter password:'], ['DTH:002100,01', 'Enter password:']],
    [['DTH:002100,01;DTH:002101,02;Welcome to V-160HD.'], ['DTH:002100,01', 'DTH:002101,02', 'Welcome to V-160HD.']],
    [['VER:V-160HD,1.04\nEnter password:'], ['VER:V-160HD,1.04', 'Enter password:']],
    [['\x06DTH:0C0000,0102;'], ['ACK', 'DTH:0C0000,0102']],
    [['\x02ACK;\x02DTH:001500,29;'], ['ACK', 'DTH:001500,29']],
    [['Welcome to V-', '80HD.'], ['Welcome to V-80HD.']],
    [['\xff\xfb\x01DTH:002100,20;'], ['DTH:002100,20']],
  ])('%j', (chunks, expected) => {
    expect(run(chunks)).toEqual(expected);
  });
});

describe('DTH の展開と派生の変数', () => {
  it('7 ビットで繰り上がる', () => {
    expect(nextRolandAddr(0x00217f).toString(16)).toBe('2200');
    expect(nextRolandAddr(0x007f7f).toString(16)).toBe('10000');
  });
  it('複数バイトを 1 バイトずつ', () => {
    expect(expandDth('DTH:002100,2022')).toEqual({ addr_002100: '20', addr_002101: '22' });
    expect(expandDth('VER:x')).toBeNull();
  });
  it('V-160HD：PGM・PST・タリー', () => {
    const def = getDefinition('roland-v160hd')!;
    const tally = '00'.repeat(32) + '01' + '02' + '00'.repeat(8);
    const u = applyDerive(def.derive, { ...expandDth('DTH:002100,2022')!, ...expandDth(`DTH:0C0000,${tally}`)! });
    expect(u).toMatchObject({ pgm: '1', pst: '3', tally_1: 'PGM', tally_2: 'PST', tally_3: 'OFF' });
    const fb = def.feedbacks.find((f) => f.id === 'tally')!;
    expect(checkFeedback(fb, { input: '1', state: 'PGM' }, u)).toBe(true);
    expect(checkFeedback(fb, { input: '2', state: 'PGM' }, u)).toBe(false);
    expect(
      checkFeedback(
        def.feedbacks.find((f) => f.id === 'pgm_is')!,
        { input: '1' },
        u,
      ),
    ).toBe(true);
  });
  it('送る内容：PGM INPUT 3 は 22（0x1F+3）、LF 終端', () => {
    const def = getDefinition('roland-v160hd')!;
    const a = getActionDef('roland-v160hd', 'pgm')!;
    const p = buildPayload(def, a, { input: '22' }, withDefaults(def.configFields, {}));
    expect(p.kind === 'bytes' && utf8Decode(p.bytes)).toBe('DTH:002100,22;\n');
    expect(a.options[0]!.choices![2]).toEqual({ id: '22', label: 'INPUT 3' });
  });
  it('V-160HD の増やした動作（公式のアドレスマップ・2 バイトの値）', () => {
    const def = getDefinition('roland-v160hd')!;
    const send = (id: string, o: Record<string, string | number>) => {
      const p = buildPayload(def, getActionDef('roland-v160hd', id)!, o, withDefaults(def.configFields, {}));
      return p.kind === 'bytes' ? utf8Decode(p.bytes) : '';
    };
    expect(def.actions.length).toBeGreaterThanOrEqual(75);
    // 資料の例：-100.0% → 78H 18H、+100.0% → 07H 68H、0 → 00H 00H
    expect(send('x_pinp_position_h', { pinp: '1B', v: -100 })).toBe('DTH:001B04,7818;\n');
    expect(send('x_pinp_position_h', { pinp: '1C', v: 100 })).toBe('DTH:001C04,0768;\n');
    expect(send('x_pinp_position_v', { pinp: '1E', v: 0 })).toBe('DTH:001E06,0000;\n');
    // -50.0% → 7CH 0CH、+50.0% → 03H 74H、ズーム 400% → 03H 10H
    expect(send('x_pinp_view_h', { pinp: '1B', v: -50 })).toBe('DTH:001B11,7C0C;\n');
    expect(send('x_pinp_view_v', { pinp: '1B', v: 50 })).toBe('DTH:001B13,0374;\n');
    expect(send('x_pinp_view_zoom', { pinp: '1B', v: 400 })).toBe('DTH:001B15,0310;\n');
    expect(send('x_pinp_size', { pinp: '1B', v: 50.5 })).toBe('DTH:001B08,0379;\n');
    expect(send('x_key_level', { pinp: '1B', v: 255 })).toBe('DTH:001B17,017F;\n');
    // 1 バイトの符号付き：-30 → 62H、+30 → 1EH
    expect(send('x_chroma_hue_width', { pinp: '1B', v: -30 })).toBe('DTH:001B1E,62;\n');
    expect(send('x_chroma_hue_width', { pinp: '1B', v: 30 })).toBe('DTH:001B1E,1E;\n');
    expect(send('x_wipe_direction', { dir: '02' })).toBe('DTH:001803,02;\n');
    expect(send('x_cam_pan_left', { cam: '43' })).toBe('DTH:024322,7F;\n');
    expect(send('x_cam_pt_speed', { cam: '41', v: 24 })).toBe('DTH:024124,18;\n');
    // 公開 OSS から変換した動作（LF は 1 つ）
    expect(send('x_freezeSwitchOn', {})).toBe('DTH:020500,01;\n');
    expect(send('x_save_memory_trigger', { memory: '0' })).toMatch(/^DTH:0A0001,[0-9A-F]{2};\n$/);
    // 名前は日本語、id は重複なし
    expect(new Set(def.actions.map((a) => a.id)).size).toBe(def.actions.length);
    for (const a of def.actions) expect(a.name).toMatch(/[ぁ-んァ-ン一-龥]|^(CUT|AUTO)$/);
  });
  it('V-80HD・VR-120HD の入力の値', () => {
    expect(getActionDef('roland-v80hd', 'pgm')!.options[0]!.choices![0]!.id).toBe('29');
    expect(getActionDef('roland-vr120hd', 'pgm')!.options[0]!.choices![0]!.id).toBe('1D');
    expect(getActionDef('roland-v80hd', 'cut')!.send).toMatchObject({ data: 'CUT;' });
  });
});

/** Node の net で ConductorNet を作る（テスト用。アプリでは Swift の Network.framework） */
class NodeNet implements ConductorNet {
  private socks = new Map<string, net.Socket>();
  private l: { [K in keyof ConductorNetEvents]: ConductorNetEvents[K][] } = { onState: [], onData: [] };
  async open(id: string, _proto: 'tcp' | 'udp', host: string, port: number) {
    const s = net.connect(port, host);
    this.socks.set(id, s);
    this.emit('onState', { id, state: 'connecting' });
    s.on('connect', () => this.emit('onState', { id, state: 'ready' }));
    s.on('data', (d) => this.emit('onData', { id, base64: toBase64(new Uint8Array(d as Buffer)) }));
    s.on('close', () => this.emit('onState', { id, state: 'closed' }));
    s.on('error', (e) => this.emit('onState', { id, state: 'failed', error: e.message }));
  }
  async send(id: string, base64: string) {
    const s = this.socks.get(id);
    if (!s) throw new Error('not open');
    await new Promise<void>((res, rej) => s.write(Buffer.from(fromBase64(base64)), (e) => (e ? rej(e) : res())));
  }
  async close(id: string) {
    this.socks.get(id)?.destroy();
    this.socks.delete(id);
  }
  localAddresses() {
    return [];
  }
  async closeAll() {
    for (const id of [...this.socks.keys()]) await this.close(id);
  }
  addListener<K extends keyof ConductorNetEvents>(event: K, listener: ConductorNetEvents[K]) {
    this.l[event].push(listener);
    return { remove: () => undefined };
  }
  private emit<K extends keyof ConductorNetEvents>(event: K, ev: Parameters<ConductorNetEvents[K]>[0]) {
    for (const fn of this.l[event]) (fn as (e: typeof ev) => void)(ev);
  }
}

async function waitFor(cond: () => boolean, ms = 4000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('模擬機器（mock/roland.mjs）と通す', () => {
  let child: ChildProcess;
  const PORT = 18023;
  beforeAll(async () => {
    child = spawn(process.execPath, [path.join(__dirname, '..', 'mock', 'roland.mjs'), '--port', String(PORT), '--password', '1234'], {
      stdio: 'pipe',
    });
    await new Promise<void>((res) => child.stdout!.on('data', (d: Buffer) => d.toString().includes('待ち受け') && res()));
  });
  afterAll(() => {
    child.kill();
  });

  it('認証 → 状態の取得 → PGM を送って ack → 自発通知で PGM・タリーが変わる', async () => {
    useRuntimeStore.setState({ deviceStatus: {}, deviceError: {}, deviceValues: {} });
    const nodeNet = new NodeNet();
    const m = new DeviceManager(() => nodeNet);
    const base = newDevice(getDefinition('roland-v160hd')!, []);
    const d = { ...base, config: { ...base.config, host: '127.0.0.1', port: PORT, password: '1234' } };
    const show = newShow('T');
    show.devices = [d];
    m.sync(show);
    try {
      await waitFor(() => useRuntimeStore.getState().deviceStatus[d.id] === 'connected');
      await waitFor(() => useRuntimeStore.getState().deviceValues[d.id]?.tally_2 === 'PST');
      expect(useRuntimeStore.getState().deviceValues[d.id]).toMatchObject({ model: 'V-160HD', pgm: '1', pst: '2', tally_1: 'PGM' });

      const r = await m.send(d, getActionDef('roland-v160hd', 'pgm')!, { input: '23' });
      expect(r).toEqual({ ok: true });
      await waitFor(() => useRuntimeStore.getState().deviceValues[d.id]?.pgm === '4');
      await waitFor(() => useRuntimeStore.getState().deviceValues[d.id]?.tally_4 === 'PGM');

      // 知らない命令は ERR:0 → 送れなかった
      const bad = await m.send(d, getActionDef('roland-v160hd', 'command')!, { cmd: 'NOPE;' });
      expect(bad).toEqual({ ok: false, reason: '命令の形が正しくありません（ERR:0）' });
    } finally {
      m.stopAll();
      await nodeNet.closeAll();
    }
  });

  it('パスワード違いは接続し直しになる', async () => {
    useRuntimeStore.setState({ deviceStatus: {}, deviceError: {}, deviceValues: {} });
    const nodeNet = new NodeNet();
    const m = new DeviceManager(() => nodeNet);
    const base = newDevice(getDefinition('roland-v160hd')!, []);
    const d = { ...base, config: { ...base.config, host: '127.0.0.1', port: PORT, password: '9999' } };
    const show = newShow('T');
    show.devices = [d];
    m.sync(show);
    try {
      await waitFor(() => useRuntimeStore.getState().deviceStatus[d.id] === 'reconnecting');
      expect(useRuntimeStore.getState().deviceStatus[d.id]).not.toBe('connected');
    } finally {
      m.stopAll();
      await nodeNet.closeAll();
    }
  });
});
