/**
 * vMix（TCP API）。命令の形と受信の解析が公式ヘルプの例と同じになるか。
 */
import { getActionDef, getDefinition } from '@/drivers/registry';
import { buildPayload, withDefaults, checkFeedback, ReceiveParser } from '@/drivers/engine';
import { utf8Decode } from '@/drivers/bytes';

const def = getDefinition('vmix')!;
function line(actionId: string, o: Record<string, string | number> = {}) {
  const a = getActionDef('vmix', actionId)!;
  const p = buildPayload(def, a, { ...withDefaults(a.options, {}), ...o }, withDefaults(def.configFields, {}));
  if (p.kind !== 'bytes') throw new Error('bytes ではない');
  return utf8Decode(p.bytes);
}

describe('vMix の命令', () => {
  it('FUNCTION の形（ヘルプの例）', () => {
    expect(line('preview', { input: '5' })).toBe('FUNCTION PreviewInput Input=5&Mix=0\r\n');
    expect(line('set_text', { input: '3', name: 'Headline', value: 'Hello world' })).toBe(
      'FUNCTION SetText Input=3&SelectedName=Headline&Value=Hello%20world\r\n',
    );
    expect(line('cut')).toBe('FUNCTION Cut Mix=0\r\n');
    expect(line('ftb')).toBe('FUNCTION FadeToBlack\r\n');
    expect(line('overlay', { overlay: '2', how: 'In', input: 'DEMO-CAM' })).toBe('FUNCTION OverlayInput2In Input=DEMO-CAM\r\n');
    expect(line('streaming', { how: 'Start', stream: '' })).toBe('FUNCTION StartStreaming Value=\r\n');
    expect(line('volume_fade', { input: '1', volume: 50, duration: 2000 })).toBe('FUNCTION SetVolumeFade Input=1&Value=50,2000\r\n');
    expect(line('bus_volume', { bus: 'C', value: 80 })).toBe('FUNCTION SetBusCVolume Value=80\r\n');
    expect(line('transition_effect', { effect: 'Zoom', duration: 500, input: '', mix: '0' })).toBe('FUNCTION Zoom Duration=500&Input=&Mix=0\r\n');
  });

  it('どの動作も既定値で 1 行の命令になる', () => {
    expect(def.actions.length).toBeGreaterThanOrEqual(90);
    for (const a of def.actions) {
      const s = line(a.id);
      expect(s.endsWith('\r\n')).toBe(true);
      expect(s.slice(0, -2)).not.toMatch(/[\r\n]|\{\{/);
    }
  });
});

describe('vMix の受信', () => {
  it('TALLY と ACTS を変数へ', () => {
    const p = new ReceiveParser(def);
    const { updates } = p.feed(
      new TextEncoder().encode('TALLY OK 0121\r\nACTS OK Input 3 1\r\nACTS OK InputPreview 2 1\r\nACTS OK InputAudio 4 0\r\nACTS OK Recording 1\r\nACTS OK InputVolume 1 0.5\r\nACTS OK Overlay1 3 1\r\n'),
    );
    expect(updates).toMatchObject({
      tally_1: '0',
      tally_2: '1',
      tally_3: '2',
      tally_4: '1',
      program: '3',
      preview: '2',
      act_InputAudio_4: '0',
      act_Recording: '1',
      act_InputVolume_1: '0.5',
      act_Overlay1_3: '1',
    });
    expect(updates.tally_5).toBeUndefined();
    const fb = (id: string, o: Record<string, string | number>) => checkFeedback(def.feedbacks.find((f) => f.id === id)!, o, updates);
    expect(fb('program_is', { input: 2 })).toBe(true);
    expect(fb('preview_is', { input: 3 })).toBe(true);
    expect(fb('recording', {})).toBe(true);
    expect(fb('input_audio', { input: 4 })).toBe(false);
    expect(fb('overlay_on', { overlay: '1', input: 3 })).toBe(true);
  });
});
