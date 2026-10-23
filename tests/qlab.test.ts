/**
 * QLab 5（OSC）。アドレスが公式の OSC Dictionary v5 の形になるか。
 */
import { getActionDef, getDefinition } from '@/drivers/registry';
import { buildPayload, buildPayloads, withDefaults } from '@/drivers/engine';

const def = getDefinition('qlab')!;
function address(actionId: string, o: Record<string, string | number> = {}, config: Record<string, string> = {}) {
  const a = getActionDef('qlab', actionId)!;
  const p = buildPayload(def, a, { ...withDefaults(a.options, {}), ...o }, { ...withDefaults(def.configFields, {}), ...config });
  if (p.kind !== 'bytes') throw new Error('bytes ではない');
  const end = p.bytes.indexOf(0);
  return { address: new TextDecoder().decode(p.bytes.subarray(0, end)), bytes: p.bytes };
}

describe('QLab', () => {
  it('ワークスペースの指定あり・なし', () => {
    expect(address('go').address).toBe('/go');
    expect(address('go', {}, { prefix: '/workspace/DEMO-SHOW' }).address).toBe('/workspace/DEMO-SHOW/go');
    expect(address('cue_method', { cue: '12', method: 'start' }).address).toBe('/cue/12/start');
    expect(address('cue_method_special', { target: 'selected', method: 'stop' }).address).toBe('/cue/selected/stop');
    expect(address('playhead', { cue: '5' }).address).toBe('/playhead/5');
    expect(address('select_move', { to: 'next' }).address).toBe('/select/next');
  });

  it('GO の番号は文字で送る', () => {
    const { bytes } = address('go_cue', { cue: '3' });
    expect(new TextDecoder().decode(bytes)).toContain(',s');
  });

  it('どの動作も既定値で OSC になる', () => {
    for (const a of def.actions) expect(address(a.id).address.startsWith('/')).toBe(true);
  });
});

describe('ProPresenter', () => {
  const pp = getDefinition('propresenter')!;
  function req(actionId: string, o: Record<string, string | number> = {}) {
    const a = getActionDef('propresenter', actionId)!;
    const p = buildPayload(pp, a, { ...withDefaults(a.options, {}), ...o }, withDefaults(pp.configFields, {}));
    if (p.kind !== 'http') throw new Error('http ではない');
    return p;
  }
  it('API の URL と本文', () => {
    expect(req('next').url).toBe('http://192.168.0.10:50001/v1/trigger/next');
    expect(req('pres_index', { which: 'active', index: 3 }).url).toBe('http://192.168.0.10:50001/v1/presentation/active/3/trigger');
    expect(req('clear_layer', { layer: 'slide' }).url).toContain('/v1/clear/layer/slide');
    expect(req('macro', { id: 'DEMO MACRO' }).url).toContain('/v1/macro/DEMO%20MACRO/trigger');
    const st = req('stage_message', { text: 'DEMO' });
    expect([st.method, st.body, st.headers['Content-Type']]).toEqual(['PUT', '"DEMO"', 'application/json']);
    expect(req('stage_message_clear').method).toBe('DELETE');
    expect(JSON.parse(req('message_text', { id: '1', token: 'Name', text: 'DEMO' }).body!)).toEqual([{ name: 'Name', text: { text: 'DEMO' } }]);
    for (const a of pp.actions) expect(req(a.id).url).toMatch(/^http:\/\/192\.168\.0\.10:50001\/v1\/\S*$/);
  });
});

describe('Resolume', () => {
  const rs = getDefinition('resolume')!;
  it('アドレスと「押して離す」', () => {
    const a = getActionDef('resolume', 'clip_connect')!;
    const ps = buildPayloads(rs, a, { ...withDefaults(a.options, {}), layer: 2, column: 5 }, withDefaults(rs.configFields, {}));
    expect(ps).toHaveLength(2);
    const addr = (b: Uint8Array) => new TextDecoder().decode(b.subarray(0, b.indexOf(0)));
    const bytesOf = (p: (typeof ps)[number]) => (p.kind === 'bytes' ? p.bytes : new Uint8Array());
    expect(addr(bytesOf(ps[0]!))).toBe('/composition/layers/2/clips/5/connect');
    expect(Array.from(bytesOf(ps[0]!).subarray(-4))).toEqual([0, 0, 0, 1]);
    expect(Array.from(bytesOf(ps[1]!).subarray(-4))).toEqual([0, 0, 0, 0]);
    for (const x of rs.actions) {
      const p = buildPayloads(rs, x, withDefaults(x.options, {}), withDefaults(rs.configFields, {}));
      expect(addr(bytesOf(p[0]!)).startsWith('/composition/')).toBe(true);
    }
  });
});
