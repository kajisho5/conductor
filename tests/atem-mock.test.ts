/** mock/atem.mjs を立てて、本物の UDP で ATEM の手順を通す */
import { spawn, type ChildProcess } from 'node:child_process';
import dgram from 'node:dgram';
import path from 'node:path';
import type { ConductorNet, ConductorNetEvents } from '../modules/conductor-net/src';
import { DeviceManager } from '@/engine/devices';
import { getActionDef, getDefinition } from '@/drivers/registry';
import { fromBase64, toBase64 } from '@/drivers/bytes';
import { newDevice } from '@/model/devices';
import { newShow } from '@/model/defaults';
import { useRuntimeStore } from '@/stores/runtime';

class UdpNet implements ConductorNet {
  private socks = new Map<string, dgram.Socket>();
  private l: { [K in keyof ConductorNetEvents]: ConductorNetEvents[K][] } = { onState: [], onData: [] };
  async open(id: string, _p: 'tcp' | 'udp', host: string, port: number) {
    const s = dgram.createSocket('udp4');
    this.socks.set(id, s);
    s.on('message', (m) => this.emit('onData', { id, base64: toBase64(new Uint8Array(m)) }));
    s.connect(port, host, () => this.emit('onState', { id, state: 'ready' }));
  }
  async send(id: string, base64: string) {
    const s = this.socks.get(id);
    if (!s) throw new Error('not open');
    await new Promise<void>((res, rej) => s.send(Buffer.from(fromBase64(base64)), (e) => (e ? rej(e) : res())));
  }
  async close(id: string) {
    this.socks.get(id)?.close();
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

describe('模擬 ATEM（mock/atem.mjs）と通す', () => {
  let child: ChildProcess;
  const PORT = 19910;
  beforeAll(async () => {
    child = spawn(process.execPath, [path.join(__dirname, '..', 'mock', 'atem.mjs'), '--port', String(PORT)], { stdio: 'pipe' });
    await new Promise<void>((res) => child.stdout!.on('data', (d: Buffer) => d.toString().includes('待ち受け') && res()));
  });
  afterAll(() => {
    child.kill();
  });

  it('接続 → 入力名・PGM・タリー → PGM を送って ack → 変化が届く', async () => {
    useRuntimeStore.setState({ deviceStatus: {}, deviceError: {}, deviceValues: {} });
    const net = new UdpNet();
    const m = new DeviceManager(() => net);
    const base = newDevice(getDefinition('atem')!, []);
    const d = { ...base, config: { host: '127.0.0.1', port: PORT } };
    const show = newShow('T');
    show.devices = [d];
    m.sync(show);
    try {
      await waitFor(() => useRuntimeStore.getState().deviceStatus[d.id] === 'connected');
      expect(useRuntimeStore.getState().deviceValues[d.id]).toMatchObject({
        model: 'DEMO ATEM',
        pgm: '1',
        pvw: '2',
        input_3_short: 'CAM3',
        tally_1: 'PGM',
      });
      expect(await m.send(d, getActionDef('atem', 'pgm')!, { input: '5', me: '0' })).toEqual({ ok: true });
      await waitFor(() => useRuntimeStore.getState().deviceValues[d.id]?.pgm === '5');
      expect(await m.send(d, getActionDef('atem', 'cut')!, { me: '0' })).toEqual({ ok: true });
      await waitFor(() => useRuntimeStore.getState().deviceValues[d.id]?.pgm === '2');
      expect(useRuntimeStore.getState().deviceValues[d.id]?.tally_2).toBe('PGM');
    } finally {
      m.stopAll();
      await net.closeAll();
    }
  });
});
