jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.6.0' } } }));

import { buildPayload, buildPayloads, renderTemplate } from '@/drivers/engine';
import { getDefinition, isRegistered, validateDefinition } from '@/drivers/registry';
import {
  ensureDefinition,
  fetchMissing,
  loadCached,
  parseCatalog,
  setFetcherForTesting,
  useCatalogStore,
  versionAtLeast,
} from '@/drivers/remote';
import type { DriverDefinition } from '@/drivers/types';
import { utf8Decode } from '@/drivers/bytes';

const demoDef = {
  format: 1,
  id: 'm-demo-sw-b',
  name: 'DEMO SW-B',
  category: 'DEMO',
  version: '1.0.0',
  minAppVersion: '0.1.0',
  transport: 'tcp',
  configFields: [
    { id: 'host', label: 'IP アドレス', type: 'text' },
    { id: 'port', label: 'ポート', type: 'number', default: 7000 },
  ],
  actions: [
    {
      id: 'route',
      name: 'Route',
      options: [
        { id: 'out', label: 'Output', type: 'number', default: 1 },
        { id: 'speed', label: 'Speed', type: 'number', default: 30 },
      ],
      send: { kind: 'bytes', data: 'X{{option.out|pad2}}:{{option.speed|lin:-1:100}}\\r', encoding: 'text' },
    },
    {
      id: 'mode',
      name: 'Mode',
      options: [
        {
          id: 'm',
          label: 'Mode',
          type: 'select',
          default: 'a',
          choices: [
            { id: 'a', label: 'Auto' },
            { id: 'b', label: 'Bypass' },
          ],
        },
      ],
      send: { kind: 'bytes', data: '02{{option.m|map}}03', encoding: 'hex' },
      maps: { m: { a: '41', b: '42' } },
    },
  ],
  feedbacks: [],
  variables: [],
  evidence: [{ title: '公開 OSS のモジュールから自動変換（MIT）', status: '推測' }],
};

function fakeFetch(files: Record<string, unknown>) {
  const calls: string[] = [];
  setFetcherForTesting(async (url: string) => {
    calls.push(url);
    const key = Object.keys(files).find((k) => url.endsWith(k));
    if (!key) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => JSON.stringify(files[key]) };
  });
  return calls;
}

afterEach(() => setFetcherForTesting(null));

describe('テンプレートのフィルタ（変換の仕組みと同じ規則）', () => {
  test('lin・pad・hexu・u16be・hexstr・map', () => {
    expect(renderTemplate('{{option.a|lin:-1:100|pad3}}', { option: { a: 37 } })).toBe('063');
    expect(renderTemplate('{{option.a|lin:0.01:0}}', { option: { a: 75 } })).toBe('0.75');
    expect(renderTemplate('{{option.a|hexu}}', { option: { a: 255 } })).toBe('FF');
    expect(renderTemplate('{{option.a|u16be}}', { option: { a: 258 } })).toBe('0102');
    expect(renderTemplate('{{option.a|pad2|hexstr}}', { option: { a: 5 } })).toBe('3035');
    expect(renderTemplate('{{option.m|map}}', { option: { m: 'b' }, maps: { m: { b: 'BYP' } } })).toBe('BYP');
    expect(renderTemplate('{{option.m|map}}', { option: { m: 'z' }, maps: { m: { b: 'BYP' } } })).toBe('');
  });

  test('動作の maps を使って送る内容を作る', () => {
    const def = validateDefinition(demoDef) as DriverDefinition;
    const route = def.actions[0]!;
    const p = buildPayload(def, route, { out: 3, speed: 30 }, {});
    expect(p.kind === 'bytes' && utf8Decode(p.bytes)).toBe('X03:70\r');
    const mode = def.actions[1]!;
    const q = buildPayload(def, mode, { m: 'b' }, {});
    expect(q.kind === 'bytes' && Array.from(q.bytes)).toEqual([2, 0x42, 3]);
  });

  test('maps の形が違えば通さない', () => {
    const bad = { ...demoDef, actions: [{ ...demoDef.actions[1], maps: { m: { a: 1 } } }] };
    expect(() => validateDefinition(bad)).toThrow();
  });
});

describe('配信の定義', () => {
  test('版の比べ方', () => {
    expect(versionAtLeast('0.6.0', '0.6.0')).toBe(true);
    expect(versionAtLeast('0.10.0', '0.9.9')).toBe(true);
    expect(versionAtLeast('0.5.9', '0.6.0')).toBe(false);
  });

  test('一覧のおかしな行と同梱の機器は捨てる', () => {
    const list = parseCatalog({
      format: 1,
      drivers: [
        { id: 'm-demo-sw-b', name: 'DEMO SW-B', category: 'DEMO', transport: 'tcp', version: '1.0.0', minAppVersion: '0.1.0', actions: 2, allActions: 3 },
        { id: 'BAD ID', name: 'x' },
        { id: 'atem', name: 'ATEM' },
      ],
    });
    expect(list.map((e) => e.id)).toEqual(['m-demo-sw-b']);
    expect(list[0]!.allActions).toBe(3);
    expect(() => parseCatalog({ format: 2, drivers: [] })).toThrow();
  });

  test('取ってきた定義を保存して使えるようにし、次の起動でも読める', async () => {
    const calls = fakeFetch({ '/defs/m-demo-sw-b.json': demoDef });
    expect(isRegistered('m-demo-sw-b')).toBe(false);
    const def = await ensureDefinition('m-demo-sw-b');
    expect(def.name).toBe('DEMO SW-B');
    expect(getDefinition('m-demo-sw-b')?.actions).toHaveLength(2);
    expect(calls).toHaveLength(1);
    // 2 回目は通信しない
    await ensureDefinition('m-demo-sw-b');
    expect(calls).toHaveLength(1);
    expect(useCatalogStore.getState().downloading['m-demo-sw-b']).toBeUndefined();
    // 保存したファイルから読み直せる
    loadCached();
    expect(isRegistered('m-demo-sw-b')).toBe(true);
  });

  test('id が違う・新しいアプリが要る定義は使わない', async () => {
    fakeFetch({ '/defs/m-other.json': { ...demoDef, id: 'm-x' }, '/defs/m-future.json': { ...demoDef, id: 'm-future', minAppVersion: '99.0.0' } });
    await expect(ensureDefinition('m-other')).rejects.toThrow('id');
    await expect(ensureDefinition('m-future')).rejects.toThrow('99.0.0');
    expect(isRegistered('m-future')).toBe(false);
  });

  test('ショーの機器で定義が無いものを取ってくる', async () => {
    fakeFetch({ '/defs/m-demo-sw-c.json': { ...demoDef, id: 'm-demo-sw-c' } });
    const n = await fetchMissing(['m-demo-sw-c', 'generic-tcp', 'internal', 'm-missing']);
    expect(n).toBe(1);
    expect(isRegistered('m-demo-sw-c')).toBe(true);
  });
});

describe('同梱の配信の定義', () => {
  test('同梱の定義は全部アプリの検証を通り、既定値で送る内容を作れる', () => {
    const defs = require('../src/drivers/remote-bundle/defs.json') as Record<string, unknown>;
    const ids = Object.keys(defs);
    expect(ids.length).toBeGreaterThan(100);
    let built = 0;
    for (const id of ids) {
      const def = validateDefinition(defs[id]);
      expect(def.id).toBe(id);
      for (const a of def.actions) {
        const opts: Record<string, string | number | boolean> = {};
        for (const f of a.options) opts[f.id] = f.default ?? (f.type === 'number' ? 1 : f.type === 'boolean' ? false : 'A');
        try {
          buildPayloads(def, a, opts, { baseUrl: 'http://192.168.0.10', host: '192.168.0.10', port: 9000 });
          built++;
        } catch {
          // 既定値が空で送れない動作もある（実際は入力してから送る）
        }
      }
    }
    expect(built).toBeGreaterThan(1000);
  });

  test('通信できなくても同梱の定義で機器を追加できる', async () => {
    setFetcherForTesting(async () => {
      throw new Error('offline');
    });
    const id = Object.keys(require('../src/drivers/remote-bundle/defs.json') as Record<string, unknown>)[0]!;
    const def = await ensureDefinition(id);
    expect(def.id).toBe(id);
    expect(isRegistered(id)).toBe(true);
  });
});
