/**
 * Yamaha（RCP・OSC）。RCP の 1 行は公開 OSS の送信の形、OSC は公式資料の例と同じになるか。
 */
import { getActionDef, getDefinition } from '@/drivers/registry';
import { buildPayload, withDefaults } from '@/drivers/engine';
import { utf8Decode } from '@/drivers/bytes';

function bytes(defId: string, actionId: string, o: Record<string, string | number> = {}) {
  const d = getDefinition(defId)!;
  const a = getActionDef(defId, actionId)!;
  const p = buildPayload(d, a, { ...withDefaults(a.options, {}), ...o }, withDefaults(d.configFields, {}));
  if (p.kind !== 'bytes') throw new Error('bytes ではない');
  return p.bytes;
}

describe('Yamaha RCP', () => {
  it('set の 1 行（X・Y は 0 から、dB × 100）', () => {
    expect(utf8Decode(bytes('yamaha-rcp', 'InCh_on', { n: 1, on: '0' }))).toBe('set MIXER:Current/InCh/Fader/On 0 0 0\n');
    expect(utf8Decode(bytes('yamaha-rcp', 'InCh_level', { n: 3, db: -10 }))).toBe('set MIXER:Current/InCh/Fader/Level 2 0 -1000\n');
    expect(utf8Decode(bytes('yamaha-rcp', 'Mix_off', { n: 2 }))).toBe('set MIXER:Current/Mix/Fader/Level 1 0 -32768\n');
    expect(utf8Decode(bytes('yamaha-rcp', 'InCh_tomix_level', { n: 1, mix: 4, db: 0 }))).toBe('set MIXER:Current/InCh/ToMix/Level 0 3 0\n');
    expect(utf8Decode(bytes('yamaha-rcp', 'DCA_name', { n: 1, name: 'VOX' }))).toBe('set MIXER:Current/DCA/Label/Name 0 0 "VOX"\n');
    expect(utf8Decode(bytes('yamaha-rcp', 'scene_recall', { scene: 5 }))).toBe('ssrecall_ex MIXER:Lib/Scene 5\n');
    for (const a of getDefinition('yamaha-rcp')!.actions) expect(utf8Decode(bytes('yamaha-rcp', a.id))).toMatch(/^[a-z_]+ \S.*\n$/);
  });
});

describe('Yamaha OSC', () => {
  it('資料の例 /yosc:req/set/MIXER:Current/InCh/Fader/Level/1/1 -32768', () => {
    const b = bytes('yamaha-osc', 'InCh_off', { n: 1 });
    const end = b.indexOf(0);
    expect(new TextDecoder().decode(b.subarray(0, end))).toBe('/yosc:req/set/MIXER:Current/InCh/Fader/Level/1/1');
    expect(Array.from(b.subarray(-4))).toEqual([0xff, 0xff, 0x80, 0x00]);
    for (const a of getDefinition('yamaha-osc')!.actions) expect(bytes('yamaha-osc', a.id)[0]).toBe(0x2f);
  });
});
