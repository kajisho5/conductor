import { interfaceLabel, lanAddresses, type ConductorNet, type ConductorNetEvents } from '../modules/conductor-net/src';
import { DeviceManager, RECONNECT_STEPS_MS } from '@/engine/devices';
import { getActionDef, getDefinition } from '@/drivers/registry';
import { newDevice } from '@/model/devices';
import { newShow } from '@/model/defaults';
import type { Device, Show } from '@/model/types';
import { fromBase64, toBase64, utf8Decode, utf8Encode } from '@/drivers/bytes';
import { useRuntimeStore } from '@/stores/runtime';

/** ネイティブの代わり：open を記録し、状態・受信を手で起こせる */
class FakeNet implements ConductorNet {
  opened: { id: string; proto: string; host: string; port: number; localPort: number }[] = [];
  sent: { id: string; data: string }[] = [];
  closed: string[] = [];
  failSend = false;
  private listeners: { [K in keyof ConductorNetEvents]: ConductorNetEvents[K][] } = { onState: [], onData: [] };
  async open(id: string, proto: 'tcp' | 'udp', host: string, port: number, localPort: number) {
    this.opened.push({ id, proto, host, port, localPort });
  }
  async send(id: string, base64: string) {
    if (this.failSend) throw new Error('broken pipe');
    this.sent.push({ id, data: utf8Decode(fromBase64(base64)) });
  }
  async close(id: string) {
    this.closed.push(id);
  }
  localAddresses() {
    return [];
  }
  async closeAll() {}
  addListener<K extends keyof ConductorNetEvents>(event: K, listener: ConductorNetEvents[K]) {
    this.listeners[event].push(listener);
    return { remove: () => undefined };
  }
  state(id: string, state: Parameters<ConductorNetEvents['onState']>[0]['state'], error?: string) {
    for (const l of this.listeners.onState) l({ id, state, error });
  }
  data(id: string, text: string) {
    for (const l of this.listeners.onData) l({ id, base64: toBase64(utf8Encode(text)) });
  }
  last() {
    return this.opened[this.opened.length - 1]!;
  }
}

function showWith(...devices: Device[]): Show {
  const s = newShow('T');
  s.devices = devices;
  return s;
}

function status(id: string) {
  return useRuntimeStore.getState().deviceStatus[id];
}

beforeEach(() => {
  useRuntimeStore.setState({ deviceStatus: {}, deviceError: {}, deviceValues: {} });
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

function tcpDevice(config: Record<string, string | number> = { host: '192.0.2.10', port: 9001 }): Device {
  const d = newDevice(getDefinition('generic-tcp')!, []);
  return { ...d, config: { ...d.config, ...config } };
}

describe('機器の接続', () => {
  it('TCP：接続 → 送信 → 受信で変数', async () => {
    const net = new FakeNet();
    const m = new DeviceManager(() => net);
    const d = tcpDevice();
    m.sync(showWith(d));
    expect(status(d.id)).toBe('connecting');
    const { id } = net.last();
    expect(net.last()).toMatchObject({ proto: 'tcp', host: '192.0.2.10', port: 9001 });
    net.state(id, 'ready');
    expect(status(d.id)).toBe('connected');
    const r = await m.send(d, getActionDef('generic-tcp', 'send')!, { data: 'PLAY' });
    expect(r).toEqual({ ok: true });
    expect(net.sent[0]).toEqual({ id, data: 'PLAY\r\n' });
    net.data(id, 'OK PLAY\r\n');
    expect(useRuntimeStore.getState().deviceValues[d.id]?.last_received).toBe('OK PLAY');
  });

  it('設定が足りない時は接続しない', () => {
    const net = new FakeNet();
    const m = new DeviceManager(() => net);
    const d = tcpDevice({ host: '' });
    m.sync(showWith(d));
    expect(status(d.id)).toBe('error');
    expect(useRuntimeStore.getState().deviceError[d.id]).toContain('IP アドレス');
    const d2 = tcpDevice({ port: 70000 });
    m.sync(showWith(d2));
    expect(status(d2.id)).toBe('error');
    expect(net.opened).toHaveLength(0);
  });

  it('通信モジュールが無い時はエラー', () => {
    const m = new DeviceManager(() => null);
    const d = tcpDevice();
    m.sync(showWith(d));
    expect(status(d.id)).toBe('error');
  });

  it('切れたら 1, 2, 4 … 秒で接続し直し、つながったら数え直す', () => {
    const net = new FakeNet();
    const m = new DeviceManager(() => net);
    const d = tcpDevice();
    m.sync(showWith(d));
    net.state(net.last().id, 'failed', 'refused');
    expect(status(d.id)).toBe('reconnecting');
    expect(net.opened).toHaveLength(1);
    jest.advanceTimersByTime(RECONNECT_STEPS_MS[0] - 1);
    expect(net.opened).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(net.opened).toHaveLength(2);
    net.state(net.last().id, 'closed');
    jest.advanceTimersByTime(RECONNECT_STEPS_MS[1]);
    expect(net.opened).toHaveLength(3);
    net.state(net.last().id, 'ready');
    expect(status(d.id)).toBe('connected');
    net.state(net.last().id, 'failed');
    jest.advanceTimersByTime(RECONNECT_STEPS_MS[0]);
    expect(net.opened).toHaveLength(4);
  });

  it('古い接続のイベントは無視する', () => {
    const net = new FakeNet();
    const m = new DeviceManager(() => net);
    const d = tcpDevice();
    m.sync(showWith(d));
    const old = net.last().id;
    m.sync(showWith({ ...d, config: { ...d.config, port: 9100 } }));
    expect(net.closed).toContain(old);
    net.state(old, 'ready');
    expect(status(d.id)).toBe('connecting');
    net.state(net.last().id, 'ready');
    expect(status(d.id)).toBe('connected');
  });

  it('無効にすると閉じ、削除すると忘れる', () => {
    const net = new FakeNet();
    const m = new DeviceManager(() => net);
    const d = tcpDevice();
    m.sync(showWith(d));
    net.state(net.last().id, 'ready');
    m.sync(showWith({ ...d, enabled: false }));
    expect(status(d.id)).toBe('disabled');
    expect(net.closed).toHaveLength(1);
    m.sync(showWith());
    expect(net.opened).toHaveLength(1);
  });

  it('裏に回ると閉じ、戻ると開き直す', () => {
    const net = new FakeNet();
    const m = new DeviceManager(() => net);
    const d = tcpDevice();
    const show = showWith(d);
    m.sync(show);
    net.state(net.last().id, 'ready');
    m.suspend();
    expect(net.closed).toHaveLength(1);
    expect(status(d.id)).toBe('reconnecting');
    net.state(net.opened[0]!.id, 'failed');
    jest.advanceTimersByTime(60000);
    expect(net.opened).toHaveLength(1);
    m.resume(show);
    expect(net.opened).toHaveLength(2);
  });

  it('送れなかった時・接続していない時', async () => {
    const net = new FakeNet();
    const m = new DeviceManager(() => net);
    const d = tcpDevice();
    m.sync(showWith(d));
    const a = getActionDef('generic-tcp', 'send')!;
    expect((await m.send(d, a, { data: 'X' })).ok).toBe(false);
    net.state(net.last().id, 'ready');
    net.failSend = true;
    expect(await m.send(d, a, { data: 'X' })).toEqual({ ok: false, reason: 'broken pipe' });
    net.failSend = false;
    expect(await m.send(d, getActionDef('generic-tcp', 'send_hex')!, { data: '' })).toEqual({ ok: false, reason: '送る内容が空です' });
    // 文字が空でも改行だけは送れる
    expect(await m.send(d, a, { data: '' })).toEqual({ ok: true });
  });

  it('UDP は受信ポートを渡す', () => {
    const net = new FakeNet();
    const m = new DeviceManager(() => net);
    const base = newDevice(getDefinition('generic-udp')!, []);
    const d = { ...base, config: { ...base.config, host: '192.0.2.20', localPort: 9200 } };
    m.sync(showWith(d));
    expect(net.last()).toMatchObject({ proto: 'udp', port: 9002, localPort: 9200 });
  });

  it('HTTP：2xx で送れた、それ以外は送れなかった、応答を変数へ', async () => {
    jest.useRealTimers();
    const calls: { url: string; init?: RequestInit }[] = [];
    let code = 200;
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return { status: code, text: async () => 'played' } as Response;
    }) as unknown as typeof fetch;
    const m = new DeviceManager(() => null, fakeFetch);
    const base = newDevice(getDefinition('generic-http')!, []);
    const d = { ...base, config: { baseUrl: 'http://192.0.2.30:8080' } };
    m.sync(showWith(d));
    expect(status(d.id)).toBe('connected');
    const a = getActionDef('generic-http', 'request')!;
    expect(await m.send(d, a, { method: 'POST', path: '/play', contentType: 'text/plain', body: 'go' })).toEqual({ ok: true });
    expect(calls[0]).toMatchObject({ url: 'http://192.0.2.30:8080/play', init: { method: 'POST', body: 'go' } });
    expect(useRuntimeStore.getState().deviceValues[d.id]).toEqual({ last_status: '200', last_body: 'played' });
    code = 500;
    expect(await m.send(d, a, { method: 'GET', path: '/x' })).toEqual({ ok: false, reason: '応答 500' });
  });
});

describe('この端末の IP', () => {
  test('LAN のアドレスだけ残し、名前を付ける', () => {
    const list = lanAddresses([
      { interface: 'en0', address: '192.168.10.20' },
      { interface: 'pdp_ip0', address: '10.1.2.3' },
      { interface: 'utun3', address: '10.8.0.2' },
      { interface: 'bridge100', address: '172.20.10.1' },
      { interface: 'en5', address: '192.168.0.50' },
    ]);
    expect(list.map((a) => a.address)).toEqual(['192.168.10.20', '172.20.10.1', '192.168.0.50']);
    expect(list.map((a) => interfaceLabel(a.interface))).toEqual(['Wi-Fi', 'インターネット共有', '有線 LAN']);
  });
});
