/**
 * QLab 5（OSC）。アドレスが公式の OSC Dictionary v5 の形になるか。
 */
import { getActionDef, getDefinition } from '@/drivers/registry';
import { buildPayload, withDefaults } from '@/drivers/engine';

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
